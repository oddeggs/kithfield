import { describe, expect, it } from 'vitest';

import { captures, num, readDesign } from './test/design';
import { transitions, type TransitionName } from './transitions';

/** Storyboard titles as the design writes them, mapped to token keys. A new title fails the lookup. */
const KEYS: Record<string, TransitionName> = {
  'A critter travels: bubble → farm → card, and back': 'critterTravel',
  'Picker to farm: the chosen critter walks home and the cottage turns real': 'pickerToFarm',
  'Starting a visit: both critters walk onto the porch': 'visitStart',
  'Farm home ↔ chat: the critters carry into the chat header': 'farmToChat',
  'The valley: zooming out to every farm, and back in': 'valley',
  'Planting a seed: bubble → seed → seed bed → sprout → campfire': 'plantSeed',
  "A firefly's flight to a door, and arriving on a friend's phone": 'firefly',
  'A dewdrop falls, ripples, and a sprout appears in the header': 'dewdrop',
  'A gift wraps, travels to the step and unwraps onto the critter': 'gift',
  'The fire: zoom in, critters gather, leave, and the flame shrinks into the Dynamic Island':
    'fire',
  'A photo opens full screen, and hangout photos press into a flower': 'photo',
  'Harvest crops gather into the Sunday recap': 'harvest',
  'Answered messages fold into the Quick Tend bouquet': 'bouquet',
  'Tab switches: the farm stays put while panels slide': 'tabSwitch',
  'Opening a sheet': 'sheetOpen',
  'A sticker grows from the picker into a message': 'sticker',
  'The farm reacts live to an incoming message': 'farmReacts',
};

const camel = (words: string) => words.replace(/ ([a-z])/g, (_, c: string) => c.toUpperCase());

/** "2.6s total: carry 0.9s · walk 1.3s" → { total: 2600, carry: 900, walk: 1300 }. */
function parseTiming(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of text.split(/[·:]/)) {
    const seg = (part.split(',')[0] ?? '').trim();
    const lead = /^([\d.]+)(ms|s)(?: (.+))?$/.exec(seg);
    const trail = /^(.+) ([\d.]+)(ms|s)$/.exec(seg);
    const ms = (n: string, unit: string) => Math.round(num(n) * (unit === 's' ? 1000 : 1));
    if (lead) out[camel(lead[3] ?? 'total')] = ms(lead[1] ?? '', lead[2] ?? '');
    else if (trail) out[camel(trail[1] ?? '')] = ms(trail[2] ?? '', trail[3] ?? '');
  }
  return out;
}

const decode = (s: string) => s.replace(/&#39;/g, "'").replace(/&amp;/g, '&');

const headers = captures(
  readDesign('18 Motion and Transitions.dc.html'),
  /<span[^>]*>(SIGNATURE|STANDARD)<\/span><span style="font:400 22px\/1\.1 'Young Serif',Georgia,serif">([^<]+)<\/span><span[^>]*>([^<]+)((?:<code[^>]*>[^<]+<\/code>)*)<\/span>/g,
);

describe('transition timings match 18 Motion and Transitions', () => {
  it('reads every storyboard', () => {
    expect(headers.length).toBe(Object.keys(transitions).length);
  });

  it('has each storyboard with its kind, timings and motion', () => {
    const design = Object.fromEntries(
      headers.map(([kind = '', title = '', timing = '', codes = '']) => {
        const key = KEYS[decode(title)];
        if (!key) throw new Error(`new storyboard in the design: ${title}`);
        const uses = captures(codes, /motion\.(\w+)/g).map(([n = '']) => n);
        return [key, { signature: kind === 'SIGNATURE', ms: parseTiming(timing), uses }];
      }),
    );
    expect(transitions).toEqual(design);
  });
});
