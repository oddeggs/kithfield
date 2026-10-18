import { describe, expect, it } from '@jest/globals';

import { recheckDelay, resolveAppearance, SUN_RECHECK_MAX_MS } from './appearance';

const london = { lat: 51.5074, lng: -0.1278 };
const noon = Date.UTC(2026, 5, 21, 12);
const late = Date.UTC(2026, 5, 21, 22);

describe('day and night', () => {
  it('uses the night palette everywhere in dark appearance', () => {
    expect(resolveAppearance({ systemDark: true, place: null, nowMs: noon })).toBe('night');
    expect(resolveAppearance({ systemDark: true, place: london, nowMs: noon })).toBe('night');
  });

  it('turns to night after local sunset at the farm’s town', () => {
    expect(resolveAppearance({ systemDark: false, place: london, nowMs: noon })).toBe('day');
    expect(resolveAppearance({ systemDark: false, place: london, nowMs: late })).toBe('night');
  });

  it('follows the system alone when no town is known', () => {
    expect(resolveAppearance({ systemDark: false, place: null, nowMs: late })).toBe('day');
    expect(recheckDelay(late, null)).toBeNull();
  });

  it('lets a preview force either appearance', () => {
    const forced = { systemDark: true, place: london, nowMs: late, forced: 'day' as const };
    expect(resolveAppearance(forced)).toBe('day');
  });

  it('looks again just after the next sunset, never later than the recheck cap', () => {
    const justBefore = Date.UTC(2026, 5, 21, 20, 15);
    const delay = recheckDelay(justBefore, london) ?? 0;
    expect(delay).toBeGreaterThan(60_000);
    expect(delay).toBeLessThan(10 * 60_000);
    expect(resolveAppearance({ systemDark: false, place: london, nowMs: justBefore + delay })).toBe(
      'night',
    );
    expect(recheckDelay(noon, london)).toBe(SUN_RECHECK_MAX_MS);
  });
});
