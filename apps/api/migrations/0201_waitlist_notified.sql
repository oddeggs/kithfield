-- When the one launch letter went to a listed address. Once it is set, the daily job clears the
-- raw address; the keyed hash stays, so an early critter pick still finds its person at sign-up.
ALTER TABLE waitlist ADD COLUMN notified_at INTEGER;
CREATE INDEX waitlist_notified ON waitlist (notified_at) WHERE email IS NOT NULL;
