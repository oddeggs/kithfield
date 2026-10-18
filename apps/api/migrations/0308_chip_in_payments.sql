-- Chip-ins charge nobody until covered; then each pledger pays their own share. Every store
-- transaction that paid toward a chip-in is kept here, also one that arrived after the chip-in
-- closed or finished, or a second one from the same person: a valid payment is never dropped.
CREATE TABLE chip_in_payments (
  transaction_id TEXT PRIMARY KEY,
  chip_in_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  value INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX chip_in_payments_by_chip_in ON chip_in_payments (chip_in_id);

-- A paid share its chip-in couldn't use (it closed before everyone paid, or was paid twice)
-- becomes the payer's credit: the gift item itself when they don't own it (`item`), else its value
-- in pence to spend later. Nothing is refunded by the app; only Apple refunds.
CREATE TABLE shop_credits (
  transaction_id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  chip_in_id TEXT NOT NULL,
  value INTEGER NOT NULL,
  item TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX shop_credits_by_person ON shop_credits (person_id);

-- When the farm took the covered chip-in's gift or theme write; until then it is owed and retried.
ALTER TABLE chip_ins ADD COLUMN delivered_at INTEGER;
