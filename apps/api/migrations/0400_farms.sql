-- The global farm tables. Farm content never lives here: it stays in each farm's Durable Object.
-- Person ids refer to `people`, which auth owns; they carry no foreign key so the farm tables don't
-- depend on the order the two land in.

-- kind: farm | visit. size_cap: critters per farm (24). pair: the two people of a visit, sorted
-- and joined with ':', so a visit between the same two people is found again.
CREATE TABLE farms (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('farm', 'visit')),
  name TEXT,
  land TEXT NOT NULL,
  keeper_id TEXT,
  created_at INTEGER NOT NULL,
  size_cap INTEGER NOT NULL DEFAULT 24,
  pair TEXT UNIQUE,
  CHECK ((kind = 'visit') = (pair IS NOT NULL))
);

-- The farms each person lives on, for the switcher, socket checks and push fan-out.
-- role: keeper | helper | critter. muted_until: epoch ms, or NULL when not muted.
CREATE TABLE memberships (
  person_id TEXT NOT NULL,
  farm_id TEXT NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('keeper', 'helper', 'critter')),
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  muted_until INTEGER,
  PRIMARY KEY (person_id, farm_id)
);
CREATE INDEX memberships_by_farm ON memberships (farm_id) WHERE left_at IS NULL;

-- Only a SHA-256 hash of each invite code is kept. uses_left NULL is unlimited.
CREATE TABLE invites (
  code_hash TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  expires_at INTEGER,
  uses_left INTEGER
);
CREATE INDEX invites_by_farm ON invites (farm_id);

-- People who used an invite to a farm where the keeper lets people in, with the name and critter
-- they chose. Approving writes `joined` and removes the row; declining removes it quietly.
CREATE TABLE farm_waiting (
  farm_id TEXT NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  person_id TEXT NOT NULL,
  name TEXT NOT NULL,
  critter TEXT NOT NULL,
  asked_at INTEGER NOT NULL,
  PRIMARY KEY (farm_id, person_id)
);
