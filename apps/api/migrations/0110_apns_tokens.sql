-- The APNs provider token, made once for every isolate and reused for about 50 minutes: Apple
-- refuses a key whose token is refreshed more often than every 20 minutes.
CREATE TABLE apns_tokens (
  key_id TEXT PRIMARY KEY,
  jwt TEXT NOT NULL,
  issued_at INTEGER NOT NULL
);
