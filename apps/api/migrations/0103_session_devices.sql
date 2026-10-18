-- Which device each sign-in session is on, as the app registers it (`PUT /v1/devices/:deviceId`):
-- the device id is the one id `GET /v1/devices` lists and `DELETE /v1/devices/:id` signs out. The
-- name and platform are the app's; the city is Cloudflare's guess from the address, nothing finer.
-- A row goes with its session.
CREATE TABLE session_devices (
  session_id TEXT PRIMARY KEY REFERENCES sessions (id) ON DELETE CASCADE,
  person_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  city TEXT,
  registered_at INTEGER NOT NULL
);

CREATE INDEX session_devices_device ON session_devices (person_id, device_id);
