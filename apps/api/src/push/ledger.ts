/** What happened to a push. Every decision and every send is one row in `push_ledger`. */
export type LedgerDecision = 'queued' | 'held' | 'skipped' | 'collapsed' | 'sent' | 'failed';

export interface LedgerRow {
  readonly person: string;
  readonly kind: string;
  readonly farm: string | null;
  readonly seq: number | null;
  readonly collapseKey: string;
  readonly decision: LedgerDecision;
  readonly reason?: string;
  readonly collapsed?: number;
  readonly device?: string;
  readonly ticket?: string;
  readonly at: number;
}

const INSERT = `INSERT INTO push_ledger
  (id, person_id, kind, farm_id, seq, collapse_key, decision, reason, collapsed, device_id,
   ticket_id, at, sent_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** Writes ledger rows in one batch. */
export async function writeLedger(db: D1Database, rows: readonly LedgerRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db.batch(
    rows.map((row) =>
      db
        .prepare(INSERT)
        .bind(
          crypto.randomUUID(),
          row.person,
          row.kind,
          row.farm,
          row.seq,
          row.collapseKey,
          row.decision,
          row.reason ?? null,
          row.collapsed ?? 0,
          row.device ?? null,
          row.ticket ?? null,
          row.at,
          row.decision === 'sent' ? row.at : null,
        ),
    ),
  );
}

/** Records a receipt against the ticket it answers. */
export async function recordReceipts(
  db: D1Database,
  receipts: readonly { readonly ticket: string; readonly receipt: string }[],
): Promise<void> {
  if (receipts.length === 0) return;
  await db.batch(
    receipts.map(({ ticket, receipt }) =>
      db.prepare('UPDATE push_ledger SET receipt = ? WHERE ticket_id = ?').bind(receipt, ticket),
    ),
  );
}
