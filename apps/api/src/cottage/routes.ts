import {
  ActivityStartTokenRequest,
  ActivityTokenRequest,
  ChatRowUpdate,
  type DeviceList,
  type ErrorBody,
  type ErrorCode,
  HibernateRequest,
  Id,
  MeSettingsUpdate,
  PushOpenedRequest,
  RegisterDeviceRequest,
  RememberRequest,
  FarmId,
  type QuickTendList,
  Seq,
} from '@kithfield/contracts';
import { type Context, Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';

import { withinSocketLimit } from '../socket-limit';
import { newActionKey, storeActionKey } from './action-key';
import { cottageAdapters, type SessionRouteEnv } from './adapters';
import { linkSession, listDevices, signOutDevice } from './device-sessions';
import { cottageOf } from './stub';

type RouteEnv = SessionRouteEnv;

/** An Expo push token, as `getExpoPushTokenAsync` gives it. */
const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

const fail = (
  c: Context,
  status: 400 | 401 | 404 | 409 | 429,
  code: ErrorCode,
  fields?: string[],
) => c.json<ErrorBody>({ error: fields === undefined ? { code } : { code, fields } }, status);

/** The request's JSON body checked against a schema, or the `400 bad_request` to answer with. */
async function bodyOf<S extends z.ZodType>(
  c: Context<RouteEnv>,
  schema: S,
): Promise<{ ok: true; value: z.infer<S> } | { ok: false; response: Response }> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const fields = parsed.error.issues.map((issue) => issue.path.join('.') || '(body)');
  return { ok: false, response: fail(c, 400, 'bad_request', fields.slice(0, 50)) };
}

/** `DELETE …/activities`: the activity, as `ActivityTokenRequest` names it, without its token. */
const ActivityKeyRequest = z.discriminatedUnion('activity', [
  z.object({ activity: z.literal('plan_day'), farm: FarmId, seed: Seq }),
  z.object({ activity: z.literal('fire'), farm: FarmId }),
]);

/** Lets a request through only with a signed-in session, and names its person. */
const signedIn = createMiddleware<RouteEnv>((c, next) => cottageAdapters().requireSession(c, next));

/**
 * The person's cottage over HTTP: devices and their action keys, settings, hibernating,
 * remember-me seeds, Quick Tend, chat pins, opened pushes, and the cottage socket.
 */
