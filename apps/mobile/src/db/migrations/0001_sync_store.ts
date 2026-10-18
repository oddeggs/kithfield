/**
 * The phone's copy of each farm and its unsent writes.
 *
 * - `farms`: per farm, the last seq held and the farm state the reducer left at that seq (the
 *   local snapshot). `needs_snapshot` is set after an invalid event, until the farm's snapshot
 *   comes back.
 * - `events`: the farm's log by seq, as envelopes. `known` is 0 for a kind this app doesn't know
 *   (kept, skipped by the reducer). Events paged in for history are kept here too.
 * - `invalid_events`: events of a known kind that failed their schema, kept raw.
 * - `outbox`: writes in the order they were made, until acknowledged (and seen in the log) or
 *   rejected. `acked_seq` is set once the farm acknowledged the write.
 * - `rejections`: writes the farm refused, kept until the app has explained them.
 * - `chats`: the chat list from the person's cottage. `meta`: small flags.
 */
export const sql = `
CREATE TABLE farms (
  farm TEXT PRIMARY KEY NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  state TEXT,
  needs_snapshot INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE events (
  farm TEXT NOT NULL,
  seq INTEGER NOT NULL,
  op_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  actor TEXT,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  rules_version INTEGER NOT NULL,
  known INTEGER NOT NULL,
  PRIMARY KEY (farm, seq)
);
CREATE INDEX events_by_op ON events (farm, op_id);
CREATE INDEX events_by_actor ON events (farm, actor);

CREATE TABLE invalid_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm TEXT NOT NULL,
  seq INTEGER,
  kind TEXT,
  raw TEXT NOT NULL,
  issues TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE outbox (
  n INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id TEXT NOT NULL UNIQUE,
  farm TEXT NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  acked_seq INTEGER
);
CREATE INDEX outbox_by_farm ON outbox (farm, n);

CREATE TABLE rejections (
  op_id TEXT PRIMARY KEY NOT NULL,
  farm TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  reason TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE chats (
  farm TEXT PRIMARY KEY NOT NULL,
  row TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;
