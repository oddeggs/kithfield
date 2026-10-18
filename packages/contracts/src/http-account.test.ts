import { describe, expect, it } from 'vitest';

import * as account from './http/account';
import * as me from './http/me';
import { CritterChangedPayload } from './payloads/farm';
import { at, bea, critter, farm, pip } from './samples.test-data';
import { describeSchemas } from './schema-runner.test-data';

const device = {
  device: 'd_1',
  name: "June's iPhone",
  platform: 'ios',
  city: 'London',
  lastActiveAt: at,
  current: true,
};
const settings = {
  lang: 'vi',
  timeZone: 'Asia/Ho_Chi_Minh',
  quietHours: { from: '22:00', to: '07:30' },
  discoverableByPhone: false,
  lightWindow: true,
  nudges: 'few',
  backOffWhenQuiet: true,
  inTogetherStickers: true,
};
const hash = 'a'.repeat(64);
const remember = { farm, fromSeq: 12, about: bea, title: "Bea's interview", nudgeAt: at };

const samples: Record<string, [valid: unknown[], invalid: unknown[]]> = {
  MeProfileUpdate: [
    [
      { name: 'June', critter, birthday: '04-12' },
      { name: 'June' },
      { critter: { ...critter, outfit: null } },
      { birthday: null },
    ],
    [
      {},
      { name: '' },
      { name: 'x'.repeat(33) },
      { critter: { ...critter, species: 'dragon' } },
      { birthday: '12/04' },
      { name: null },
    ],
  ],
  SignInNonceResponse: [
    [{ nonce: 'n'.repeat(43), expiresAt: at }],
    [
      { nonce: 'n'.repeat(43) },
      { nonce: 'n'.repeat(42), expiresAt: at },
      { nonce: `${'n'.repeat(42)}=`, expiresAt: at },
    ],
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
  BlockList: [
    [
      { blocked: [{ person: pip, name: 'Pip', critter, at }] },
      { blocked: [{ person: 'p_gone', name: null, critter: null, at }] },
      { blocked: [] },
    ],
    [{ blocked: [pip] }, { blocked: [{ person: 'bad id!', name: null, critter: null, at }] }],
  ],
  ExportStatus: [
    [
      { state: 'preparing', url: null, requestedAt: at, expiresAt: null },
      {
        state: 'ready',
        url: 'https://media.kithfield.com/export/x',
        requestedAt: at,
        expiresAt: at + 7 * 86_400_000,
      },
    ],
    [{ state: 'zipping', url: null, requestedAt: at, expiresAt: null }, { state: 'ready' }],
  ],
  PushOpenedRequest: [[{ id: 'pu_8f2c' }], [{ id: '' }, { id: 'a/b' }, {}]],
  ChatRowUpdate: [
    [{ pinned: true }, { pinned: false }],
    [{}, { pinned: 'yes' }],
  ],
  QuickTendWhy: [['question', 'birthday'], ['streak']],
  QuickTendList: [
    [
      {
        items: [
          {
            farm,
            farmKind: 'farm',
            name: 'The Thursday Lot',
            with: null,
            seq: 41,
            kind: 'message',
            actor: bea,
            at,
            preview: 'Bea: who is coming saturday?',
            why: 'question',
          },
          {
            farm: 'f_visit',
            farmKind: 'visit',
            name: null,
            with: { person: pip, name: 'Pip', critter },
            seq: 9,
            kind: 'firefly',
            actor: pip,
            at,
            preview: null,
            why: 'doorstep',
          },
        ],
      },
      { items: [] },
    ],
    [{ items: [{ farm, seq: 41, why: 'question' }] }],
  ],
  RegisterDeviceResponse: [[{ actionKey: 'k'.repeat(43) }], [{ actionKey: 'short' }]],
  SignInMethod: [['apple', 'phone'], ['anonymous']],
  QuietHours: [[settings.quietHours], [{ from: '24:00', to: '07:00' }, { from: '22:00' }]],
  MeSettings: [
    [settings, { ...settings, quietHours: null }],
    [
      { ...settings, nudges: 'daily' },
      { ...settings, timeZone: undefined },
      { ...settings, timeZone: 'Saigon' },
    ],
  ],
  MeSettingsUpdate: [
    [
      { nudges: 'off' },
      { quietHours: null },
      { timeZone: 'Europe/London', quietHours: settings.quietHours },
    ],
    [{}, { timeZone: 'GMT+7' }],
  ],
  Me: [
    [
      {
        person: pip,
        name: 'Pip',
        critter,
        birthday: '03-14',
        signIn: ['apple'],
        ageOk: true,
        termsVersion: '2026-10-01',
        currentTermsVersion: '2026-10-18',
        hibernating: false,
        settings,
        purgeAt: null,
      },
      {
        person: 'p_new',
        name: null,
        critter: null,
        birthday: null,
        signIn: [],
        ageOk: false,
        termsVersion: null,
        currentTermsVersion: '2026-10-18',
        hibernating: false,
        settings,
        purgeAt: at,
      },
    ],
    [{ person: pip, name: 'Pip', signIn: ['myspace'] }],
  ],
  HibernateRequest: [[{ on: true }], [{ on: 'zzz' }]],
  ContactHash: [[hash], ['A'.repeat(64), '+447700900123']],
  ContactMatchRequest: [[{ hashes: [hash] }], [{ hashes: [] }, { hashes: Array(2001).fill(hash) }]],
  ContactMatchResponse: [
    [{ matches: [{ hash, person: pip, name: 'Pip', critter }] }, { matches: [] }],
    [{ matches: [{ hash, person: pip }] }],
  ],
  RememberRequest: [
    [remember, { farm, about: bea, title: 'Driving test', nudgeAt: at }],
    [
      { ...remember, about: undefined },
      { ...remember, title: '' },
    ],
  ],
  RememberResponse: [[{ id: 'r_1' }], [{}]],
  RememberSeed: [[{ ...remember, id: 'r_1', createdAt: at }], [remember]],
  RememberList: [[{ seeds: [{ ...remember, id: 'r_1', createdAt: at }] }], [{ seeds: [remember] }]],
};

describeSchemas('HTTP bodies for accounts and the person', { ...account, ...me }, samples);

describe('a profile change on every farm', () => {
  it('maps onto a critter_changed payload key for key', () => {
    const updates = [
      { name: 'June', critter, birthday: '04-12' },
      { birthday: null },
      { critter: { ...critter, coat: 'grey' } },
    ];
    for (const update of updates) {
      const parsed = me.MeProfileUpdate.parse(update);
      expect(CritterChangedPayload.parse(parsed)).toEqual(parsed);
    }
    expect(Object.keys(me.MeProfileUpdate.shape).sort()).toEqual(
      Object.keys(CritterChangedPayload.shape).sort(),
    );
  });
});

describe('the Terms in force', () => {
  it('always tells the app which Terms version to accept', () => {
    const base = {
      person: pip,
      name: 'Pip',
      critter,
      birthday: null,
      signIn: ['email'],
      ageOk: true,
      termsVersion: '2026-10-01',
      currentTermsVersion: '2026-10-18',
      hibernating: false,
      settings,
      purgeAt: null,
    };
    expect(me.Me.safeParse(base).success).toBe(true);
    expect(me.Me.safeParse({ ...base, currentTermsVersion: undefined }).success).toBe(false);
    expect(me.Me.safeParse({ ...base, currentTermsVersion: 'latest' }).success).toBe(false);
  });
});
