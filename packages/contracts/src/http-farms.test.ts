import { describe, expect, it } from 'vitest';

import * as farms from './http/farms';
import * as media from './http/media';
import { at, bea, critter, eventPayloads, farm, opId, pip } from './samples.test-data';
import { describeSchemas } from './schema-runner.test-data';

const url = 'https://kithfield.com/i/thursday-lot';
const key = 'farm/f_thursday_lot/0192f1e2-3b4c-7d5e-8f60-123456789abc';
const copy = 'farm/f_book_club/0192f1e2-3b4c-7d5e-8f60-123456789abd';
const event = {
  seq: 41,
  opId,
  at,
  day: '2026-10-18',
  actor: bea,
  rulesVersion: 2,
  kind: 'message',
};
const invite = { code: 'thursday-lot', url, expiresAt: null };
const calendar = { timeZone: 'Europe/London', hemisphere: 'north' };
const gate = {
  farm: 'f_fern_hollow',
  name: 'Fern Hollow',
  land: 'orchard',
  theme: null,
  hemisphere: 'north',
  season: { season: 'autumn', year: 2026 },
  signature: 'plum',
  inSeason: ['pumpkin', 'apple'],
  critters: [{ person: 'p_kit', name: 'Kit', critter }],
};

const samples: Record<string, [valid: unknown[], invalid: unknown[]]> = {
  EventsPage: [
    [
      {
        events: [
          { ...event, payload: eventPayloads.message },
          { ...event, seq: 42, kind: 'lantern_lit', payload: { colour: 'amber' } },
        ],
        more: true,
      },
    ],
    [{ events: [] }, { events: [{ ...event, kind: 'Bad Kind', payload: {} }], more: false }],
  ],
  SearchQuery: [[{ q: 'picnic' }], [{ q: '' }, { q: 'x'.repeat(101) }]],
  SearchResults: [
    [{ results: [{ seq: 41, at, actor: bea, kind: 'message', snippet: 'a <b>picnic</b>' }] }],
    [{ results: [{ seq: 41, at, actor: bea, kind: 'Gossip!', snippet: 'x' }] }],
  ],
  Invite: [[invite, { ...invite, expiresAt: at }], [{ ...invite, code: 'a b' }]],
  CreateFarmRequest: [
    [{ name: 'The Thursday Lot', land: 'meadow', ...calendar }],
    [
      { name: '', land: 'meadow', ...calendar },
      { name: 'The Thursday Lot', land: 'meadow' },
    ],
  ],
  CreateFarmResponse: [[{ farm, invite }], [{ farm }]],
  OpenVisitRequest: [
    [{ person: pip, ...calendar }],
    [{ person: pip }, { person: pip, timeZone: 'Mars/Base', hemisphere: 'east' }],
  ],
  OpenVisitResponse: [[{ farm }], [{ farm: '' }]],
  FarmList: [
    [
      {
        farms: [
          {
            farm,
            kind: 'farm',
            name: 'The Thursday Lot',
            with: null,
            land: 'meadow',
            role: 'keeper',
            joinedAt: at,
          },
          {
            farm: 'f_visit',
            kind: 'visit',
            name: null,
            with: { person: 'p_otis', name: 'Otis', critter },
            land: 'porch',
            role: 'critter',
            joinedAt: at,
          },
        ],
      },
    ],
    [
      { farms: [{ farm, kind: 'group' }] },
      {
        farms: [
          {
            farm,
            kind: 'visit',
            name: null,
            with: null,
            land: 'porch',
            role: 'critter',
            joinedAt: at,
          },
        ],
      },
    ],
  ],
  CreateInviteRequest: [[{ expiresAt: null }, { expiresAt: at }], [{}]],
  InvitePreview: [
    [
      {
        name: 'The Thursday Lot',
        from: { name: 'Pip', critter },
        land: 'meadow',
        critters: [critter, { ...critter, species: 'owl' }],
        full: false,
        approval: true,
      },
      {
        name: 'The Thursday Lot',
        from: null,
        land: 'meadow',
        critters: [critter],
        full: true,
        approval: false,
      },
    ],
    [
      {
        name: 'The Thursday Lot',
        land: 'meadow',
        critters: [critter],
        full: false,
        approval: false,
      },
      {
        name: 'The Thursday Lot',
        from: { name: '', critter },
        land: 'meadow',
        critters: [critter],
        full: false,
        approval: false,
      },
      {
        name: 'x',
        from: null,
        land: 'meadow',
        critters: Array(25).fill(critter),
        full: false,
        approval: false,
      },
      { name: 'x', land: 'meadow', critters: ['owl'], full: false, approval: false },
    ],
  ],
  JoinRequest: [[{ name: 'June', critter }], [{ name: 'June' }]],
  JoinResponse: [[{ farm, status: 'waiting_for_keeper' }], [{ farm, status: 'maybe' }]],
  CurrentInvite: [
    [{ invite }, { invite: null }],
    [{}, { invite: { code: 'a b' } }],
  ],
  NotificationType: [
    ['birthdays', 'nudges'],
    ['knocks', 'rare_blooms'],
  ],
  FarmNotificationsView: [
    [
      {
        mutedUntil: null,
        knockFor: { plans: true, doorstep: true, mentions: true, messages: false },
        resting: [{ type: 'birthdays', until: at + 7 * 86_400_000 }],
      },
    ],
    [
      {
        mutedUntil: null,
        knockFor: { plans: true, doorstep: true, mentions: true, messages: false },
      },
      {
        mutedUntil: null,
        knockFor: { plans: true, doorstep: true, mentions: true, messages: false },
        resting: [{ type: 'everything', until: at }],
      },
    ],
  ],
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
      {
        mutedUntil: null,
        knockFor: {
          plans: true,
          doorstep: true,
          mentions: true,
          messages: false,
          rareBlooms: true,
        },
      },
    ],
    [
      { mutedUntil: 'forever', knockFor: {} },
      {
        mutedUntil: null,
        knockFor: { plans: true, doorstep: true, mentions: true, messages: false, rareBlooms: 1 },
      },
    ],
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
        expiresAt: at,
      },
    ],
    [{ upload: 'single', key: 'other/key', url, expiresAt: at }],
  ],
  WaitingList: [
    [{ waiting: [{ person: 'p_rue', name: 'Rue', critter, askedAt: at }] }, { waiting: [] }],
    [{ waiting: [{ person: 'p_rue', name: 'Rue' }] }],
  ],
  ApprovalRequest: [[{ approve: true }, { approve: false }], [{ approve: 'yes' }]],
  FarmGate: [[gate, { ...gate, signature: null, inSeason: [] }], [{ ...gate, season: 'autumn' }]],
  GateList: [
    [
      {
        gates: [
          {
            farm: 'f_fern_hollow',
            name: 'Fern Hollow',
            land: 'orchard',
            season: { season: 'autumn', year: 2026 },
            signature: 'plum',
            friends: ['p_kit'],
          },
        ],
      },
      { gates: [] },
    ],
    [
      {
        gates: [
          {
            farm: 'f_fern_hollow',
            name: 'Fern Hollow',
            land: 'orchard',
            season: { season: 'autumn', year: 2026 },
            signature: null,
            friends: [],
          },
        ],
      },
      { gates: [{ farm: 'f_fern_hollow', name: null }] },
    ],
  ],
  GateRequest: [
    [
      { opId, gesture: { gesture: 'wave' } },
      { opId, gesture: { gesture: 'firefly', to: bea, words: 'hello from Kit' } },
      { opId, gesture: { gesture: 'gift', gift: 'g_2', to: bea, item: 'jam.plum', wrap: 'kraft' } },
      {
        opId,
        gesture: { gesture: 'gift', gift: 'g_3', to: bea, item: 'moth', wrap: 'clay', note: 'x' },
      },
    ],
    [{ opId, gesture: { gesture: 'read_chat' } }, { gesture: { gesture: 'wave' } }],
  ],
  TradeRequest: [
    [
      { opId, from: farm, with: 'p_kit', give: 'lavender', take: 'plum' },
      { opId, from: farm, with: 'p_kit', give: null, take: 'plum' },
    ],
    [
      { opId, from: farm, give: 'lavender', take: 'plum' },
      { opId, from: farm, with: 'p_kit', give: 'lavender' },
      { opId, give: null, take: 'plum' },
    ],
  ],
  CompleteUploadRequest: [
    [{ key, uploadId: 'u1', parts: [{ part: 1, etag: '"abc"' }] }],
    [{ key, uploadId: 'u1', parts: [] }],
  ],
  CompleteUploadResponse: [[{ key }], [{ key: 'elsewhere/x' }]],
  AbortUploadRequest: [
    [{ key }, { key, uploadId: 'u-1' }],
    [{ key, uploadId: '' }, {}],
  ],
  CopyMediaRequest: [
    [{ fromFarm: farm, keys: [key], farm: 'f_book_club' }],
    [
      { fromFarm: farm, keys: [], farm: 'f_book_club' },
      { fromFarm: farm, keys: [key] },
    ],
  ],
  CopyMediaResponse: [
    [{ keys: { [key]: copy } }, { keys: {} }],
    [{ keys: { [key]: 'elsewhere/x' } }, { keys: [copy] }],
  ],
  MediaQuarantineRequest: [
    [
      { key, source: 'hash_match' },
      { url: 'https://media.kithfield.com/farm/x?exp=1&sig=a', source: 'member', note: 'n-4471' },
    ],
    [{ key, url: 'https://media.kithfield.com/x', source: 'member' }, { source: 'member' }],
  ],
  MediaQuarantineResponse: [
    [
      { key, evidence: `quarantine/${key}`, first: true, held: true, report: 'R-7KQ2M9XH' },
      { key, evidence: `quarantine/${key}`, first: false, held: false, report: null },
    ],
    [{ key, evidence: key, first: true, held: true, report: null }],
  ],
  ReadUrlsRequest: [[{ keys: [key] }], [{ keys: [] }, { keys: Array(51).fill(key) }]],
  ReadUrlsResponse: [
    [{ urls: [{ key, url, expiresAt: at }] }],
    [{ urls: [{ key, url: 'ftp://x', expiresAt: at }] }],
  ],
};

describeSchemas('HTTP bodies for farms and media', { ...farms, ...media }, samples, [
  'EventsQuery',
]);

describe('the events paging query', () => {
  it('coerces the paging query from strings', () => {
    expect(farms.EventsQuery.parse({ after: '40', limit: '200' })).toEqual({
      after: 40,
      limit: 200,
    });
    expect(farms.EventsQuery.parse({ before: '41' })).toEqual({ before: 41, limit: 50 });
    expect(farms.EventsQuery.parse({ kinds: 'media,link' })).toEqual({
      limit: 50,
      kinds: ['media', 'link'],
    });
    for (const bad of [
      { limit: '201' },
      { after: '-1' },
      { after: '9', before: '9' },
      { after: 'x' },
      { after: '1e3' },
      { after: '' },
      { limit: ' 5' },
      { after: '0x10' },
      { kinds: 'media,gossip' },
      { kinds: 'media,,link' },
      { kinds: '' },
    ]) {
      expect(farms.EventsQuery.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
