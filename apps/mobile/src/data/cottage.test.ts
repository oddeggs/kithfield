import { afterEach, describe, expect, it } from '@jest/globals';
import type { ChatListItem } from '@kithfield/contracts';

import { FarmTestServer } from './test/farm-test-server';
import { testFarmRules } from './test/test-farm-rules';
import { TestPhone, until } from './test/test-phone';

const PIP = 'p_pip';
const phones: TestPhone[] = [];

const row = (farm: string, at: number, preview: string): ChatListItem => ({
  farm,
  seq: 3,
  kind: 'message',
  actor: 'p_bea',
  at,
  preview,
  forYou: false,
  farmKind: 'farm',
  name: 'The Lot',
  with: null,
  waiting: 0,
  muted: false,
  pinned: false,
});

afterEach(() => {
  for (const phone of phones.splice(0)) phone.stop();
});

describe('the cottage socket', () => {
  it('keeps the chat list in SQLite, newest first, and updates it one row at a time', async () => {
    const server = new FarmTestServer(testFarmRules);
    server.people.add(PIP);
    server.chats.set(PIP, [row('f_lot', 100, 'see you there'), row('f_book', 200, 'chapter 4?')]);
    const pip = await TestPhone.start(server, PIP);
    phones.push(pip);

    const cottage = () => pip.client.cottage.getState();
    await until(() => cottage().link.status === 'live');
    expect(cottage().chats.map((c) => c.farm)).toEqual(['f_book', 'f_lot']);

    server.pushChat(PIP, row('f_lot', 300, 'bring a jumper'));
    await until(() => cottage().chats[0]?.farm === 'f_lot');
    expect(cottage().chats.map((c) => c.preview)).toEqual(['bring a jumper', 'chapter 4?']);

    server.safetyNote(PIP);
    await until(() => cottage().safetyNote);

    // Offline after a restart, the list and the note are still there.
    server.online = false;
    await pip.restart();
    expect(cottage().chats.map((c) => c.preview)).toEqual(['bring a jumper', 'chapter 4?']);
    expect(cottage().safetyNote).toBe(true);
    await pip.client.cottage.clearSafetyNote();
    expect(cottage().safetyNote).toBe(false);
  });

  it('closes in the background and opens again in the foreground', async () => {
    const server = new FarmTestServer(testFarmRules);
    server.people.add(PIP);
    const pip = await TestPhone.start(server, PIP);
    phones.push(pip);
    await until(() => pip.client.cottage.getState().link.status === 'live');

    pip.appState.set('background');
    await until(() => server.sessions.size === 0);
    expect(pip.client.cottage.getState().link.status).toBe('paused');
    pip.appState.set('active');
    await until(() => pip.client.cottage.getState().link.status === 'live');
  });
});
