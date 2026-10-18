import { describe, expect, it } from '@jest/globals';

import { deletedThisSession, markDeleted } from './deletion';

describe('the goodbye after deleting an account', () => {
  it('refuses a link opened without a deletion in this session', () => {
    expect(deletedThisSession()).toBeNull();
  });

  it('shows the person who deleted, once the server took the deletion', () => {
    markDeleted({ name: 'June', species: 'rabbit', anonymous: false });
    expect(deletedThisSession()).toEqual({ name: 'June', species: 'rabbit', anonymous: false });
  });
});
