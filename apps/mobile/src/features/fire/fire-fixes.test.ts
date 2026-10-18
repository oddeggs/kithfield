import { describe, expect, it } from '@jest/globals';
import { FireTokenResponse, type FarmState } from '@kithfield/contracts';

import {
  captionsWanted,
  critterFor,
  PLACEHOLDER_CRITTER,
  phaseAfter,
  speakerToAnnounce,
} from './room-model';

describe('someone the farm doesn’t know by the fire', () => {
  it('is drawn as a placeholder critter, never hidden', () => {
    expect(critterFor(null, 'stranger')).toEqual(PLACEHOLDER_CRITTER);
    const state = { aliases: {}, members: [], former: [] } as unknown as FarmState;
    expect(critterFor(state, 'stranger')).toEqual(PLACEHOLDER_CRITTER);
  });
});

describe('the fire going out while you decide', () => {
  it('goes back to an unlit fire from pulling up a log, and on when someone lights it', () => {
    expect(phaseAfter('joining', false)).toBe('unlit');
    expect(phaseAfter('unlit', true)).toBe('joining');
    expect(phaseAfter(null, true)).toBe('joining');
    expect(phaseAfter(null, false)).toBe('unlit');
    // Sitting by it, the room itself says when it's over.
    expect(phaseAfter('room', false)).toBe('room');
  });
});

describe('your voice for captions', () => {
  const on = {
    available: true,
    captionsOk: true,
    micOpen: true,
    captioning: true,
    live: true,
    quiet: false,
    active: true,
  };
  it('is sent only while everything says so, and never from the background', () => {
    expect(captionsWanted(on)).toBe(true);
    expect(captionsWanted({ ...on, active: false })).toBe(false);
    expect(captionsWanted({ ...on, available: false })).toBe(false);
    expect(captionsWanted({ ...on, quiet: true })).toBe(false);
  });

  it('reads whether captions can be had from the token’s answer, unavailable when it doesn’t say', () => {
    const base = {
      url: 'wss://x.livekit.cloud',
      room: 'fire-a',
      token: 'x'.repeat(20),
      expiresAt: 1,
    };
    expect(FireTokenResponse.parse({ ...base, captionsAvailable: true }).captionsAvailable).toBe(
      true,
    );
    expect(FireTokenResponse.parse(base).captionsAvailable).toBe(false);
  });
});

describe('who is talking, for VoiceOver', () => {
  it('says a new speaker once, and not more often than every few seconds', () => {
    expect(speakerToAnnounce(null, 'bea', 0)).toBe('bea');
    expect(speakerToAnnounce({ id: 'bea', at: 0 }, 'bea', 10_000)).toBeNull();
    expect(speakerToAnnounce({ id: 'bea', at: 0 }, 'mo', 1000)).toBeNull();
    expect(speakerToAnnounce({ id: 'bea', at: 0 }, 'mo', 6000)).toBe('mo');
    expect(speakerToAnnounce({ id: 'bea', at: 0 }, null, 6000)).toBeNull();
  });
});
