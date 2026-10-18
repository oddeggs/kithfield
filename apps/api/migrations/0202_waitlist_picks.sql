-- The phone a listed person said they'll use (ios | android), and the critter they saved early on
-- the thank-you page: a species, copied from their pick once the address confirms.
ALTER TABLE waitlist ADD COLUMN platform TEXT CHECK (platform IN ('ios', 'android'));
ALTER TABLE waitlist ADD COLUMN species TEXT;

-- One row per `POST /v1/waitlist` answer: the SHA-256 (hex) of the pick token handed back, the
-- address's keyed hash, and when it was asked. `confirm_hash` binds it to the pending confirmation
-- that request made or found; it stays null for an address that was already confirmed, so such a
-- pick is kept but never used. Picks are deleted after a week, like unconfirmed addresses.
CREATE TABLE waitlist_picks (
  pick_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  confirm_hash TEXT,
  species TEXT,
  picked_at INTEGER
);
CREATE INDEX waitlist_picks_confirm ON waitlist_picks (confirm_hash) WHERE confirm_hash IS NOT NULL;
CREATE INDEX waitlist_picks_requested ON waitlist_picks (requested_at);
