-- The safety desk: reports, the moderators who handle them, their decisions, appeals, the notes
-- people hear back through, and the append-only audit log. Person and farm ids carry no foreign
-- key: a report outlives the account or farm it names until its own retention ends.

-- Moderators are recorded the first time Cloudflare Access lets them in.
-- role: moderator | senior (bans, legal escalation) | legal.
CREATE TABLE moderators (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('moderator', 'senior', 'legal')),
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- One case per reported item: every member who reports the same message (or the same person on
-- the same farm) while it is open joins it as a filing. `seq` is null for a report about a person.
-- `context_json` holds the reported event and up to 20 around it, copied at report time so the
-- evidence survives an unsend; it is cleared 90 days after `closed_at`.
-- status: open | claimed | actioned | dismissed | escalated. source: member | link_reputation |
-- hash_match. `suggested_rule` and `excerpt` are derived when the report is made.
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL,
  reported_id TEXT NOT NULL,
  seq INTEGER,
  kind TEXT,
  event_at INTEGER,
  category TEXT NOT NULL,
  urgent INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'claimed', 'actioned', 'dismissed', 'escalated')),
  claimed_by TEXT,
  aimed_at TEXT,
  suggested_rule TEXT,
  excerpt TEXT,
  context_json TEXT,
  received_at INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  first_action_at INTEGER,
  closed_at INTEGER
);
CREATE INDEX reports_queue ON reports (urgent DESC, received_at, id) WHERE closed_at IS NULL;
CREATE INDEX reports_by_reported ON reports (reported_id, received_at);
CREATE INDEX reports_closed ON reports (closed_at) WHERE context_json IS NOT NULL;
CREATE UNIQUE INDEX reports_open_item ON reports (farm_id, reported_id, IFNULL(seq, 0))
  WHERE closed_at IS NULL;

-- Each member's report of a case. The reported person never learns who.
-- reason: unkind | unwanted_contact | spam | something_else.
CREATE TABLE report_filings (
  report_id TEXT NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  also_block INTEGER NOT NULL DEFAULT 0,
  filed_at INTEGER NOT NULL,
  PRIMARY KEY (report_id, reporter_id)
);
CREATE INDEX report_filings_by_reporter ON report_filings (reporter_id);

-- Every decision. `rule` is the RuleRef as JSON. Removal from Kithfield waits for a second
-- moderator (`awaiting_second`, then `approved_by`). An appeal that undoes it sets `undone`.
-- `removed_event` is 1 when the decision took down the reported event; `paused_until` is set
-- for a pause.
CREATE TABLE moderation_actions (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  moderator_id TEXT NOT NULL,
  action TEXT NOT NULL,
  rule TEXT,
  note TEXT NOT NULL,
  tell_reporters INTEGER NOT NULL,
  tell_member INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('applied', 'awaiting_second', 'undone')),
  approved_by TEXT,
  person_id TEXT NOT NULL,
  farm_id TEXT NOT NULL,
  removed_event INTEGER NOT NULL DEFAULT 0,
  paused_until INTEGER,
  created_at INTEGER NOT NULL,
  applied_at INTEGER
);
CREATE INDEX moderation_actions_by_report ON moderation_actions (report_id, created_at);
CREATE INDEX moderation_actions_by_person ON moderation_actions (person_id, created_at);

-- A member asking for another look at a decision about them. The reviewer is never someone who
-- touched the report. status: open | kept | undone.
CREATE TABLE appeals (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  action_id TEXT NOT NULL UNIQUE REFERENCES moderation_actions (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'kept', 'undone')),
  reviewer_id TEXT,
  reply TEXT,
  sent_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX appeals_by_status ON appeals (status, sent_at);
CREATE INDEX appeals_by_person ON appeals (person_id);

-- The quiet notes from the safety team (`SafetyNote` as JSON), read in the app.
CREATE TABLE safety_notes (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  note_json TEXT NOT NULL
);
CREATE INDEX safety_notes_by_person ON safety_notes (person_id, at);

-- Every look and every decision. Append-only: rows are never changed or deleted.
-- `moderator_id` is null for the system (hash matches). `rule` is the RuleRef as JSON.
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  moderator_id TEXT,
  what TEXT NOT NULL,
  item TEXT NOT NULL,
  rule TEXT,
  reason TEXT
);
CREATE INDEX audit_log_by_time ON audit_log (at DESC);
CREATE INDEX audit_log_by_item ON audit_log (item);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'the audit log is append-only');
END;

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'the audit log is append-only');
END;
