-- One action key per device, for the share extension and notification replies, which call the
-- API without the app's session. Only the key's SHA-256 is kept. Registering again rotates it.
CREATE TABLE device_action_keys (
  key_hash TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (person_id, device_id)
);

CREATE INDEX device_action_keys_device ON device_action_keys (device_id);
