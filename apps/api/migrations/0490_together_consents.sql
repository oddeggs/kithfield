-- Asks to take a together sticker out of Kithfield: one row per friend in it (the subject) and
-- per person asking, made the first time that person asks and never reset. ok: NULL until the
-- subject answers, then 1 (yes) or 0 (no); the asker is only ever told who said yes.
-- farm_id is the farm the first ask came from. Person ids carry no foreign key, as elsewhere.
CREATE TABLE together_consents (
  subject_id TEXT NOT NULL,
  asker_id TEXT NOT NULL,
  farm_id TEXT NOT NULL,
  ok INTEGER CHECK (ok IN (0, 1)),
  asked_at INTEGER NOT NULL,
  answered_at INTEGER,
  PRIMARY KEY (subject_id, asker_id)
);
CREATE INDEX together_consents_by_asker ON together_consents (asker_id);
