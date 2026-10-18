import { describe, expect, it } from 'vitest';

import {
  motion,
  motionFor,
  reduceMotion,
  sampleCurves,
  springFromResponse,
  springs,
  travel,
  travelWobble,
  type Bezier,
} from './motion';
import { between, captures, foundations, num, one, readDesign, textOf } from './test/design';

const html = foundations();
const cards = Object.fromEntries(
  captures(
    between(html, 'id="motion"', 'id="art"'),
    /<path d="([^"]+)" stroke="#5E7F4A"[^>]*\/><\/svg>\s*<div[^>]*>\s*<div style="font:600 15px\/1\.2 ui-monospace,Menlo,monospace">motion\.(\w+)<\/div>\s*<div[^>]*>([^<]+)<\/div>/g,
  ).map(([path = '', name = '', spec = '']) => [name, { path, spec }]),
);
const motionText = textOf(between(html, 'id="motion"', 'id="art"'));
const notes = textOf(between(html, 'id="dev-notes"', '</main>'));
const storyNotes = textOf(
  readDesign('18 Motion and Transitions.dc.html').split('id="dev-notes"')[1] ?? '',
);

const card = (name: string) => {
  const c = cards[name];
  if (!c) throw new Error(`motion.${name} is not in the design`);
  return c;
};
const seconds = (s: string) => Math.round(num(s) * 1000);

/** The control points of a curve drawn as `M0 100 C x1 y1, x2 y2, 100 0` (or a straight line). */
function bezierOfPath(path: string): Bezier {
  if (path === 'M0 100 L100 0') return [0, 0, 1, 1];
  const [x1, y1, x2, y2] = one(path, /^M0 100 C ([\d.]+) ([\d.]+), ([\d.]+) ([\d.]+), 100 0$/).map(
    num,
  );
  return [x1! / 100, (100 - y1!) / 100, x2! / 100, (100 - y2!) / 100];
}

describe('motion tokens match 01 Foundations', () => {
  it('has every motion name the design defines, and no other', () => {
    expect(Object.keys(motion).sort()).toEqual(Object.keys(cards).sort());
  });

  it('has the sheet spring, as the card and the SwiftUI note give it', () => {
    const [response, damping] = one(
      card('sheet').spec,
      /^Spring · response ([\d.]+)s, damping ([\d.]+)$/,
    ).map(num);
    const [swiftResponse, swiftDamping] = one(
      notes,
      /sheet = \.spring\(response: ([\d.]+), dampingFraction: ([\d.]+)\)/,
    ).map(num);
    expect(motion.sheet).toEqual({ response, dampingFraction: damping });
    expect([swiftResponse, swiftDamping]).toEqual([response, damping]);
  });

  it('has the fade curve and duration, as written and as drawn', () => {
    const [ms, ...points] = one(
      card('fade').spec,
      /^Ease-out · (\d+)ms · \(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)$/,
    ).map(num);
    expect(motion.fade).toEqual({ durationMs: ms, bezier: points });
    expect(bezierOfPath(card('fade').path)).toEqual(points);
    expect(notes).toContain(`fade = .easeOut(duration: ${motion.fade.durationMs / 1000})`);
  });

  it('has the linear cross-fade', () => {
    const [ms] = one(card('cross').spec, /^Linear cross-fade · (\d+)ms$/).map(num);
    expect(motion.cross).toEqual({ durationMs: ms, bezier: bezierOfPath(card('cross').path) });
    expect(notes).toContain(`cross = .linear(duration: ${motion.cross.durationMs / 1000})`);
  });

  it('has drawings held on twos', () => {
    const [fps, hold, base] = one(
      card('twos').spec,
      /^Held frames · (\d+)fps \(each drawing held (\d+) frames at (\d+)\)$/,
    ).map(num);
    expect(motion.twos).toEqual({ fps, holdFrames: hold, baseFps: base, frameMs: 1000 / fps! });
    expect(motion.twos.baseFps / motion.twos.holdFrames).toBe(motion.twos.fps);
  });

  it('has the breathing periods', () => {
    const [awake = '', asleep = ''] = one(
      card('breath').spec,
      /^Sine · ([\d.]+)s awake, ([\d.]+)s asleep$/,
    );
    expect(motion.breath).toEqual({ awakeMs: seconds(awake), asleepMs: seconds(asleep) });
  });

  it('has the reveal duration, with the ease-in-out the design draws', () => {
    const [s = ''] = one(card('reveal').spec, /^Ease-in-out · ([\d.]+)s$/);
    expect(motion.reveal).toEqual({
      durationMs: seconds(s),
      bezier: bezierOfPath(card('reveal').path),
    });
  });

  it('falls back as Reduce Motion says: art still, UI on motion.fade only', () => {
    expect(motionText).toContain(
      'With Reduce Motion, art holds still and UI uses motion.fade only.',
    );
    expect(storyNotes).toContain(
      `Every transition collapses to a ${motion.fade.durationMs}ms cross-fade (motion.${reduceMotion.transition}).`,
    );
    expect(motionFor('sheet', true)).toBe('fade');
    expect(motionFor('cross', true)).toBe('fade');
    expect(motionFor('reveal', true)).toBe('fade');
    expect(motionFor('twos', true)).toBeNull();
    expect(motionFor('breath', true)).toBeNull();
    expect(motionFor('sheet', false)).toBe('sheet');
  });
});

