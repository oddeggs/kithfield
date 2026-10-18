-- Signing in on a computer by scanning its QR code with a signed-in phone. The computer asks for a
-- code (`POST /v1/desktop-link`) and keeps a secret; the phone looks the code up, then approves or
-- declines it; the computer collects its new session once with the secret. Only SHA-256 hashes of
-- the code and the secret are kept. `status`: waiting | approved | declined | collected. The name,
-- platform and city (Cloudflare's guess from the computer's address) are what the phone is shown.
-- Rows are dropped a day after they expire.
CREATE TABLE desktop_links (
  code_hash TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'approved', 'declined', 'collected')),
  person_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  answered_at INTEGER
);

CREATE INDEX desktop_links_expiry ON desktop_links (expires_at);
CREATE INDEX desktop_links_person ON desktop_links (person_id) WHERE person_id IS NOT NULL;
