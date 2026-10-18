import { describe, expect, it } from '@jest/globals';

import { createUnsentNotices, UNSENT_NOTICE_KEY, type NoticeStorage } from './unsent-notice';

/** A Keychain in memory. */
const keychain = (): NoticeStorage & { items: Map<string, string> } => {
  const items = new Map<string, string>();
  return {
    items,
    getItemAsync: (key) => Promise.resolve(items.get(key) ?? null),
    setItemAsync: (key, value) => {
      items.set(key, value);
      return Promise.resolve();
    },
    deleteItemAsync: (key) => {
      items.delete(key);
      return Promise.resolve();
    },
  };
};

describe('the unsent notice', () => {
  it('keeps the count of writes lost when the session ended, for the next sign-in to read once', async () => {
    const storage = keychain();
    const notices = createUnsentNotices(storage);
    await notices.remember({ type: 'unsent_at_session_end', count: 3 });
    // A fresh start of the app reads what the last one kept.
    const later = createUnsentNotices(storage);
    expect(await later.take()).toEqual({ count: 3, reason: 'session_end' });
    expect(await later.take()).toBeNull();
    expect(storage.items.has(UNSENT_NOTICE_KEY)).toBe(false);
  });

  it('says when the writes went with a forced sign-out', async () => {
    const notices = createUnsentNotices(keychain());
    await notices.remember({ type: 'unsent_at_sign_out', count: 1 });
    expect(await notices.take()).toEqual({ count: 1, reason: 'sign_out' });
  });

  it('adds up losses before anyone signs in again', async () => {
    const notices = createUnsentNotices(keychain());
    await Promise.all([
      notices.remember({ type: 'unsent_at_session_end', count: 2 }),
      notices.remember({ type: 'unsent_at_session_end', count: 5 }),
    ]);
    expect(await notices.take()).toEqual({ count: 7, reason: 'session_end' });
  });

  it('keeps nothing for other reports, or for nothing lost', async () => {
    const storage = keychain();
    const notices = createUnsentNotices(storage);
    await notices.remember({ type: 'store_reset', reason: 'key_missing' });
    await notices.remember({ type: 'unsent_at_session_end', count: 0 });
    expect(storage.items.size).toBe(0);
    expect(await notices.take()).toBeNull();
  });

  it('reads a damaged entry as nothing, and clears it', async () => {
    const storage = keychain();
    storage.items.set(UNSENT_NOTICE_KEY, '{not json');
    const notices = createUnsentNotices(storage);
    expect(await notices.take()).toBeNull();
    expect(storage.items.size).toBe(0);
  });
});
