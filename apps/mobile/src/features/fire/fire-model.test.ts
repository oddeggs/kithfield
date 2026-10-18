import { describe, expect, it } from '@jest/globals';
import { translator } from '@kithfield/i18n';

import { addRow, lineFrom, type CaptionRow } from './caption-lines';
import { hasVoice, rateOf, samplesOf, toTargetRate, wavOf } from './pcm';
import {
  dockStateOf,
  gestureTarget,
  headerLine,
  layoutOf,
  nameList,
  type FirePerson,
  type HeaderInput,
} from './room-model';
import { DRAWN_SEATS, seatPeople, shadeAt } from './seats';

const t = translator('en');

const person = (id: string, over: Partial<FirePerson> = {}): FirePerson => ({
  id,
  you: false,
  mode: 'join',
  mic: false,
  speaking: false,
  weak: false,
  lantern: false,
  sharing: false,
  captionsOk: false,
  joinedAt: 0,
  ...over,
});

describe('seats around the fire', () => {
  it('fills the logs in the scene’s order', () => {
    expect(seatPeople({}, ['mo', 'bea', 'otis'])).toEqual({ mo: 0, bea: 1, otis: 2 });
  });

  it('keeps everyone’s log when someone heads home, and gives the gap to the next to come', () => {
    const before = seatPeople({}, ['mo', 'bea', 'otis']);
    const after = seatPeople(before, ['mo', 'otis', 'pip']);
    expect(after).toEqual({ mo: 0, otis: 2, pip: 1 });
  });

  it('draws eight; the ninth sits as a lantern with no log', () => {
    const many = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const seats = seatPeople({}, many);
    expect(Object.keys(seats)).toHaveLength(DRAWN_SEATS);
    expect(seats['p8']).toBeUndefined();
  });

  it('keeps critters near the fire in its light and the far log darker', () => {
    expect(shadeAt(0.5, 0.6, 393, 852)).toBeLessThan(0.1);
    expect(shadeAt(0.9, 0.765, 393, 852)).toBeGreaterThan(shadeAt(0.32, 0.71, 393, 852));
  });
});

describe('the room as the screen reads it', () => {
  const names: Record<string, string> = { mo: 'Mo', bea: 'Bea', otis: 'Otis', me: 'June' };
  const base: HeaderInput = {
    phase: 'room',
    farmName: 'The Thursday Lot',
    people: [],
    nameOf: (id) => names[id] ?? id,
    layout: { kind: 'circle' },
    captionsOn: false,
    showing: null,
  };

  it('says who is there before you sit down, and that the fire is out when nobody is', () => {
    const people = [person('mo'), person('bea'), person('otis')];
    expect(headerLine(t, { ...base, phase: 'joining', people })).toBe('Mo, Bea and Otis');
    expect(headerLine(t, { ...base, phase: 'unlit' })).toBe('The Thursday Lot · unlit');
  });

  it('counts who is by the fire and says how you are there', () => {
    const listening = [person('mo'), person('me', { you: true, mode: 'listen' })];
    expect(headerLine(t, { ...base, people: [...listening, person('bea'), person('otis')] })).toBe(
      '4 by the fire · you’re listening',
    );
    const muted = [person('mo'), person('me', { you: true })];
    expect(headerLine(t, { ...base, people: muted })).toBe('2 by the fire · you’re muted');
    const talking = [person('mo'), person('me', { you: true, mic: true })];
    expect(headerLine(t, { ...base, people: talking })).toBe('2 by the fire');
  });

  it('says a full circle is full', () => {
    const people = Array.from({ length: 8 }, (_, i) => person(`p${i}`, { you: i === 0 }));
    expect(headerLine(t, { ...base, people })).toBe('8 by the fire · full');
  });

  it('names the other person when two sit with lanterns', () => {
    const people = [person('bea', { lantern: true }), person('me', { you: true })];
    expect(headerLine(t, { ...base, people, layout: layoutOf(people) })).toBe('Bea and you');
  });

  it('lays lanterns out by how many people there are, and a shared screen over all', () => {
    const lit = (n: number) =>
      Array.from({ length: n }, (_, i) => person(`p${i}`, { lantern: i === 0 }));
    expect(layoutOf(lit(2)).kind).toBe('pair');
    expect(layoutOf(lit(4)).kind).toBe('grid');
    expect(layoutOf(lit(7)).kind).toBe('ring');
    expect(layoutOf([person('a'), person('b')]).kind).toBe('circle');
    expect(layoutOf([person('a', { lantern: true }), person('b', { sharing: true })])).toEqual({
      kind: 'share',
      by: 'b',
    });
  });

  it('knows a listener from someone muted or talking', () => {
    expect(dockStateOf(person('me', { mode: 'listen', mic: true }))).toBe('listening');
    expect(dockStateOf(person('me'))).toBe('muted');
    expect(dockStateOf(person('me', { mic: true }))).toBe('talking');
  });

  it('sends a gesture to whoever you picked, else whoever spoke last, never yourself', () => {
    const people = [person('me', { you: true }), person('bea'), person('mo')];
    expect(gestureTarget(people, 'mo', 'bea')).toBe('mo');
    expect(gestureTarget(people, null, 'bea')).toBe('bea');
    expect(gestureTarget(people, 'me', 'me')).toBe('bea');
    expect(gestureTarget([person('me', { you: true })], null, null)).toBeNull();
  });

  it('lists names the way people say them', () => {
    expect(nameList(t, ['Mo'])).toBe('Mo');
    expect(nameList(t, ['Mo', 'Bea'])).toBe('Mo and Bea');
    expect(nameList(t, ['Mo', 'Bea', 'Otis', 'Pip'])).toBe('Mo, Bea, Otis and Pip');
  });
});

