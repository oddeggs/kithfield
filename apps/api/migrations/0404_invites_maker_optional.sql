-- Who made an invite link becomes optional: an account's purge clears it, so a farm's link keeps
-- working without naming someone who is gone. SQLite can't loosen a column, so the table is
-- rebuilt with the same rows and index.
CREATE TABLE invites_next (
  code_hash TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  created_by TEXT,
  expires_at INTEGER,
  uses_left INTEGER,
  code_sealed TEXT
);
INSERT INTO invites_next (code_hash, farm_id, created_by, expires_at, uses_left, code_sealed)
  SELECT code_hash, farm_id, created_by, expires_at, uses_left, code_sealed FROM invites;
DROP TABLE invites;
ALTER TABLE invites_next RENAME TO invites;
CREATE INDEX invites_by_farm ON invites (farm_id);
