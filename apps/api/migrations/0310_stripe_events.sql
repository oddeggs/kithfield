-- Stripe event ids already applied: an event delivered twice is applied once.
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);
