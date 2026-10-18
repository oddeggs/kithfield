-- What people bought through the stores (RevenueCat), and what they own. Times are epoch ms.
--
-- `subscriptions`: one row per person and patronage product (`kf.patron.monthly`, `kf.founding`,
-- ...). `state` follows RevenueCat's events; `event_at` is the newest event applied, so an older
-- event arriving late changes nothing. A lapsed row stays: it is how the app knows to show what
-- was kept, and who may keep a name on the farmers' wall.
CREATE TABLE subscriptions (
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'ending', 'grace', 'lapsed')),
  since INTEGER NOT NULL,
  until INTEGER,
  store TEXT,
  event_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (person_id, product)
);

-- Everything a person owns, and how it came to them. Kept items stay when patronage lapses.
-- `from_id` (a giver) carries no foreign key: a gift stays after its giver's account is gone.
CREATE TABLE owned_items (
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  via TEXT NOT NULL CHECK (via IN ('bought', 'gift', 'chip_in', 'patron', 'parcel', 'founding')),
  from_id TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (person_id, item)
);

-- Consumable store transactions (gifts and chip-in pledges), each paying for one thing only.
CREATE TABLE store_transactions (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  at INTEGER NOT NULL,
  environment TEXT,
  used_by TEXT,
  refunded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX store_transactions_by_person ON store_transactions (person_id);

-- RevenueCat event ids already applied: a webhook delivered twice is applied once.
CREATE TABLE revenuecat_events (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);
