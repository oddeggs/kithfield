import { PushJob } from '@kithfield/contracts';

import { cottageOf } from '../cottage/stub';
import type { Bindings } from '../env';
import { categoryOf, FEW_COPY, PASSIVE_COPY } from './catalogue';
import {
  errorCodeOf,
  EXPO_MESSAGES_PER_REQUEST,
  type ExpoMessage,
  type ExpoResult,
  type ExpoTicket,
  RETRYABLE_ERRORS,
  sendToExpo,
} from './expo';
import { type LedgerRow, writeLedger } from './ledger';
import { enqueuePush, RECEIPT_DELAY_SECONDS, ReceiptCheck, SurfaceRefreshJob } from './queue';
import { sendRefreshes } from './refresh';
import { checkReceipts } from './receipts';
import { expoMessage, renderPush } from './render';

/** What the consumer reaches the outside world through; tests pass a double for Expo. */
export interface PushDeps {
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

const defaultDeps: PushDeps = { fetch: (input, init) => fetch(input, init), now: () => Date.now() };

/** Seconds before a retry: 30, 60, 120… up to 15 minutes. After the queue's retries, the DLQ. */
export function backoffSeconds(attempts: number): number {
  return Math.min(30 * 2 ** Math.max(0, attempts - 1), 15 * 60);
}

type Queued = { readonly message: Message; readonly job: PushJob };

/** One push about to go out: the job, its messages per device, and how they fared. */
interface Outgoing {
  readonly group: readonly Queued[];
  readonly job: PushJob;
  readonly sends: readonly Send[];
  ok: number;
  retry: boolean;
}

/**
 * The `push` queue's consumer. For each job: fold jobs with the same person and collapse key,
 * ask the person's cottage once more (hibernating, muted, quiet hours, devices), render the copy
 * in their language, send through Expo, ledger every outcome, drop tokens Expo no longer knows,
 * and queue the receipts check. Failures that clear up by themselves retry with back-off.
 */
export async function consumePush(
  batch: MessageBatch,
  env: Bindings,
  _ctx?: ExecutionContext,
  deps: PushDeps = defaultDeps,
): Promise<void> {
  const groups = new Map<string, Queued[]>();
  const checks: { message: Message; check: ReceiptCheck }[] = [];
  const refreshes: { message: Message; job: SurfaceRefreshJob }[] = [];
  for (const message of batch.messages) {
    const job = PushJob.safeParse(message.body);
    const check = job.success ? null : ReceiptCheck.safeParse(message.body);
    const refresh =
      job.success || check?.success === true ? null : SurfaceRefreshJob.safeParse(message.body);
    if (refresh?.success === true) {
      refreshes.push({ message, job: refresh.data });
    } else if (job.success) {
      const key = `${job.data.person}\n${job.data.collapseKey}`;
      groups.set(key, [...(groups.get(key) ?? []), { message, job: job.data }]);
    } else if (check?.success === true) {
      checks.push({ message, check: check.data });
    } else {
      console.error('unreadable push queue message', { id: message.id });
      message.ack();
    }
  }
  await sendJobs([...groups.values()], env, deps);
  await checkReceipts(checks, env, deps);
  await sendRefreshes(refreshes, env, deps);
}

/** The job a group of same-key jobs folds into: the latest, as "a few things" if it wasn't already. */
function foldGroup(group: readonly Queued[]): PushJob {
  const latest = lastOf(group).job;
  if (group.length === 1 || PASSIVE_COPY.has(latest.copy.key)) return latest;
  const few = categoryOf(latest) === 'doorstep' ? FEW_COPY.doorstep : FEW_COPY.farm;
  return { ...latest, copy: { key: few, params: {} } };
}

function lastOf<T>(items: readonly T[]): T {
  const last = items[items.length - 1];
  if (last === undefined) throw new Error('A group has at least one job');
  return last;
}

type Send = { readonly device: string; readonly token: string; readonly expo: ExpoMessage };
type Item = { readonly out: Outgoing; readonly send: Send };

/** Ledger rows for the jobs a group folded into its push, once the push is settled. */
function foldedRows(group: readonly Queued[], at: number): LedgerRow[] {
  return group.slice(0, -1).map(({ job }) => ({
    person: job.person,
    kind: job.kind,
    farm: job.farm,
    seq: job.seq,
    collapseKey: job.collapseKey,
    decision: 'collapsed',
    reason: 'same_key',
    at,
  }));
}

async function sendJobs(groups: readonly Queued[][], env: Bindings, deps: PushDeps) {
  const rows: LedgerRow[] = [];
  const outgoing: Outgoing[] = [];
  for (const group of groups) {
    const job = foldGroup(group);
    const at = deps.now();
    const base = { person: job.person, kind: job.kind, farm: job.farm, seq: job.seq, at };
    const ledgerBase = { ...base, collapseKey: job.collapseKey, collapsed: group.length - 1 };
    const claim = await cottageOf(env, job.person).claim(job);
    const push = claim.action === 'send' ? renderPush(job, claim.lang, claim.title) : null;
    if (claim.action !== 'send' || push === null) {
      const row: LedgerRow =
        claim.action === 'hold'
          ? { ...ledgerBase, decision: 'held', reason: 'quiet_hours' }
          : claim.action === 'skip'
            ? { ...ledgerBase, decision: 'skipped', reason: claim.reason }
            : { ...ledgerBase, decision: 'failed', reason: 'unknown_copy' };
      rows.push(...foldedRows(group, at), row);
      for (const { message } of group) message.ack();
      continue;
    }
    outgoing.push({
      group,
      job,
      sends: claim.targets.map((t) => ({
        ...t,
        expo: expoMessage(job, push, t.token, claim.push),
      })),
      ok: 0,
      retry: false,
    });
  }

  const flat: Item[] = outgoing.flatMap((out) => out.sends.map((send) => ({ out, send })));
  const settled: Settled = { rows, receipts: [], dropped: [] };
  for (let i = 0; i < flat.length; i += EXPO_MESSAGES_PER_REQUEST) {
    const chunk = flat.slice(i, i + EXPO_MESSAGES_PER_REQUEST);
    const result = await sendToExpo(
      deps.fetch,
      chunk.map((c) => c.send.expo),
      env.EXPO_ACCESS_TOKEN,
    );
    if (result.kind === 'refused' && chunk.length > 1) {
      // One bad message refuses the whole request: send each on its own so only it fails.
      for (const item of chunk) {
        const alone = await sendToExpo(deps.fetch, [item.send.expo], env.EXPO_ACCESS_TOKEN);
        settle([item], alone, deps.now(), settled);
      }
    } else {
      settle(chunk, result, deps.now(), settled);
    }
  }

  for (const out of outgoing) {
    // A push that reached one device is not sent again to the others. A folded group is retried
    // whole, so it folds into the same push again.
    if (out.retry && out.ok === 0) {
      const attempts = Math.max(...out.group.map(({ message }) => message.attempts));
      for (const { message } of out.group)
        message.retry({ delaySeconds: backoffSeconds(attempts) });
    } else {
      rows.push(...foldedRows(out.group, deps.now()));
      for (const { message } of out.group) message.ack();
    }
  }
  await Promise.all(
    settled.dropped.map(({ person, device, token }) =>
      cottageOf(env, person).dropPushToken(device, token),
    ),
  );
  await writeLedger(env.DB, rows);
  for (let i = 0; i < settled.receipts.length; i += 1000) {
    await enqueuePush(
      env,
      { receipts: settled.receipts.slice(i, i + 1000) },
      RECEIPT_DELAY_SECONDS,
    );
  }
}

interface Settled {
  readonly rows: LedgerRow[];
  readonly receipts: ReceiptCheck['receipts'];
  readonly dropped: { person: string; device: string; token: string }[];
}

/** Books what Expo said about each message of a request. */
function settle(
  items: readonly Item[],
  result: ExpoResult<ExpoTicket[]>,
  at: number,
  settled: Settled,
): void {
  items.forEach(({ out, send }, index) => {
    const row = {
      person: out.job.person,
      kind: out.job.kind,
      farm: out.job.farm,
      seq: out.job.seq,
      collapseKey: out.job.collapseKey,
      collapsed: out.group.length - 1,
      device: send.device,
      at,
    };
    if (result.kind !== 'ok') {
      out.retry ||= result.kind === 'retry';
      settled.rows.push({ ...row, decision: 'failed', reason: result.why });
      return;
    }
    const ticket = result.value[index];
    const code = ticket === undefined ? 'no_ticket' : errorCodeOf(ticket);
    if (ticket?.status === 'ok') {
      out.ok += 1;
      settled.rows.push({ ...row, decision: 'sent', ticket: ticket.id });
      settled.receipts.push({
        ticket: ticket.id,
        person: out.job.person,
        device: send.device,
        token: send.token,
      });
    } else {
      out.retry ||= code !== null && RETRYABLE_ERRORS.has(code);
      settled.rows.push({ ...row, decision: 'failed', reason: code ?? 'error' });
      if (code === 'DeviceNotRegistered') settled.dropped.push({ person: out.job.person, ...send });
    }
  });
}
