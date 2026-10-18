import { describe, expect, it } from 'vitest';

import { parseColor } from './color';
import { parseFilter } from './filter';
import { parseFont } from './font';
import { arcSweep, PathData } from './path';
import { PathVerb } from './skia-enums';

const TAU = Math.PI * 2;

describe('colours', () => {
  it('reads the forms the renderer writes', () => {
    expect(parseColor('#fff')).toEqual([1, 1, 1, 1]);
    expect(parseColor('#2a221d')).toEqual([0x2a / 255, 0x22 / 255, 0x1d / 255, 1]);
    expect(parseColor('rgba(60,40,20,.3)')).toEqual([60 / 255, 40 / 255, 20 / 255, 0.3]);
    expect(parseColor('rgba(255,220,130,1.4)')?.[3]).toBe(1);
    expect(parseColor('transparent')).toEqual([0, 0, 0, 0]);
  });

  it('rejects what canvas would ignore', () => {
    expect(parseColor('nope')).toBeNull();
    expect(parseColor('#12')).toBeNull();
  });
});

describe('fonts', () => {
  it('parses weight, size and the family list', () => {
    expect(parseFont("700 20px Gaegu, 'Comic Sans MS', cursive")).toEqual({
      weight: 700,
      italic: false,
      size: 20,
      families: ['Gaegu', 'Comic Sans MS', 'cursive'],
    });
    expect(parseFont("400 12.5px 'Young Serif', Georgia, serif")?.families[0]).toBe('Young Serif');
    expect(parseFont('bold')).toBeNull();
  });
});

describe('CSS filters', () => {
  it('turns each function into one matrix, in order', () => {
    expect(parseFilter('none')).toEqual([]);
    expect(parseFilter('brightness(0.18) sepia(.6)')).toHaveLength(2);
    expect(parseFilter('grayscale(1) contrast(1.15) brightness(1.05)')).toHaveLength(3);
    const [invert] = parseFilter('invert(1)') ?? [];
    expect(invert?.slice(0, 5)).toEqual([-1, 0, 0, 0, 1]);
  });

  it('rejects functions it cannot map', () => {
    expect(parseFilter('blur(2px)')).toBeNull();
    expect(parseFilter('brightness(1) nonsense')).toBeNull();
  });
});

describe('arcs follow the canvas angle rules', () => {
  it('draws a whole circle anticlockwise from 0 to 2π', () => {
    expect(arcSweep(0, TAU, true)).toEqual([0, -TAU]);
    expect(arcSweep(0, TAU, false)).toEqual([0, TAU]);
  });

  it('wraps a clockwise arc whose end is before its start', () => {
    const [start, sweep] = arcSweep(1, 0.5, false);
    expect(start).toBe(1);
    expect(sweep).toBeCloseTo(TAU - 0.5);
  });

  it('caps sweeps past a full turn', () => {
    expect(arcSweep(0, 10, false)[1]).toBeCloseTo(TAU);
  });
});

describe('paths keep canvas semantics', () => {
  it('starts a subpath on a lineTo with no current point', () => {
    const p = new PathData();
    p.lineTo(null, 3, 4);
    p.lineTo(null, 5, 6);
    expect(p.cmds).toEqual([
      [PathVerb.Move, 3, 4],
      [PathVerb.Line, 5, 6],
    ]);
  });

  it('joins an arc to the current point with a line, and writes it as conics', () => {
    const p = new PathData();
    p.moveTo(null, 0, 0);
    p.arc(null, 10, 0, 5, 0, Math.PI);
    expect(p.cmds[1]).toEqual([PathVerb.Line, 15, 0]);
    expect(p.cmds.slice(2).every((c) => c[0] === PathVerb.Conic)).toBe(true);
    const last = p.cmds.at(-1) ?? [];
    expect(last[3]).toBeCloseTo(5);
    expect(last[4]).toBeCloseTo(0);
  });

  it('maps points through the transform current when they are added', () => {
    const p = new PathData();
    p.moveTo([2, 0, 0, 2, 10, 0], 1, 1);
    p.lineTo(null, 1, 1);
    expect(p.cmds).toEqual([
      [PathVerb.Move, 12, 2],
      [PathVerb.Line, 1, 1],
    ]);
  });

  it('closes a rect and continues from its corner', () => {
    const p = new PathData();
    p.rect(null, 1, 2, 3, 4);
    p.lineTo(null, 9, 9);
    expect(p.cmds.map((c) => c[0])).toEqual([
      PathVerb.Move,
      PathVerb.Line,
      PathVerb.Line,
      PathVerb.Line,
      PathVerb.Close,
      PathVerb.Line,
    ]);
  });
});
