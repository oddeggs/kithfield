-- Gifts: reserved before paying, tied to the store transaction that paid, then given once through
-- the farm (`op_id` is the write that gave it). A chip-in gift is written by the farm on behalf of
-- whoever started the chip-in. Never amounts. No foreign keys: account deletion removes the rows.
CREATE TABLE gifts (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  farm_id TEXT NOT NULL,
  item TEXT NOT NULL,
  wrap TEXT NOT NULL,
  product TEXT,
  state TEXT NOT NULL CHECK (state IN ('unpaid', 'paid', 'given', 'opened')),
  transaction_id TEXT,
  chip_in_id TEXT,
  op_id TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  given_at INTEGER,
  opened_at INTEGER
);
CREATE INDEX gifts_by_from ON gifts (from_id);
CREATE INDEX gifts_by_to ON gifts (to_id);
