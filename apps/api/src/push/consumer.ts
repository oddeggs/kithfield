import { PushJob } from '@kithfield/contracts';

import { cottageOf } from '../cottage/stub';
import type { Bindings } from '../env';
import { categoryOf, FEW_COPY, PASSIVE_COPY } from './catalogue';
import {
  errorCodeOf,
  EXPO_MESSAGES_PER_REQUEST,
  type ExpoMessage,
  RETRYABLE_ERRORS,
  sendToExpo,
} from './expo';
import { type LedgerRow, writeLedger } from './ledger';
import { enqueuePush, RECEIPT_DELAY_SECONDS, ReceiptCheck } from './queue';
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
  readonly message: Message;
  readonly job: PushJob;
  readonly folded: number;
  readonly sends: { readonly device: string; readonly token: string; readonly expo: ExpoMessage }[];
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
  for (const message of batch.messages) {
    const job = PushJob.safeParse(message.body);
    const check = job.success ? null : ReceiptCheck.safeParse(message.body);
    if (job.success) {
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

async function sendJobs(groups: readonly Queued[][], env: Bindings, deps: PushDeps) {
  const rows: LedgerRow[] = [];
  const outgoing: Outgoing[] = [];
  for (const group of groups) {
    const lead = lastOf(group);
    const job = foldGroup(group);
    const at = deps.now();
    const base = { person: job.person, kind: job.kind, farm: job.farm, seq: job.seq, at };
    for (const { message, job: folded } of group.slice(0, -1)) {
      rows.push({
        ...base,
        kind: folded.kind,
        seq: folded.seq,
        collapseKey: folded.collapseKey,
        decision: 'collapsed',
        reason: 'same_key',
      });
      message.ack();
    }
    const claim = await cottageOf(env, job.person).claim(job);
    const ledgerBase = { ...base, collapseKey: job.collapseKey, collapsed: group.length - 1 };
    if (claim.action !== 'send') {
      const decision = claim.action === 'hold' ? 'held' : 'skipped';
      const reason = claim.action === 'hold' ? 'quiet_hours' : claim.reason;
      rows.push({ ...ledgerBase, decision, reason });
      lead.message.ack();
      continue;
    }
    const push = renderPush(job, claim.lang, claim.title);
    if (push === null) {
      rows.push({ ...ledgerBase, decision: 'failed', reason: 'unknown_copy' });
      lead.message.ack();
      continue;
    }
    outgoing.push({
      message: lead.message,
      job,
      folded: group.length - 1,
      sends: claim.targets.map((t) => ({ ...t, expo: expoMessage(job, push, t.token) })),
      ok: 0,
      retry: false,
    });
  }

  const flat = outgoing.flatMap((out) => out.sends.map((send) => ({ out, send })));
  const receipts: ReceiptCheck['receipts'] = [];
  const dropped: { person: string; device: string; token: string }[] = [];
  for (let i = 0; i < flat.length; i += EXPO_MESSAGES_PER_REQUEST) {
    const chunk = flat.slice(i, i + EXPO_MESSAGES_PER_REQUEST);
    const result = await sendToExpo(
      deps.fetch,
      chunk.map((c) => c.send.expo),
      env.EXPO_ACCESS_TOKEN,
    );
    const at = deps.now();
    chunk.forEach(({ out, send }, index) => {
      const row = {
        person: out.job.person,
        kind: out.job.kind,
        farm: out.job.farm,
        seq: out.job.seq,
        collapseKey: out.job.collapseKey,
        collapsed: out.folded,
        device: send.device,
        at,
      };
      if (result.kind !== 'ok') {
        out.retry ||= result.kind === 'retry';
        rows.push({ ...row, decision: 'failed', reason: result.why });
        return;
      }
      const ticket = result.value[index];
      const code = ticket === undefined ? 'no_ticket' : errorCodeOf(ticket);
      if (ticket?.status === 'ok') {
        out.ok += 1;
        rows.push({ ...row, decision: 'sent', ticket: ticket.id });
        receipts.push({
          ticket: ticket.id,
          person: out.job.person,
          device: send.device,
          token: send.token,
        });
      } else {
        out.retry ||= code !== null && RETRYABLE_ERRORS.has(code);
        rows.push({ ...row, decision: 'failed', reason: code ?? 'error' });
        if (code === 'DeviceNotRegistered') dropped.push({ person: out.job.person, ...send });
      }
    });
  }

  for (const out of outgoing) {
    // A push that reached one device is not sent again to the others.
    if (out.retry && out.ok === 0)
      out.message.retry({ delaySeconds: backoffSeconds(out.message.attempts) });
    else out.message.ack();
  }
  await Promise.all(
    dropped.map(({ person, device, token }) => cottageOf(env, person).dropPushToken(device, token)),
  );
  await writeLedger(env.DB, rows);
  for (let i = 0; i < receipts.length; i += 1000) {
    await enqueuePush(env, { receipts: receipts.slice(i, i + 1000) }, RECEIPT_DELAY_SECONDS);
  }
}
