-- Every push decision and send, for the person's own record and for support. Kinds and ids only,
-- never content. Rows go with the person when their account is deleted.
CREATE TABLE push_ledger (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  -- The event kind or nudge kind the push is about.
  kind TEXT NOT NULL,
  farm_id TEXT,
  seq INTEGER,
  collapse_key TEXT NOT NULL,
  -- queued | held | skipped | collapsed | sent | failed
  decision TEXT NOT NULL,
  -- Why: muted, hibernating, connected, quiet_hours, budget, backed_off, nudges_off, no_device,
  -- DeviceNotRegistered and the other Expo errors.
  reason TEXT,
  -- How many pushes were folded into this one (0 when it went out as itself).
  collapsed INTEGER NOT NULL DEFAULT 0,
  device_id TEXT,
  -- Expo's push ticket, and its receipt once checked: ok or the error.
  ticket_id TEXT,
  receipt TEXT,
  at INTEGER NOT NULL,
  sent_at INTEGER
);

CREATE INDEX push_ledger_person_at ON push_ledger (person_id, at);
CREATE INDEX push_ledger_ticket ON push_ledger (ticket_id) WHERE ticket_id IS NOT NULL;
