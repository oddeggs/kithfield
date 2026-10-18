import { cottageOf } from '../cottage/stub';
import type { Bindings } from '../env';
import type { PushDeps } from './consumer';
import { errorCodeOf, EXPO_RECEIPTS_PER_REQUEST, fetchReceipts } from './expo';
import { recordReceipts } from './ledger';
import { RECEIPT_DELAY_SECONDS, type ReceiptCheck } from './queue';

/** Receipts not ready yet are asked for again, this many times in all. */
const RECEIPT_ATTEMPTS = 3;

/**
 * Reads Expo's receipts for sent pushes, records each in the ledger, and drops the token of a
 * device Expo says is no longer registered. Receipts not ready yet are asked for again later.
 */
export async function checkReceipts(
  checks: readonly { message: Message; check: ReceiptCheck }[],
  env: Bindings,
  deps: PushDeps,
): Promise<void> {
  for (const { message, check } of checks) {
    const found: Record<string, string> = {};
    let retry = false;
    for (let i = 0; i < check.receipts.length; i += EXPO_RECEIPTS_PER_REQUEST) {
      const slice = check.receipts.slice(i, i + EXPO_RECEIPTS_PER_REQUEST);
      const result = await fetchReceipts(
        deps.fetch,
        slice.map((r) => r.ticket),
        env.EXPO_ACCESS_TOKEN,
      );
      if (result.kind === 'retry') retry = true;
      if (result.kind !== 'ok') continue;
      for (const [ticket, receipt] of Object.entries(result.value)) {
        found[ticket] = errorCodeOf(receipt) ?? 'ok';
      }
    }

    const answered = check.receipts.filter((r) => found[r.ticket] !== undefined);
    await recordReceipts(
      env.DB,
      answered.map((r) => ({ ticket: r.ticket, receipt: found[r.ticket] ?? 'error' })),
    );
    await Promise.all(
      answered
        .filter((r) => found[r.ticket] === 'DeviceNotRegistered')
        .map((r) => cottageOf(env, r.person).dropPushToken(r.device, r.token)),
    );

    const pending = check.receipts.length - answered.length;
    if (retry) {
      message.retry({ delaySeconds: RECEIPT_DELAY_SECONDS });
    } else if (pending > 0 && message.attempts < RECEIPT_ATTEMPTS) {
      message.retry({ delaySeconds: RECEIPT_DELAY_SECONDS });
    } else {
      message.ack();
    }
  }
}
