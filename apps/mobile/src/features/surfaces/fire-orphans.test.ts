import { describe, expect, it } from '@jest/globals';

import { orphanFireActivities } from './fire-activity';

describe('the fire’s activity after a restart', () => {
  it('ends the fire activities this run didn’t start, and nothing else', () => {
    const running = [
      { id: 'a', kind: 'fire' as const, key: 'f_lot', stateJson: '{}' },
      { id: 'b', kind: 'plan_day' as const, key: 'f_lot:20', stateJson: '{}' },
      { id: 'c', kind: 'fire' as const, key: 'f_pond', stateJson: '{}' },
    ];
    expect(orphanFireActivities(running, 'c')).toEqual(['a']);
    expect(orphanFireActivities(running, null)).toEqual(['a', 'c']);
  });
});
