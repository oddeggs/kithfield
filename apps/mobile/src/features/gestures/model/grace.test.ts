import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createGrace } from './grace';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("Quick Tend's five seconds", () => {
  it('sends an answer once its five seconds pass', () => {
    const sent: string[] = [];
    const grace = createGrace(5000);
    grace.hold('bea:7', () => sent.push('yes'));
    jest.advanceTimersByTime(4999);
    expect(sent).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(sent).toEqual(['yes']);
  });

  it('never sends an answer taken back in time', () => {
    const sent: string[] = [];
    const grace = createGrace(5000);
    grace.hold('bea:7', () => sent.push('yes'));
    jest.advanceTimersByTime(3000);
    expect(grace.undo('bea:7')).toBe(true);
    jest.advanceTimersByTime(10_000);
    expect(sent).toEqual([]);
    expect(grace.undo('bea:7')).toBe(false);
  });

  it('sends what is still waiting at once on leaving, and only once', () => {
    const sent: string[] = [];
    const grace = createGrace(5000);
    grace.hold('bea:7', () => sent.push('yes'));
    grace.hold('pip:9', () => sent.push('in'));
    grace.flush();
    expect(sent).toEqual(['yes', 'in']);
    jest.advanceTimersByTime(10_000);
    expect(sent).toEqual(['yes', 'in']);
  });

  it('holds one answer per card: a second tap while waiting is not a second answer', () => {
    const sent: string[] = [];
    const grace = createGrace(5000);
    grace.hold('bea:7', () => sent.push('yes'));
    grace.hold('bea:7', () => sent.push('yes again'));
    jest.advanceTimersByTime(5000);
    expect(sent).toEqual(['yes']);
  });
});
