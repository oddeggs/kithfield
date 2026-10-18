-- The launch list from the website. Each address is on it once, keyed by a keyed hash (HMAC-SHA256
-- under the WAITLIST_EMAIL_KEY secret) of the trimmed, lowercased address, so the key can't be
-- reversed or brute-forced without the secret. The raw address is kept only to send the one letter
-- when Kithfield opens; it is cleared once that letter has gone. An address nobody confirms is
-- deleted after a week. Times are epoch milliseconds.
CREATE TABLE waitlist (
  email_hash TEXT PRIMARY KEY,
  email TEXT,
  lang TEXT NOT NULL CHECK (lang IN ('en', 'vi')),
  created_at INTEGER NOT NULL,
  -- SHA-256 (hex) of the token in the confirmation letter; null once confirmed.
  confirm_hash TEXT UNIQUE,
  confirmed_at INTEGER
);
CREATE INDEX waitlist_unconfirmed ON waitlist (created_at) WHERE confirmed_at IS NULL;
