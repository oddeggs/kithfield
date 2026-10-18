import { describe, expect, it } from '@jest/globals';

import { presentationFor } from './presentation';

describe('route presentation', () => {
  it('presents the modal group as sheets and the cover group full screen', () => {
    expect(presentationFor('(modal)/chat-search')).toBe('modal');
    expect(presentationFor('(cover)/chat-viewer')).toBe('fullScreenModal');
  });

  it('pushes everything else', () => {
    expect(presentationFor('(tabs)')).toBe('card');
    expect(presentationFor('(onboarding)')).toBe('card');
    expect(presentationFor('modal-like')).toBe('card');
  });
});
