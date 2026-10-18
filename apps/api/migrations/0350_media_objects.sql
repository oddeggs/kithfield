-- The media index: one row for every object an upload URL was handed out for. R2 keys are
-- `farm/<farm>/<uuid>`, so a farm's media can be listed by prefix, but a person's can't: this table
-- is how account deletion finds what someone uploaded, and how a quarantine is remembered.
-- Never content: a key, who uploaded it where, its declared type and size.
CREATE TABLE media_objects (
  key TEXT PRIMARY KEY NOT NULL,
  farm_id TEXT NOT NULL,
  -- Null only for an object quarantined without an upload row (uploaded before the index).
  person_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video', 'voice', 'file')),
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  -- A multipart upload's id until it completes.
  upload_id TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  -- Set when the object is quarantined: reads stop and the evidence is held apart.
  quarantined_at INTEGER,
  quarantined_by TEXT,
  quarantine_note TEXT,
  -- The urgent report opened for the quarantine, once the reports desk has it.
  report_id TEXT
);

CREATE INDEX media_objects_person ON media_objects (person_id);
CREATE INDEX media_objects_farm ON media_objects (farm_id);
