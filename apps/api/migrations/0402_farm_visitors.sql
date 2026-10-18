-- Farms a person visited without living there: written when they leave something at the gate or
-- trade there. Account deletion walks these as well as memberships, to tombstone what they left.
CREATE TABLE farm_visitors (
  person_id TEXT NOT NULL,
  farm_id TEXT NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  first_at INTEGER NOT NULL,
  PRIMARY KEY (person_id, farm_id)
);
CREATE INDEX farm_visitors_by_farm ON farm_visitors (farm_id);
