-- The keepsakes export (`POST /v1/me/export`): one row per request. state: preparing | ready |
-- expired. The bundle lives in R2 at `r2_key` from ready until `expires_at` (7 days later), when
-- the daily job deletes it and marks the row expired. Rows go with the person's account.
CREATE TABLE exports (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('preparing', 'ready', 'expired')),
  requested_at INTEGER NOT NULL,
  ready_at INTEGER,
  expires_at INTEGER,
  r2_key TEXT NOT NULL
);
CREATE INDEX exports_by_person ON exports (person_id, requested_at);
CREATE INDEX exports_ready ON exports (expires_at) WHERE state = 'ready';
