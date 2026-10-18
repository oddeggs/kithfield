-- The printed scrapbook, paid outside the stores (a checkout provider). One order per farm book;
-- each person's share is its own payment, authorised and captured once the book is covered.
CREATE TABLE book_orders (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  cloth TEXT NOT NULL,
  by_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open', 'paid', 'printing', 'shipped', 'cancelled')),
  split INTEGER NOT NULL,
  share_count INTEGER NOT NULL DEFAULT 1,
  closes_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX book_orders_by_farm ON book_orders (farm_id);

CREATE TABLE book_shares (
  order_id TEXT NOT NULL REFERENCES book_orders (id) ON DELETE CASCADE,
  person_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'authorised', 'paid', 'released', 'refunded')),
  provider_ref TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (order_id, person_id)
);
