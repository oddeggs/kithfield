import { describe, expect, it } from '@jest/globals';

import { meetAction, meetChoice } from './meet-choice';

describe('meeting a friend’s critter from their message', () => {
  it('flies the face when it is on screen and the farm shows them', () => {
    expect(meetChoice({ flying: false, face: true, onFarm: true })).toBe('fly');
  });

  it('lands the flight already in the air instead of starting another, so one card opens', () => {
    expect(meetChoice({ flying: true, face: true, onFarm: true })).toBe('finish');
  });

  it('opens the card over the chat with no face to lift or another farm showing', () => {
    expect(meetChoice({ flying: false, face: false, onFarm: true })).toBe('card');
    expect(meetChoice({ flying: false, face: true, onFarm: false })).toBe('card');
  });

  it('is a VoiceOver action on a friend’s message, never on your own', () => {
    const t = (key: string, values?: Record<string, string>) => `${key}:${values?.['name'] ?? ''}`;
    expect(meetAction(t, { mine: false, name: 'Otis', critter: true })).toEqual({
      name: 'meet',
      label: 'chat.bubble.meet:Otis',
    });
    expect(meetAction(t, { mine: true, name: 'June', critter: true })).toBeNull();
    expect(meetAction(t, { mine: false, name: 'Otis', critter: false })).toBeNull();
  });
});
