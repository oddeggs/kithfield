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
] as const;

/** Columns added after a table first shipped, each added once. */
const ADDED_COLUMNS = [
  // What may push the person from this farm (`FarmNotifications.knockFor`), as JSON; null is the
  // defaults.
  ['farms', 'knock_for', 'TEXT'],
] as const;

export function applySchema(sql: SqlStorage): void {
  for (const statement of COTTAGE_SCHEMA) sql.exec(statement);
  for (const [table, column, type] of ADDED_COLUMNS) {
    const has = sql
      .exec<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`)
      .toArray()
      .some((row) => row.name === column);
    if (!has) sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
