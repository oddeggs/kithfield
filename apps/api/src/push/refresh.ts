import type { SurfaceRefreshData } from '@kithfield/contracts';

import { cottageOf } from '../cottage/stub';
import type { Bindings } from '../env';
import { backoffSeconds, type PushDeps } from './consumer';
import {
  errorCodeOf,
  EXPO_MESSAGES_PER_REQUEST,
  type ExpoSilentMessage,
  RETRYABLE_ERRORS,
  sendToExpo,
} from './expo';
import { fcmConfig, fcmSilentMessage, isExpoToken, sendToFcm } from './fcm';
import type { SurfaceRefreshJob } from './queue';

/** A widget refresh is stale after this long: the app redraws on its next launch anyway. */
const REFRESH_TTL_SECONDS = 60 * 60;

/** The silent push for one device: `SurfaceRefreshData` and nothing to show. */
export function silentMessage(job: SurfaceRefreshJob, token: string): ExpoSilentMessage {
  const { refresh, farm, reason } = job.surfaceRefresh;
  const data: SurfaceRefreshData = { refresh, farm, reason };
  return {
    to: token,
    data,
    _contentAvailable: true,
    priority: 'normal',
    collapseId: `refresh.${reason}.${farm}`.slice(0, 64),
    ttl: REFRESH_TTL_SECONDS,
  };
}

type Item = { readonly message: Message; readonly person: string; readonly device: string };

/**
 * Sends the widgets' silent pushes. They are not alerts, so they skip the budget and the ledger;
 * a token Expo no longer knows is dropped, and a refusal that clears up retries with back-off.
 */
export async function sendRefreshes(
  refreshes: readonly { message: Message; job: SurfaceRefreshJob }[],
  env: Bindings,
  deps: PushDeps,
): Promise<void> {
  const out: { item: Item; expo: ExpoSilentMessage }[] = [];
  const android: { item: Item; expo: ExpoSilentMessage }[] = [];
  for (const { message, job } of refreshes) {
    const { person, farm } = job.surfaceRefresh;
    const targets = await cottageOf(env, person).refreshTargets(farm);
    for (const target of targets) {
      const fcm = target.platform === 'android' && !isExpoToken(target.token);
      (fcm ? android : out).push({
        item: { message, person, device: target.device },
        expo: silentMessage(job, target.token),
      });
    }
  }
  const retry = new Set<Message>();
  const dropped: { person: string; device: string; token: string }[] = [];
  // Android phones redraw their widgets from FCM's data message; without FCM there are none.
  const fcm = fcmConfig(env);
  if (fcm !== null) {
    for (const { item, expo } of android) {
      const result = await sendToFcm(deps.fetch, fcm, fcmSilentMessage(expo), deps.now());
      if (result.kind === 'retry') retry.add(item.message);
      if (result.kind === 'gone') {
        dropped.push({ person: item.person, device: item.device, token: expo.to });
      }
    }
  }
  for (let i = 0; i < out.length; i += EXPO_MESSAGES_PER_REQUEST) {
    const chunk = out.slice(i, i + EXPO_MESSAGES_PER_REQUEST);
    const result = await sendToExpo(
      deps.fetch,
      chunk.map((c) => c.expo),
      env.EXPO_ACCESS_TOKEN,
    );
    chunk.forEach(({ item, expo }, index) => {
      if (result.kind === 'retry') retry.add(item.message);
      if (result.kind !== 'ok') return;
      const ticket = result.value[index];
      const code = ticket === undefined ? null : errorCodeOf(ticket);
      if (code !== null && RETRYABLE_ERRORS.has(code)) retry.add(item.message);
      if (code === 'DeviceNotRegistered') {
        dropped.push({ person: item.person, device: item.device, token: expo.to });
      }
    });
  }
  for (const { message } of refreshes) {
    if (retry.has(message)) message.retry({ delaySeconds: backoffSeconds(message.attempts) });
    else message.ack();
  }
  await Promise.all(
    dropped.map(({ person, device, token }) => cottageOf(env, person).dropPushToken(device, token)),
  );
}
