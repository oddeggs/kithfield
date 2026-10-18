import * as account from './http/account';
import * as me from './http/me';
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
  quietHours: { from: '22:00', to: '07:30', timeZone: 'Asia/Ho_Chi_Minh' },
  discoverableByPhone: false,
  lightWindow: true,
  nudges: 'few',
  backOffWhenQuiet: true,
  inTogetherStickers: true,
};
const hash = 'a'.repeat(64);
const remember = { farm, fromSeq: 12, about: bea, title: "Bea's interview", nudgeAt: at };

const samples: Record<string, [valid: unknown[], invalid: unknown[]]> = {
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
  RegisterDeviceResponse: [[{ actionKey: 'k'.repeat(43) }], [{ actionKey: 'short' }]],
  SignInMethod: [['apple', 'phone'], ['anonymous']],
  QuietHours: [[settings.quietHours], [{ from: '24:00', to: '07:00', timeZone: 'UTC' }]],
  MeSettings: [[settings, { ...settings, quietHours: null }], [{ ...settings, nudges: 'daily' }]],
  MeSettingsUpdate: [[{ nudges: 'off' }, { quietHours: null }], [{}]],
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
