-- Patrons' choices. A Farm Plus payer's chosen farm; the names on the farmers' wall (they stay
-- after patronage lapses); and each patron's vote on the next critter, one a season, no tallies.
CREATE TABLE farm_plus (
  payer_id TEXT PRIMARY KEY REFERENCES people (id) ON DELETE CASCADE,
  farm_id TEXT NOT NULL,
  chosen_at INTEGER NOT NULL
);
CREATE INDEX farm_plus_by_farm ON farm_plus (farm_id);

CREATE TABLE wall_names (
  person_id TEXT PRIMARY KEY REFERENCES people (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX wall_names_in_order ON wall_names (sort_key, person_id);

CREATE TABLE critter_votes (
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  option TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (person_id, season)
);