export function cottageRoutes(): Hono<RouteEnv> {
  const app = new Hono<RouteEnv>();

  // The token comes in the first frame, never the URL; the cottage checks it is this person's.
  app.get('/v1/cottage/:person/socket', async (c) => {
    const person = Id.safeParse(c.req.param('person'));
    if (!person.success) return fail(c, 404, 'not_found');
    if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
      return fail(c, 400, 'bad_request', ['Upgrade']);
    }
    if (!(await withinSocketLimit(c.env, c.req.raw))) return fail(c, 429, 'rate_limited');
    return cottageOf(c.env, person.data).fetch(c.req.raw);
  });

  // Registering again rotates the device's action key. A device that was someone else's leaves
  // their cottage.
  app.put('/v1/devices/:deviceId', signedIn, async (c) => {
    const device = Id.safeParse(c.req.param('deviceId'));
    if (!device.success) return fail(c, 400, 'bad_request', ['deviceId']);
    const body = await bodyOf(c, RegisterDeviceRequest);
    if (!body.ok) return body.response;
    const { pushToken } = body.value;
    if (pushToken !== null && !EXPO_PUSH_TOKEN.test(pushToken)) {
      return fail(c, 400, 'bad_request', ['pushToken']);
    }
    const person = c.get('person');
    await cottageOf(c.env, person).registerDevice(device.data, body.value);
    const city = (c.req.raw.cf as { city?: unknown } | undefined)?.city;
    await linkSession(c.env.DB, {
      session: c.get('session'),
      person,
      device: device.data,
      name: body.value.name,
      platform: body.value.platform,
      city: typeof city === 'string' ? city : null,
      at: Date.now(),
    });
    const actionKey = newActionKey();
    const displaced = await storeActionKey(
      c.env.DB,
      person,
      device.data,
      actionKey,
      pushToken,
      Date.now(),
    );
    await Promise.all([
      ...displaced.deviceOwners.map((other) => cottageOf(c.env, other).forgetDevice(device.data)),
      ...displaced.tokenHolders.map(({ person: other, device: theirs }) =>
        cottageOf(c.env, other).dropPushToken(theirs, pushToken ?? ''),
      ),
    ]);
    return c.json({ actionKey });
  });

  // The device's push-to-start token, so the server can start a plan's day on it.
  app.put('/v1/devices/:deviceId/activity-start', signedIn, async (c) => {
    const device = Id.safeParse(c.req.param('deviceId'));
    if (!device.success) return fail(c, 404, 'not_found');
    const body = await bodyOf(c, ActivityStartTokenRequest);
    if (!body.ok) return body.response;
    const cottage = cottageOf(c.env, c.get('person'));
    const kept = await cottage.setActivityStartToken(
      device.data,
      body.value.token,
      body.value.bundleId,
    );
    return kept ? c.body(null, 204) : fail(c, 404, 'not_found');
  });

  // A running activity's update token, so the server can move it along; DELETE when it ends.
  app.put('/v1/devices/:deviceId/activities', signedIn, async (c) => {
    const device = Id.safeParse(c.req.param('deviceId'));
    if (!device.success) return fail(c, 404, 'not_found');
    const body = await bodyOf(c, ActivityTokenRequest);
    if (!body.ok) return body.response;
    const kept = await cottageOf(c.env, c.get('person')).setActivityToken(device.data, body.value);
    return kept ? c.body(null, 204) : fail(c, 404, 'not_found');
  });

  app.delete('/v1/devices/:deviceId/activities', signedIn, async (c) => {
    const device = Id.safeParse(c.req.param('deviceId'));
    if (!device.success) return fail(c, 404, 'not_found');
    const body = await bodyOf(c, ActivityKeyRequest);
    if (!body.ok) return body.response;
    const known = await cottageOf(c.env, c.get('person')).dropActivityToken(
      device.data,
      body.value,
    );
    return known ? c.body(null, 204) : fail(c, 404, 'not_found');
  });

  // Where the person is signed in: one row per device, the one asking marked `current`.
  app.get('/v1/devices', signedIn, async (c) =>
    c.json(
      (await listDevices(
        c.env.DB,
        c.get('person'),
        c.get('session'),
        Date.now(),
      )) satisfies DeviceList,
    ),
  );

  // Signs one device out from another: its session ends and its sockets hear `session_ended`.
  app.delete('/v1/devices/:deviceId', signedIn, async (c) => {
    const device = Id.safeParse(c.req.param('deviceId'));
    if (!device.success) return fail(c, 404, 'not_found');
    const ended = await signOutDevice(c.env, c.get('person'), device.data);
    return ended ? c.body(null, 204) : fail(c, 404, 'not_found');
  });

  // The app sends `timeZone` and `quietHours` on first launch and whenever the phone's zone changes.
  app.patch('/v1/me/settings', signedIn, async (c) => {
    const body = await bodyOf(c, MeSettingsUpdate);
    if (!body.ok) return body.response;
    return c.json(await cottageOf(c.env, c.get('person')).updateSettings(body.value));
  });

  app.put('/v1/me/hibernate', signedIn, async (c) => {
    const body = await bodyOf(c, HibernateRequest);
    if (!body.ok) return body.response;
    const person = c.get('person');
    await cottageOf(c.env, person).setHibernating(body.value.on);
    // Always, even when the cottage already had it, so a fan-out that failed can be retried.
    await cottageAdapters().fanOutHibernate(c.env, person, body.value.on);
    return c.body(null, 204);
  });

  app.post('/v1/remember', signedIn, async (c) => {
    const body = await bodyOf(c, RememberRequest);
    if (!body.ok) return body.response;
    const id = await cottageOf(c.env, c.get('person')).plantSeed(body.value);
    if (id === null) return fail(c, 409, 'conflict');
    return c.json({ id }, 201);
  });

  app.get('/v1/remember', signedIn, async (c) =>
    c.json({ seeds: await cottageOf(c.env, c.get('person')).listSeeds() }),
  );

  app.delete('/v1/remember/:id', signedIn, async (c) => {
    const id = Id.safeParse(c.req.param('id'));
    if (!id.success) return fail(c, 404, 'not_found');
    const removed = await cottageOf(c.env, c.get('person')).removeSeed(id.data);
    return removed ? c.body(null, 204) : fail(c, 404, 'not_found');
  });

  // Waiting across the person's farms and visits, newest first.
  app.get('/v1/quick-tend', signedIn, async (c) =>
    c.json((await cottageOf(c.env, c.get('person')).quickTend()) satisfies QuickTendList),
  );

  // Pins a farm or visit to the top of the chat list, or unpins it.
  app.patch('/v1/chats/:farm', signedIn, async (c) => {
    const farm = FarmId.safeParse(c.req.param('farm'));
    if (!farm.success) return fail(c, 404, 'not_found');
    const body = await bodyOf(c, ChatRowUpdate);
    if (!body.ok) return body.response;
    const pinned = await cottageOf(c.env, c.get('person')).pinFarm(farm.data, body.value.pinned);
    return pinned ? c.body(null, 204) : fail(c, 404, 'not_found');
  });

  // An opened push; the same answer for an id the cottage doesn't know.
  app.post('/v1/push/opened', signedIn, async (c) => {
    const body = await bodyOf(c, PushOpenedRequest);
    if (!body.ok) return body.response;
    await cottageOf(c.env, c.get('person')).pushOpened(body.value.id);
    return c.body(null, 204);
  });

  return app;
}
