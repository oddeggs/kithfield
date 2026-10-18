-- Wrong sign-in codes entered for an address, for the per-address lock: after too many in a day the
-- address can neither get nor try codes until the oldest of them is a day old. The address is kept
-- only as a SHA-256 hash; a right code clears its rows, and old rows go as new ones arrive.
CREATE TABLE email_code_failures (
  address_hash TEXT NOT NULL,
  failed_at INTEGER NOT NULL
);
CREATE INDEX email_code_failures_address_idx ON email_code_failures (address_hash, failed_at);
