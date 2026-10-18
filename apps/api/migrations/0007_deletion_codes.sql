-- Codes confirming an account deletion asked for on the website (`POST /v1/deletion-requests`),
-- one per address, kept only for an address that signs in to an account. The address is kept as
-- a SHA-256 hash, the code as an HMAC under the auth secret. A code lives 10 minutes and takes 5
-- tries; a new request replaces it. Times are epoch milliseconds.
CREATE TABLE deletion_codes (
  address_hash TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  tries_left INTEGER NOT NULL
);
CREATE INDEX deletion_codes_person ON deletion_codes (person_id);

-- Finds the people whose 30 days are over, for the daily purge.
CREATE INDEX people_deleted_at ON people (deleted_at) WHERE deleted_at IS NOT NULL;
