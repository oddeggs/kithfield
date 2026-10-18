-- When a sign-in code went to an address, for the per-address send limit. The address is kept only
-- as a SHA-256 hash, and rows older than the limit's window are deleted as new ones arrive.
CREATE TABLE email_code_sends (
  address_hash TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);
CREATE INDEX email_code_sends_address_idx ON email_code_sends (address_hash, sent_at);
