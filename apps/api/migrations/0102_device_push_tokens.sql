-- One push token, one person: the hash of each device's push token, so registering a token that
-- another person's device still holds takes it away from them.
ALTER TABLE device_action_keys ADD COLUMN push_token_hash TEXT;

CREATE INDEX device_action_keys_push_token ON device_action_keys (push_token_hash)
  WHERE push_token_hash IS NOT NULL;