describe('the sheet spring as physical constants', () => {
  it('rings with the response as its period and the damping fraction as its ratio', () => {
    const { mass, stiffness, damping } = springs.sheet;
    expect((2 * Math.PI) / Math.sqrt(stiffness / mass)).toBeCloseTo(motion.sheet.response, 12);
    expect(damping / (2 * Math.sqrt(stiffness * mass))).toBeCloseTo(
      motion.sheet.dampingFraction,
      12,
    );
    expect(springFromResponse(1, 1)).toEqual({
      mass: 1,
      stiffness: 4 * Math.PI ** 2,
      damping: 4 * Math.PI,
    });
  });

  it('is the spring the storyboards travel on', () => {
    expect(storyNotes).toContain(
      `motion.sheet: response ${motion.sheet.response}, damping ${motion.sheet.dampingFraction}`,
    );
  });
});

describe('travel matches the storyboard notes', () => {
  it('has the wobble, drawing swap and landing squash', () => {
    const [min, max] = one(storyNotes, /rotate ±(\d+)–(\d+)°/).map(num);
    const [swap] = one(storyNotes, /swap drawings every (\d+)ms/).map(num);
    const [squash] = one(storyNotes, /squash (\d+)%/).map(num);
    expect(travel).toEqual({
      wobbleMinDeg: min,
      wobbleMaxDeg: max,
      drawingSwapMs: swap,
      landingSquash: squash! / 100,
    });
  });
});

describe('sample curves match design/kf-motion.js', () => {
  const source = readDesign('kf-motion.js');

  it('has the shared curves the samples declare', () => {
    const [sp = '', eo = ''] = one(
      source,
      /const SP = 'cubic-bezier\(([^)]+)\)', EO = 'cubic-bezier\(([^)]+)\)', LIN = 'linear'/,
    );
    expect(sampleCurves.spring).toEqual(sp.split(',').map(num));
    expect(sampleCurves.easeOut).toEqual(eo.split(',').map(num));
    expect(sampleCurves.easeOut).toEqual(motion.fade.bezier);
    expect(sampleCurves.linear).toEqual(motion.cross.bezier);
  });

  it('has every curve the samples use', () => {
    const used = captures(source, /cubic-bezier\(([^)]+)\)/g).map(([p = '']) =>
      p.split(',').map(num),
    );
    const known = Object.values(sampleCurves).map((c) => [...c]);
    for (const curve of used) expect(known).toContainEqual(curve);
  });
});

describe('the travelling wobble matches sample 01 in design/kf-motion.js', () => {
  it('tilts the face one way then the other as it flies, as the sample keys it', () => {
    const source = readDesign('kf-motion.js');
    const sample = source.split("\n '01':")[1]?.split("\n '02':")[0] ?? '';
    const track = one(sample, /A\(K\('avatar'[^\n]*?, 60, 60, (\[\[[^\n]*\]\])\),\n/)[0];
    const frames = JSON.parse(
      (track ?? '').replace(/\.(\d)/g, '0.$1').replace(/, SP|, LIN|, EO/g, ''),
    ) as number[][];
    // The flight is the frames while the face shows; it lands on the last of them.
    const flying = frames.filter((f) => f[5] === 1);
    const end = flying[flying.length - 1]?.[0] ?? 1;
    const keyed = flying.map((f) => [Math.round(((f[0] ?? 0) / end) * 1000) / 1000, f[4] ?? 0]);
    expect(travelWobble).toEqual(keyed);
    for (const [, deg] of travelWobble.slice(1)) {
      expect(Math.abs(deg)).toBeGreaterThanOrEqual(travel.wobbleMinDeg);
      expect(Math.abs(deg)).toBeLessThanOrEqual(travel.wobbleMaxDeg);
    }
  });
});
