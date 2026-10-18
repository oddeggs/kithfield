-- Forwarding copies a photo into the other farm rather than sharing it, so each farm's media stays
-- its own. One row per person, destination farm and original key: forwarding the same item there
-- again answers the same copy.
CREATE TABLE media_copies (
  person_id TEXT NOT NULL,
  farm_id TEXT NOT NULL,
  from_key TEXT NOT NULL,
  to_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (person_id, farm_id, from_key)
);
