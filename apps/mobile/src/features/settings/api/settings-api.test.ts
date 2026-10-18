import { describe, expect, it } from '@jest/globals';
import {
  BlockList,
  ConsentList,
  CurrentInvite,
  DeleteAccountResponse,
  DesktopLinkPreview,
  DeviceList,
  ExportStatus,
  FarmNotificationsView,
  Me,
  ReportRequest,
  SafetyNoteList,
} from '@kithfield/contracts';

import { safetyApi } from '../../safety/safety-api';
import { ApiError, createRequest, isNotServed } from './request';
import { settingsApi } from './settings-api';

interface Seen {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
  readonly auth: string | undefined;
}

/** A server at the network boundary: answers each path with a status and a body. */
function server(routes: Record<string, [number, unknown?]>) {
  const seen: Seen[] = [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    seen.push({
      method,
      url,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      auth: headers['authorization'],
    });
    const path = url.replace('https://test.kithfield.invalid/api', '');
    const [status, body] = routes[`${method} ${path}`] ?? [404, { error: { code: 'not_found' } }];
    return Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
    );
  };
  let unauthorized = 0;
  const request = createRequest({
    baseUrl: 'https://test.kithfield.invalid/api',
    fetch,
    authHeaders: () => Promise.resolve({ authorization: 'Bearer t' }),
    onUnauthorized: () => {
      unauthorized += 1;
    },
  });
  return {
    seen,
    unauthorized: () => unauthorized,
    settings: settingsApi(request),
    safety: safetyApi(request),
  };
}

const T = 1_792_000_000_000;
const settings = {
  lang: 'en',
  timeZone: 'Europe/London',
  quietHours: null,
  discoverableByPhone: false,
  lightWindow: true,
  nudges: 'few',
  backOffWhenQuiet: true,
  inTogetherStickers: true,
} as const;
const me = Me.parse({
  person: 'june',
  name: 'June',
  critter: {
    species: 'rabbit',
    coat: 'cocoa',
    mark: null,
    accessory: null,
    outfit: 'scarf',
    outfitColor: '#5e7f4a',
    companion: null,
    cottage: null,
  },
  birthday: null,
  signIn: ['apple'],
  ageOk: true,
  termsVersion: '2026-10-01',
  currentTermsVersion: '2026-10-01',
  hibernating: false,
  settings,
  purgeAt: null,
});

describe('the settings calls', () => {
  it('sends quiet hours with the time zone they are read in, signed in', async () => {
    const s = server({ 'PATCH /v1/me/settings': [200, settings] });
    await s.settings.updateSettings({
      timeZone: 'Asia/Ho_Chi_Minh',
      quietHours: { from: '21:00', to: '08:00' },
    });
    expect(s.seen).toEqual([
      {
        method: 'PATCH',
        url: 'https://test.kithfield.invalid/api/v1/me/settings',
        body: { timeZone: 'Asia/Ho_Chi_Minh', quietHours: { from: '21:00', to: '08:00' } },
        auth: 'Bearer t',
      },
    ]);
  });

  it('reads the person and hibernates them', async () => {
    const s = server({ 'GET /v1/me': [200, me], 'PUT /v1/me/hibernate': [204] });
    await expect(s.settings.me()).resolves.toEqual(me);
    await s.settings.hibernate(true);
    expect(s.seen[1]).toMatchObject({ method: 'PUT', body: { on: true } });
  });

  it('lists devices and signs one out by its id', async () => {
    const devices = DeviceList.parse({
      devices: [
        {
          device: 'd1',
          name: "June's iPhone",
          platform: 'ios',
          city: 'London',
          lastActiveAt: T,
          current: true,
        },
        {
          device: 'd2',
          name: 'Old iPad',
          platform: 'ios',
          city: null,
          lastActiveAt: T - 1,
          current: false,
        },
      ],
    });
    const s = server({ 'GET /v1/devices': [200, devices], 'DELETE /v1/devices/d2': [204] });
    await expect(s.settings.devices()).resolves.toEqual(devices);
    await s.settings.signOutDevice('d2');
    expect(s.seen[1]?.method).toBe('DELETE');
  });

  it('shows a computer before approving or declining its code', async () => {
    const preview = DesktopLinkPreview.parse({
      name: "June's MacBook Air",
      platform: 'macos',
      city: 'London',
    });
    const s = server({
      'GET /v1/desktop-link/abcdefghijklmnop': [200, preview],
      'POST /v1/desktop-link/abcdefghijklmnop/approve': [204],
      'POST /v1/desktop-link/abcdefghijklmnop/decline': [204],
    });
    await expect(s.settings.desktopLink('abcdefghijklmnop')).resolves.toEqual(preview);
    await s.settings.approveDesktopLink('abcdefghijklmnop');
    await s.settings.declineDesktopLink('abcdefghijklmnop');
    expect(s.seen.map((x) => x.method)).toEqual(['GET', 'POST', 'POST']);
  });

  it('starts the keepsakes, reads them, and deletes the account', async () => {
    const preparing = ExportStatus.parse({
      state: 'preparing',
      url: null,
      requestedAt: T,
      expiresAt: null,
    });
    const deleted = DeleteAccountResponse.parse({ purgeAt: T + 30 * 86_400_000 });
    const s = server({
      'POST /v1/me/export': [202, preparing],
      'GET /v1/me/export': [
        200,
        { ...preparing, state: 'ready', url: 'https://kithfield.com/x.zip', expiresAt: T + 1 },
      ],
      'POST /v1/me/delete': [202, deleted],
    });
    await expect(s.settings.startExport()).resolves.toEqual(preparing);
    await expect(s.settings.exportStatus()).resolves.toMatchObject({ state: 'ready' });
    await expect(s.settings.deleteAccount()).resolves.toEqual(deleted);
    expect(s.seen[2]).toMatchObject({ method: 'POST', body: undefined });
  });

  it('records consent with its wording, and asks for what was sent to be forgotten', async () => {
    const list = ConsentList.parse({
      consents: [{ feature: 'captions', allowed: true, textVersion: '2026-10-18', at: T }],
    });
    const s = server({
      'GET /v1/me/consents': [200, list],
      'PUT /v1/me/consents/recap': [204],
      'POST /v1/me/consents/captions/forget': [202],
    });
    await expect(s.settings.consents()).resolves.toEqual(list);
    await s.settings.setConsent('recap', { allowed: false, textVersion: '2026-10-18' });
    await s.settings.forgetConsent('captions');
    expect(s.seen[1]).toMatchObject({ body: { allowed: false, textVersion: '2026-10-18' } });
  });

  it('blocks, lists and unblocks, never with a body', async () => {
    const blocked = BlockList.parse({
      blocked: [{ person: 'bram', name: null, critter: null, at: T }],
    });
    const s = server({
      'PUT /v1/blocks/bram': [204],
      'GET /v1/blocks': [200, blocked],
      'DELETE /v1/blocks/bram': [204],
    });
    await s.settings.block('bram');
    await expect(s.settings.blocks()).resolves.toEqual(blocked);
    await s.settings.unblock('bram');
    expect(s.seen.map((x) => [x.method, x.body])).toEqual([
      ['PUT', undefined],
      ['GET', undefined],
      ['DELETE', undefined],
    ]);
  });

  it('reads the current invite, which may be none, and makes a new one', async () => {
    const s = server({
      'GET /v1/farms/f1/invite': [200, CurrentInvite.parse({ invite: null })],
      'POST /v1/farms/f1/invites': [
        201,
        { code: 'thursday-lot', url: 'https://kith.fm/thursday-lot', expiresAt: null },
      ],
    });
    await expect(s.settings.currentInvite('f1')).resolves.toEqual({ invite: null });
    await expect(s.settings.newInvite('f1', { expiresAt: null })).resolves.toMatchObject({
      code: 'thursday-lot',
    });
  });

  it('mutes a farm, and turns a resting kind back on', async () => {
    const view = FarmNotificationsView.parse({
      mutedUntil: null,
      knockFor: { plans: true, doorstep: true, mentions: true, messages: false },
      resting: [{ type: 'birthdays', until: T }],
    });
    const s = server({
      'GET /v1/farms/f1/notifications': [200, view],
      'PUT /v1/farms/f1/notifications': [200, { mutedUntil: 'always', knockFor: view.knockFor }],
      'DELETE /v1/farms/f1/notifications/resting/birthdays': [204],
    });
    await expect(s.settings.notifications('f1')).resolves.toEqual(view);
    await s.settings.setNotifications('f1', { mutedUntil: 'always', knockFor: view.knockFor });
    await s.settings.wakeResting('f1', 'birthdays');
    expect(s.seen[1]?.body).toEqual({ mutedUntil: 'always', knockFor: view.knockFor });
  });
});

