import type { CottageDelivery, SurfaceRefreshData } from '@kithfield/contracts';

import { enqueuePush, type SurfaceRefreshJob } from '../push/queue';
import { knowsFarm } from './chats';
import { pushTargets, type PushTarget } from './devices';
import type { Intake } from './intake';
import { readProfile } from './profile';

/*
 * Silent pushes that ask the phone to rewrite what its widgets draw: the fire lit, someone sitting
 * down or the fire going out, and a knock on the person's porch. They carry no words, never count
 * against the push budget and are never ledgered as alerts. iOS throttles silent pushes itself, so
 * the cottage sends at most one per farm and reason every few minutes: a change inside that window
 * goes out once at its end, so the widget always ends on the latest state (the fire out).
 */

export const REFRESH_GAP_MS = 5 * 60_000;

/** The reason a delivery asks the widgets to redraw, or null when it doesn't. */
export function refreshReasonOf(
  delivery: CottageDelivery,
  person: string,
): SurfaceRefreshData['reason'] | null {
  // The person's own doing: their app is open and redraws the widgets itself.
  if (delivery.actor === person) return null;
  if (delivery.kind === 'fire') return 'fire';
  if (delivery.kind === 'knock' && delivery.forYou) return 'knock';
  return null;
}

/** What to do with a refresh now: send it, send it later (in ms), or nothing (one already waits). */
export type RefreshPlan =
  | { readonly action: 'send' }
  | { readonly action: 'later'; readonly delayMs: number }
  | { readonly action: 'none' };

/** `last` is when the latest refresh for this farm and reason went, or is due to go. */
export function planRefresh(last: number | null, now: number): RefreshPlan {
  if (last === null || now >= last + REFRESH_GAP_MS) return { action: 'send' };
  // One is already due later: it reads the state as it is then.
  if (last > now) return { action: 'none' };
  return { action: 'later', delayMs: last + REFRESH_GAP_MS - now };
}

/** Queues the widgets' refresh for a delivery that asks for one, within the gap. */
export async function considerRefresh(intake: Intake, delivery: CottageDelivery): Promise<void> {
  const reason = refreshReasonOf(delivery, intake.person);
  if (reason === null) return;
  const { sql, now } = intake;
  sql.exec('DELETE FROM surface_refresh WHERE send_at < ?', now - 24 * 60 * 60_000);
  const last =
    sql
      .exec<{ send_at: number }>(
        'SELECT send_at FROM surface_refresh WHERE farm = ? AND reason = ?',
        delivery.farm,
        reason,
      )
      .toArray()[0]?.send_at ?? null;
  const plan = planRefresh(last, now);
  if (plan.action === 'none') return;
  const job: SurfaceRefreshJob = {
    surfaceRefresh: { person: intake.person, farm: delivery.farm, reason, refresh: 'widgets' },
  };
  const delayMs = plan.action === 'later' ? plan.delayMs : 0;
  try {
    await enqueuePush(intake.env, job, delayMs > 0 ? Math.ceil(delayMs / 1000) : undefined);
  } catch (error) {
    // A widget refresh is a nicety: the next one, or the app's own redraw, catches up.
    console.error('push queue refused a widget refresh', { error: String(error) });
    return;
  }
  sql.exec(
    `INSERT INTO surface_refresh (farm, reason, send_at) VALUES (?, ?, ?)
     ON CONFLICT (farm, reason) DO UPDATE SET send_at = excluded.send_at`,
    delivery.farm,
    reason,
    now + delayMs,
  );
}

/** Where a farm's widget refresh goes: none while hibernating or once the person left the farm. */
export function refreshTargets(sql: SqlStorage, farm: string): PushTarget[] {
  if (readProfile(sql).hibernating || !knowsFarm(sql, farm)) return [];
  return pushTargets(sql);
}
