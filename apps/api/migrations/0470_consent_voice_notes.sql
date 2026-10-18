-- Voice notes join the AI features a person answers for (`voice_notes`: their own voice notes,
-- captioned and translated when a friend asks). SQLite can't widen a CHECK in place, so the table
-- is rebuilt with every answer kept as it was.
PRAGMA defer_foreign_keys = true;

CREATE TABLE consents_widened (
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  feature TEXT NOT NULL CHECK (feature IN ('captions', 'recap', 'voice_notes')),
  allowed INTEGER NOT NULL,
  text_version TEXT NOT NULL,
  at INTEGER NOT NULL,
  forgotten_at INTEGER,
  PRIMARY KEY (person_id, feature)
);

INSERT INTO consents_widened (person_id, feature, allowed, text_version, at, forgotten_at)
SELECT person_id, feature, allowed, text_version, at, forgotten_at FROM consents;

DROP TABLE consents;

ALTER TABLE consents_widened RENAME TO consents;