describe('captions on this phone', () => {
  const line = (speaker: string, chunk: number, text = 'hi') => ({
    kind: 'line' as const,
    line: { speaker, chunk, said: 'en', text, translation: null },
  });

  it('keeps the last three lines, a resent piece in its newest place', () => {
    let rows: CaptionRow[] = [];
    for (const r of [line('bea', 0), line('pip', 0), line('bea', 1), line('bea', 2)])
      rows = addRow(rows, r);
    expect(rows.map((r) => (r.kind === 'line' ? `${r.line.speaker}${r.line.chunk}` : ''))).toEqual([
      'pip0',
      'bea1',
      'bea2',
    ]);
    rows = addRow(rows, line('pip', 0, 'again'));
    expect(rows.at(-1)).toEqual(line('pip', 0, 'again'));
  });

  it('shows "…" for a speaker who said no, until a line of theirs arrives', () => {
    let rows = addRow([], { kind: 'withheld', speaker: 'mo' });
    expect(rows).toEqual([{ kind: 'withheld', speaker: 'mo' }]);
    rows = addRow(rows, line('mo', 4));
    expect(rows).toEqual([line('mo', 4)]);
  });

  it('reads only lines that fit the contract', () => {
    const ok = new TextEncoder().encode(
      JSON.stringify({ speaker: 'bea', chunk: 1, said: 'vi', text: 'chào', translation: null }),
    );
    expect(lineFrom(ok)?.text).toBe('chào');
    expect(lineFrom(new TextEncoder().encode('{"speaker":1}'))).toBeNull();
    expect(lineFrom(new TextEncoder().encode('not json'))).toBeNull();
  });
});

describe('your voice for captions', () => {
  it('works out the capture rate from how much arrived', () => {
    expect(rateOf(48000 * 2 * 2, 2000)).toBe(48000);
    expect(rateOf(15800 * 2, 1000)).toBe(16000);
  });

  it('brings 48 kHz down to 16 kHz and wraps it as WAV', () => {
    const tone = new Int16Array(4800).map((_, i) => Math.round(Math.sin(i / 10) * 8000));
    const bytes = new Uint8Array(tone.buffer);
    const down = toTargetRate(samplesOf(bytes), 48000);
    expect(down).toHaveLength(1600);
    const wav = wavOf(down, 16000);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(16000);
    expect(wav).toHaveLength(44 + 3200);
    expect(hasVoice(down)).toBe(true);
    expect(hasVoice(new Int16Array(1600))).toBe(false);
  });
});
