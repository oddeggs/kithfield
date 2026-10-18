/**
 * The cottage's own SQLite tables. Each statement is idempotent, so the object runs them all on
 * every start; a later change adds statements and never edits these.
 */
export const COTTAGE_SCHEMA = [
  // The person's settings and the cottage's own state, as one JSON document.
  `CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)`,
  // One row per farm or visit the person lives on: what the chat list shows, and the latest event.
  `CREATE TABLE IF NOT EXISTS farms (
    farm TEXT PRIMARY KEY,
    farm_kind TEXT,
    name TEXT,
    with_json TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    muted_until INTEGER,
    seq INTEGER,
    kind TEXT,
    actor TEXT,
    at INTEGER,
    preview TEXT,
    for_you INTEGER
  )`,
  // Things meant for the person that wait in Quick Tend until they open that farm.
  `CREATE TABLE IF NOT EXISTS doorstep (
    farm TEXT NOT NULL,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    actor TEXT,
    at INTEGER NOT NULL,
    PRIMARY KEY (farm, seq)
  )`,
  `CREATE TABLE IF NOT EXISTS devices (
    device TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    name TEXT NOT NULL,
    push_token TEXT,
    app_version TEXT NOT NULL,
    registered_at INTEGER NOT NULL
  )`,
  // Pushes counted against a day's budget, by budget key.
  `CREATE TABLE IF NOT EXISTS budget (key TEXT PRIMARY KEY, count INTEGER NOT NULL, at INTEGER NOT NULL)`,
  // When each nudge went out, for the weekly cap.
  `CREATE TABLE IF NOT EXISTS nudges_sent (at INTEGER NOT NULL)`,
  // Pushes held through quiet hours. Undecided ones go through the rules again when they end;
  // decided ones (held by the consumer) only through the late checks.
  `CREATE TABLE IF NOT EXISTS held (
    id TEXT PRIMARY KEY,
    job TEXT NOT NULL,
    until INTEGER NOT NULL,
    decided INTEGER NOT NULL DEFAULT 0
  )`,
  // Every seq delivered lately, so a repeat is told from a late arrival (a slow post, or events
  // committed together arriving out of order). Kept 7 days.
  `CREATE TABLE IF NOT EXISTS delivered (
    farm TEXT NOT NULL,
    seq INTEGER NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (farm, seq)
  )`,
  // Remember-me seeds: personal, never in a farm log.
  `CREATE TABLE IF NOT EXISTS seeds (
    id TEXT PRIMARY KEY,
    farm TEXT NOT NULL,
    from_seq INTEGER,
    about TEXT NOT NULL,
    title TEXT NOT NULL,
    nudge_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  // Pushes handed to the consumer to send, by the id in their data, for the per-type rest after
  // unopened ones. `farm` is '' for a push that belongs to no farm. Kept 60 days.
  `CREATE TABLE IF NOT EXISTS sent_pushes (
    id TEXT PRIMARY KEY,
    farm TEXT NOT NULL,
    type TEXT NOT NULL,
    at INTEGER NOT NULL,
    opened INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS sent_pushes_by_type ON sent_pushes (farm, type, at)`,
  // A kind of push resting on a farm after unopened ones, until `until`; only pushes sent
  // after `since` count towards the next rest.
  `CREATE TABLE IF NOT EXISTS resting (
    farm TEXT NOT NULL,
    type TEXT NOT NULL,
    until INTEGER,
    since INTEGER NOT NULL,
    PRIMARY KEY (farm, type)
  )`,
  // When each farm's latest widget refresh (a silent push) went or is due to go, by reason.
  `CREATE TABLE IF NOT EXISTS surface_refresh (
    farm TEXT NOT NULL,
    reason TEXT NOT NULL,
    send_at INTEGER NOT NULL,
    PRIMARY KEY (farm, reason)
  )`,
  // Live Activity push tokens: one push-to-start token per device, and the update token of each
  // activity running on one (`seed` is 0 for the fire). They go with the device.
  `CREATE TABLE IF NOT EXISTS activity_start_tokens (
    device TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS activity_tokens (
    device TEXT NOT NULL,
    activity TEXT NOT NULL,
    farm TEXT NOT NULL,
    seed INTEGER NOT NULL,
    token TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (device, activity, farm, seed)
  )`,
  // The sprouted plans the person is going to, while their day is ahead or under way: when its
  // Live Activity starts and ends on their phones, and the people it last showed.
  `CREATE TABLE IF NOT EXISTS plan_days (
    farm TEXT NOT NULL,
    seed INTEGER NOT NULL,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    started INTEGER NOT NULL DEFAULT 0,
    last_json TEXT,
    PRIMARY KEY (farm, seed)
  )`,
  // Set once the person's account is purged: a late delivery or farm row is never taken in again.
  `CREATE TABLE IF NOT EXISTS purged (id INTEGER PRIMARY KEY CHECK (id = 1))`,
] as const;

/** Columns added after a table first shipped, each added once. */
const ADDED_COLUMNS = [
  // What may push the person from this farm (`FarmNotifications.knockFor`), as JSON; null is the
  // defaults.
  ['farms', 'knock_for', 'TEXT'],
  // The waiting item's short line, for Quick Tend's cards.
  ['doorstep', 'preview', 'TEXT'],
] as const;

/** Makes the tables; `purged` also marks the cottage as its person's purged one. */
export function applySchema(sql: SqlStorage, purged = false): void {
  for (const statement of COTTAGE_SCHEMA) sql.exec(statement);
  if (purged) sql.exec('INSERT OR IGNORE INTO purged (id) VALUES (1)');
  for (const [table, column, type] of ADDED_COLUMNS) {
    const has = sql
      .exec<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`)
      .toArray()
      .some((row) => row.name === column);
    if (!has) sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/** Whether the cottage's person was purged: then it takes in nothing more. */
export function isPurged(sql: SqlStorage): boolean {
  return sql.exec('SELECT 1 FROM purged').toArray().length > 0;
}
