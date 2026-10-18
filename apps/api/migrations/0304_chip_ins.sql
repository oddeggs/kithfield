-- Chip-ins: friends together cover a wished-for birthday gift or a farm theme. `target` is the
-- nominal value in pence; pledges keep theirs privately and nobody ever sees an amount.
-- `what_json` is the contract's `ChipInFor`. A paid pledge on a chip-in that closed uncovered is
-- `refunded` with `refund_owed` set: store purchases can't be refunded by the app, so support
-- settles it.
CREATE TABLE chip_ins (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL,
  by_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('gift', 'theme')),
  target_key TEXT NOT NULL,
  what_json TEXT NOT NULL,
  target INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open', 'covered', 'closed')),
  closes_at INTEGER,
  created_at INTEGER NOT NULL,
  covered_at INTEGER,
  completed_at INTEGER,
  gift_id TEXT
);
CREATE INDEX chip_ins_by_farm ON chip_ins (farm_id, state);

CREATE TABLE pledges (
  chip_in_id TEXT NOT NULL REFERENCES chip_ins (id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  value INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('promised', 'paid', 'released', 'refunded')),
  transaction_id TEXT,
  refund_owed INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  PRIMARY KEY (chip_in_id, person_id)
);
CREATE INDEX pledges_by_person ON pledges (person_id);
