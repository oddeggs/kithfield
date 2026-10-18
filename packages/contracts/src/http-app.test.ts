import { describe, expect, it } from 'vitest';

import * as account from './http/account';
import * as farms from './http/farms';
import {
  at,
  bea,
  critter,
  describeSchemas,
  eventPayloads,
  farm,
  opId,
  pip,
} from './samples.test-data';

const url = 'https://kithfield.com/i/thursday-lot';
const key = 'farm/f_thursday_lot/0192f1e2-3b4c-7d5e-8f60-123456789abc';
const event = { seq: 41, opId, at, actor: bea, rulesVersion: 1, kind: 'message' };
const invite = { code: 'thursday-lot', url, expiresAt: null };
const device = {
  device: 'd_1',
  name: "June's iPhone",
  platform: 'ios',
  city: 'London',
  lastActiveAt: at,
  current: true,
};

const samples: Record<string, [valid: unknown[], invalid: unknown[]]> = {
  EventsPage: [
    [{ events: [{ ...event, payload: eventPayloads.message }], more: true }],
    [{ events: [] }],
  ],
  SearchQuery: [[{ q: 'picnic' }], [{ q: '' }, { q: 'x'.repeat(101) }]],
  SearchResults: [
    [{ results: [{ seq: 41, at, actor: bea, kind: 'message', snippet: 'a <b>picnic</b>' }] }],
    [{ results: [{ seq: 41, at, actor: bea, kind: 'gossip', snippet: 'x' }] }],
  ],
  Invite: [[invite, { ...invite, expiresAt: at }], [{ ...invite, code: 'a b' }]],
  CreateFarmRequest: [
    [{ name: 'The Thursday Lot', land: 'meadow' }],
    [{ name: '', land: 'meadow' }],
  ],
  CreateFarmResponse: [[{ farm, invite }], [{ farm }]],
  OpenVisitRequest: [[{ person: pip }], [{}]],
  OpenVisitResponse: [[{ farm }], [{ farm: '' }]],
  FarmList: [
    [
      {
        farms: [
          {
            farm,
            kind: 'farm',
            name: 'The Thursday Lot',
            land: 'meadow',
            role: 'keeper',
            joinedAt: at,
          },
        ],
      },
    ],
    [{ farms: [{ farm, kind: 'group' }] }],
  ],
  CreateInviteRequest: [[{ expiresAt: null }, { expiresAt: at }], [{}]],
  InvitePreview: [
    [
      {
        name: 'The Thursday Lot',
        land: 'meadow',
        critters: ['rabbit', 'owl'],
        full: false,
        approval: true,
      },
    ],
    [{ name: 'x', land: 'meadow', critters: Array(25).fill('owl'), full: false, approval: false }],
  ],
  JoinRequest: [[{ name: 'June', critter }], [{ name: 'June' }]],
  JoinResponse: [[{ farm, status: 'waiting_for_keeper' }], [{ farm, status: 'maybe' }]],
  FarmNotifications: [
    [
      {
        mutedUntil: 'always',
        knockFor: { plans: true, doorstep: true, mentions: true, messages: false },
      },
      {
        mutedUntil: null,
        knockFor: { plans: true, doorstep: false, mentions: true, messages: false },
      },
    ],
    [{ mutedUntil: 'forever', knockFor: {} }],
  ],
  FireTokenRequest: [[{ mode: 'listen' }], [{ mode: 'speak' }]],
  FireTokenResponse: [
    [
      {
        url: 'wss://fire.example.livekit.cloud',
        room: 'f_thursday_lot',
        token: 'x'.repeat(40),
        expiresAt: at,
      },
    ],
    [{ url: 'http://x', room: 'r', token: 'x'.repeat(40), expiresAt: at }],
  ],
  UploadUrlRequest: [
    [{ farm, kind: 'photo', bytes: 812_000, mime: 'image/jpeg' }],
    [
      { farm, kind: 'photo', bytes: 101 * 1024 * 1024, mime: 'image/jpeg' },
      { farm, kind: 'gif', bytes: 1, mime: 'image/gif' },
    ],
  ],
  UploadUrlResponse: [
    [
      { upload: 'single', key, url, expiresAt: at },
      {
        upload: 'multipart',
        key,
        uploadId: 'u1',
        partBytes: 8 * 1024 * 1024,
        parts: [{ part: 1, url }],
        completeUrl: url,
        expiresAt: at,
      },
    ],
    [{ upload: 'single', key: 'other/key', url, expiresAt: at }],
  ],
  RtTokenRequest: [[{}, { farm }], [{ farm: 'bad id!' }]],
  RtTokenResponse: [
    [{ token: 'x'.repeat(32), expiresAt: at }],
    [{ token: 'short', expiresAt: at }],
  ],
  Platform: [['ios', 'windows'], ['symbian']],
  RegisterDeviceRequest: [
    [
      {
        platform: 'ios',
        name: "June's iPhone",
        pushToken: 'ExponentPushToken[abc]',
        appVersion: '1.0.0 (412)',
      },
    ],
    [{ platform: 'ios', name: 'x', pushToken: null, appVersion: 'one' }],
  ],
  DeviceList: [
    [{ devices: [device, { ...device, city: null, current: false }] }],
    [{ devices: [{ ...device, platform: 'tv' }] }],
  ],
  DesktopLinkResponse: [
    [{ code: 'abcdefghijklmnop', expiresAt: at }],
    [{ code: 'short', expiresAt: at }],
  ],
  DesktopLinkPreview: [
    [{ name: "June's MacBook Air", platform: 'macos', city: 'London' }],
    [{ name: '', platform: 'macos', city: null }],
  ],
  AgeRequest: [[{ birthYear: 2001, country: 'VN' }], [{ birthYear: 2001, country: 'vn' }]],
  TermsRequest: [[{ version: '2026-10-01' }], [{ version: 'latest' }]],
  AiFeature: [['captions', 'recap'], ['catch_up']],
  ConsentRequest: [
    [{ allowed: true, textVersion: '2026-10.1' }],
    [{ allowed: 'yes', textVersion: '1' }],
  ],
  ConsentList: [
    [{ consents: [{ feature: 'recap', allowed: false, textVersion: '1', at }] }],
    [{ consents: [{ feature: 'recap' }] }],
  ],
  DeleteAccountResponse: [[{ purgeAt: at }], [{}]],
  DeletionRequest: [[{ email: 'june@example.com', lang: 'vi' }], [{ email: 'june', lang: 'en' }]],
  WaitlistRequest: [
    [{ email: 'june@example.com', lang: 'en' }],
    [{ email: 'june@example.com', lang: 'fr' }],
  ],
  BlockList: [[{ blocked: [pip] }], [{ blocked: ['bad id!'] }]],
};

describeSchemas('HTTP bodies for farms and accounts', { ...farms, ...account }, samples, [
  'EventsQuery',
]);

describe('the events paging query', () => {
  it('coerces the paging query from strings', () => {
    expect(farms.EventsQuery.parse({ after: '40', limit: '200' })).toEqual({
      after: 40,
      limit: 200,
    });
    expect(farms.EventsQuery.parse({ before: '41' })).toEqual({ before: 41, limit: 50 });
    for (const bad of [
      { limit: '201' },
      { after: '-1' },
      { after: '9', before: '9' },
      { after: 'x' },
    ]) {
      expect(farms.EventsQuery.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
