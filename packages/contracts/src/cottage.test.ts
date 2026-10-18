import * as cottage from './cottage';
import { at, bea, critter, farm } from './samples.test-data';
import { describeSchemas } from './schema-runner.test-data';

const notice = {
  farm,
  seq: 41,
  kind: 'knock',
  actor: bea,
  at,
  preview: null,
  forYou: true,
};
const otis = { person: 'p_otis', name: 'Otis', critter };
const row = {
  ...notice,
  farmKind: 'farm',
  name: 'The Thursday Lot',
  with: null,
  waiting: 1,
  muted: false,
  pinned: false,
};
const visitRow = { ...row, farm: 'f_visit', farmKind: 'visit', name: null, with: otis };
const job = {
  person: 'p_fig',
  farm,
  kind: 'knock',
  seq: 41,
  collapseKey: 'f_thursday_lot:knock',
  copy: { key: 'push.knock', params: { friend: 'Bea', farm: 'The Thursday Lot' } },
  forYou: true,
  at,
};

describeSchemas('cottage contracts', cottage, {
  CottageFarm: [
    [
      { farm, farmKind: 'farm', name: 'The Thursday Lot', with: null },
      { farm: 'f_visit', farmKind: 'visit', name: null, with: otis },
    ],
    [
      { farm, farmKind: 'farm', name: 'The Thursday Lot', with: otis },
      { farm: 'f_visit', farmKind: 'visit', name: null, with: null },
      { farm, farmKind: 'farm', name: 'The Thursday Lot' },
    ],
  ],
  CottageNotice: [
    [notice, { ...notice, kind: 'lantern_lit', actor: null, preview: 'Bea: hi', forYou: false }],
    [
      { ...notice, forYou: undefined },
      { ...notice, preview: 'x'.repeat(141) },
    ],
  ],
  CottageDelivery: [
    [
      { ...notice, connected: true },
      { ...notice, connected: false },
    ],
    [notice, { ...notice, connected: 'yes' }],
  ],
  VisitPeer: [[otis, { ...otis, name: null }], [{ person: 'p_otis', name: 'Otis' }]],
  ChatListItem: [
    [row, visitRow],
    [
      { ...row, with: otis },
      { ...visitRow, with: null },
      { ...visitRow, name: 'Us' },
      { ...row, connected: true, name: null },
    ],
  ],
  CopyKey: [
    ['push.knock', 'nudge.backOff'],
    ['Push Knock', ''],
  ],
  PushJob: [
    [
      job,
      {
        ...job,
        farm: null,
        seq: null,
        kind: 'nudge_back',
        copy: { key: 'nudge.gentle', params: {} },
      },
    ],
    [
      { ...job, copy: { key: 'push.knock', params: { text: 'x'.repeat(141) } } },
      {
        ...job,
        copy: {
          key: 'push.knock',
          params: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`p${i}`, 'x'])),
        },
      },
      { ...job, collapseKey: '' },
      { ...job, body: 'Bea knocked', copy: undefined },
    ],
  ],
});
