import { ActivityStartTokenRequest, ActivityTokenRequest, type FarmId } from '@kithfield/contracts';
import { z } from 'zod';

import type { DataClient } from '../../data';
import type { RunningActivity } from '../../../modules/surfaces';
import { surfaces } from '../../../modules/surfaces';
import { appBundleId, deviceId } from '../../ui/session/push-registration';

/*
 * Hands the server the tokens it moves Live Activities with: the device's push-to-start token
 * (`PUT /v1/devices/:id/activity-start`), each running activity's update token
 * (`PUT /v1/devices/:id/activities`) and, when one ends, takes it back (`DELETE`, same path).
 */

/** The token request for an activity by its key (`<farm>:<seed>` or `<farm>`). */
export function tokenTarget(
  activity: Pick<RunningActivity, 'kind' | 'key'>,
):
  { activity: 'plan_day'; farm: FarmId; seed: number } | { activity: 'fire'; farm: FarmId } | null {
  if (activity.kind === 'fire') return { activity: 'fire', farm: activity.key };
  const at = activity.key.lastIndexOf(':');
  const seed = Number(activity.key.slice(at + 1));
  if (at <= 0 || !Number.isInteger(seed) || seed <= 0) return null;
  return { activity: 'plan_day', farm: activity.key.slice(0, at), seed };
}

/** Follows the tokens while the app runs; answers how to stop. */
export function followActivityTokens(client: DataClient, report: (e: unknown) => void) {
  if (surfaces === null) return () => undefined;
  const path = async (end: string) => `/v1/devices/${encodeURIComponent(await deviceId())}/${end}`;
  const send = (method: 'PUT' | 'DELETE', end: string, body: unknown) =>
    path(end)
      .then((p) => client.api.request(z.unknown(), method, p, body))
      .catch(report);
  const subs = [
    surfaces.addListener('onPushToStartToken', ({ token }) => {
      const body = ActivityStartTokenRequest.safeParse({ token, ...appBundleId() });
      if (body.success) void send('PUT', 'activity-start', body.data);
    }),
    surfaces.addListener('onActivityToken', (event) => {
      const target = tokenTarget(event);
      const body =
        target &&
        ActivityTokenRequest.safeParse({ ...target, token: event.token, ...appBundleId() });
      if (body?.success) void send('PUT', 'activities', body.data);
    }),
    surfaces.addListener('onActivityEnded', (event) => {
      const target = tokenTarget(event);
      if (target) void send('DELETE', 'activities', target);
    }),
  ];
  return () => subs.forEach((s) => s.remove());
}