describe('the safety calls', () => {
  it('reports a message with the reason and the block, and reads the notes', async () => {
    const report = ReportRequest.parse({
      farm: 'f1',
      about: { about: 'event', seq: 42 },
      reason: 'unkind',
      alsoBlock: true,
    });
    const notes = SafetyNoteList.parse({
      notes: [
        {
          note: 'report_answered',
          id: 'n1',
          at: T,
          report: 'r1',
          farm: 'f1',
          farmName: 'The Thursday Lot',
          about: 'bram',
          kind: 'message',
          eventAt: T - 1,
          outcome: 'removed',
        },
      ],
    });
    const s = server({
      'POST /v1/reports': [201, { report: 'r1' }],
      'GET /v1/me/safety-notes': [200, notes],
      'POST /v1/appeals': [201, { appeal: 'a1' }],
    });
    await expect(s.safety.report(report)).resolves.toEqual({ report: 'r1' });
    await expect(s.safety.notes()).resolves.toEqual(notes);
    await expect(
      s.safety.appeal({ action: 'x1', text: 'It was a joke between us' }),
    ).resolves.toEqual({
      appeal: 'a1',
    });
    expect(s.seen[0]?.body).toEqual(report);
  });
});

describe('answers that are not what the contract says', () => {
  it('turns an error into its code and tells the session about a 401', async () => {
    const s = server({ 'GET /v1/me': [401, { error: { code: 'unauthorized' } }] });
    const error = await s.settings.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'unauthorized' });
    expect(s.unauthorized()).toBe(1);
  });

  it('refuses a success whose body breaks the contract', async () => {
    const s = server({ 'GET /v1/devices': [200, { devices: [{ device: 'd1' }] }] });
    await expect(s.settings.devices()).rejects.toMatchObject({ code: 'unknown' });
  });

  it('answers a route that isn’t there yet with not_found', async () => {
    const s = server({});
    await expect(s.settings.blocks()).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });
});

describe('routes the server doesn’t serve yet', () => {
  it('tells a missing route apart from other failures', async () => {
    const s = server({ 'GET /v1/blocks': [503, { error: { code: 'unavailable' } }] });
    const missing = await s.settings.devices().catch((e: unknown) => e);
    const down = await s.settings.blocks().catch((e: unknown) => e);
    expect(isNotServed(missing)).toBe(true);
    expect(isNotServed(down)).toBe(false);
    expect(isNotServed(new TypeError('Network request failed'))).toBe(false);
  });
});
