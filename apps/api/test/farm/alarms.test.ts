import { FarmEvent } from '@kithfield/contracts';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { noWeather } from '../../src/farm/adapters/weather';
import type { FarmDO } from '../../src/farm/farm-object';
import { op } from './support/client';
import { plantFarm, type TestPorts, useTestPorts } from './support/doubles';

let ports: TestPorts;
beforeEach(() => {
  ports = useTestPorts();
});

type Stub = DurableObjectStub<FarmDO>;

const alarmAt = (stub: Stub) =>
  runInDurableObject(stub, (_farm, state) => state.storage.getAlarm());

/** Moves the clock to the object's alarm and runs it. */
const fire = async (stub: Stub) => {
  const at = await alarmAt(stub);
  if (at === null) throw new Error('No alarm set');
  ports.clock.at = at;
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  return at;
};

const farmWritten = async (stub: Stub) =>
  (await stub.page({ after: 2, limit: 50 })).events
    .map((e) => FarmEvent.parse(e))
    .filter((e) => e.actor === null);

describe('the calendar', () => {
  it('harvests on the last Sunday of the season, then rolls the season, in farm time', async () => {
    const { stub } = await plantFarm([]);
    expect(await fire(stub)).toBe(Date.UTC(2054, 10, 29, 0, 0)); // 29 Nov, midnight in London (GMT)
    expect((await farmWritten(stub)).map((e) => [e.kind, e.payload])).toEqual([
      ['harvested', { season: 'autumn', year: 2054, day: '2054-11-29' }],
    ]);
    expect(await fire(stub)).toBe(Date.UTC(2054, 11, 1, 0, 0));
    expect((await farmWritten(stub)).at(-1)).toMatchObject({
      kind: 'season_rolled',
      payload: { season: 'winter', year: 2054 },
    });
    expect(await alarmAt(stub)).toBe(Date.UTC(2055, 1, 28, 0, 0)); // winter's harvest: Sunday 28 Feb 2055
    expect((await stub.state())?.season).toEqual({ season: 'winter', year: 2054 });
  });

  it('names seasons by the farm’s hemisphere and keeps its time zone', async () => {
    const { stub } = await plantFarm([], { timeZone: 'Australia/Sydney', hemisphere: 'south' });
    expect(await fire(stub)).toBe(Date.UTC(2054, 10, 28, 13, 0)); // 29 Nov, midnight in Sydney (AEDT)
    expect((await farmWritten(stub))[0]?.payload).toEqual({
      season: 'spring',
      year: 2054,
      day: '2054-11-29',
    });
    await fire(stub);
    expect((await farmWritten(stub)).at(-1)?.payload).toEqual({ season: 'summer', year: 2054 });
  });
});

describe('the weather', () => {
  const place = {
    setting: 'place',
    place: { city: 'London', country: 'GB', lat: 51.5, lng: -0.12 },
  } as const;

  it('asks the weather source each morning once the keeper sets a town, and writes what it reports', async () => {
    const { stub } = await plantFarm([]);
    await stub.command('pip', { opId: op(1), kind: 'settings_changed', payload: place });
    ports.weather.reading = { weather: 'rain', source: 'test_source' };
    expect(await fire(stub)).toBe(Date.UTC(2054, 9, 19, 4, 0)); // 05:00 in London (BST)
    expect(ports.weather.asked).toEqual(['2054-10-19']);
    expect((await farmWritten(stub)).map((e) => [e.kind, e.payload])).toEqual([
      ['weather', { day: '2054-10-19', weather: 'rain', source: 'test_source' }],
    ]);
    ports.weather.reading = null;
    expect(await fire(stub)).toBe(Date.UTC(2054, 9, 20, 4, 0));
    expect(await farmWritten(stub)).toHaveLength(1);
  });

  it('stops asking when the town is cleared', async () => {
    const { stub } = await plantFarm([]);
    await stub.command('pip', { opId: op(1), kind: 'settings_changed', payload: place });
    await stub.command('pip', {
      opId: op(2),
      kind: 'settings_changed',
      payload: { setting: 'place', place: null },
    });
    expect(await alarmAt(stub)).toBe(Date.UTC(2054, 10, 29, 0, 0));
  });

  it('reports no weather until a source is connected, rather than making some up', async () => {
    expect(await noWeather.today({} as never, place.place, '2054-10-19')).toBeNull();
  });
});

describe('the fire', () => {
  it('goes out three minutes after the last person leaves the room', async () => {
    const { stub } = await plantFarm([]);
    await stub.command('pip', { opId: op(1), kind: 'fire', payload: { state: 'lit' } });
    await stub.fireRoom(true);
    expect(await alarmAt(stub)).toBe(Date.UTC(2054, 10, 29, 0, 0));
    ports.clock.advance(20 * 60_000);
    await stub.fireRoom(false);
    expect(await fire(stub)).toBe(ports.clock.at);
    expect((await farmWritten(stub)).map((e) => [e.kind, e.payload])).toEqual([
      ['fire', { state: 'out' }],
    ]);
    expect((await stub.state())?.fireLitAt).toBeNull();
  });
});

describe('slow posts', () => {
  it('reach the cottages when they arrive the next morning, not when sent', async () => {
    const { stub } = await plantFarm(['fig']);
    ports.cottage.deliveries.length = 0;
    const sent = await stub.command('pip', {
      opId: op(1),
      kind: 'slow_post',
      payload: { to: 'fig', text: 'for later', when: 'morning' },
    });
    expect(sent).toMatchObject({ result: 'ack', seq: 4 });
    const post = FarmEvent.parse((await stub.page({ after: 3, limit: 1 })).events[0]);
    expect(post.payload).toMatchObject({ deliverAt: Date.UTC(2054, 9, 19, 6, 0) }); // 07:00 in London
    expect(ports.cottage.deliveries.filter((d) => d.delivery.kind === 'slow_post')).toEqual([]);

    expect(await fire(stub)).toBe(Date.UTC(2054, 9, 19, 6, 0));
    expect(ports.cottage.for('fig')).toEqual([
      expect.objectContaining({ seq: 4, kind: 'slow_post', forYou: true, connected: false }),
    ]);
    expect(ports.cottage.for('pip')).toEqual([expect.objectContaining({ seq: 4, forYou: false })]);
  });

  it('can be recalled until they arrive', async () => {
    const { stub } = await plantFarm(['fig']);
    await stub.command('pip', {
      opId: op(1),
      kind: 'slow_post',
      payload: { to: 'fig', text: 'for the weekend', when: 'weekend' },
    });
    const post = FarmEvent.parse((await stub.page({ after: 3, limit: 1 })).events[0]);
    expect(post.payload).toMatchObject({ deliverAt: Date.UTC(2054, 9, 24, 8, 0) }); // Saturday 09:00 in London
    ports.clock.at = Date.UTC(2054, 9, 24, 8, 0);
    expect(
      await stub.command('pip', { opId: op(2), kind: 'unsend', payload: { target: 4 } }),
    ).toMatchObject({ reason: 'not_allowed' });
  });
});
