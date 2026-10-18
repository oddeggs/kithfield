import { describe, expect, it } from '@jest/globals';

import { syncPush, type KeyStore, type PushDeps } from './push-sync';

function phone(over: Partial<PushDeps> = {}) {
  const values = new Map<string, string>();
  const store: KeyStore = {
    getItem: (key) => values.get(key) ?? null,
    setItemAsync: (key, value) => Promise.resolve(void values.set(key, value)),
  };
  const sent: string[] = [];
  let granted = false;
  let token: string | null = 'ExponentPushToken[abc]';
  let zone = 'Europe/London';
  let session = 's1';
  const deps: PushDeps = {
    store,
    permission: () => Promise.resolve(granted),
    token: () => Promise.resolve(token),
    timeZone: () => zone,
    deviceId: () => Promise.resolve('d1'),
    session: () => Promise.resolve(session),
    device: { platform: 'ios', name: 'iPhone', appVersion: '0.1.0' },
    registerDevice: (device, body) =>
      Promise.resolve(void sent.push(`device ${device} ${body.pushToken}`)),
    updateSettings: (update) => Promise.resolve(void sent.push(`zone ${update.timeZone}`)),
    ...over,
  };
  return {
    deps,
    sent,
    grant: () => (granted = true),
    setToken: (t: string | null) => (token = t),
    setZone: (z: string) => (zone = z),
    newSession: (s: string) => (session = s),
  };
}

describe('telling the server how to reach this phone', () => {
  it('sends the time zone and the device at first, and the push token once notifications are allowed', async () => {
    const p = phone();
    await syncPush('p1', p.deps);
    expect(p.sent).toEqual(['zone Europe/London', 'device d1 null']);
    p.grant();
    await syncPush('p1', p.deps);
    expect(p.sent).toEqual([
      'zone Europe/London',
      'device d1 null',
      'device d1 ExponentPushToken[abc]',
    ]);
  });

  it('registers the device again under a new session, keeping its token', async () => {
    const p = phone();
    p.grant();
    await syncPush('p1', p.deps);
    p.newSession('s2');
    await syncPush('p1', p.deps);
    expect(p.sent).toEqual([
      'zone Europe/London',
      'device d1 ExponentPushToken[abc]',
      'device d1 ExponentPushToken[abc]',
    ]);
  });

  it('sends nothing again on a launch where nothing changed', async () => {
    const p = phone();
    p.grant();
    await syncPush('p1', p.deps);
    await syncPush('p1', p.deps);
    expect(p.sent).toHaveLength(2);
  });

  it('sends only what changed', async () => {
    const p = phone();
    p.grant();
    await syncPush('p1', p.deps);
    p.setZone('Asia/Ho_Chi_Minh');
    await syncPush('p1', p.deps);
    p.setToken('ExponentPushToken[def]');
    await syncPush('p1', p.deps);
    expect(p.sent.slice(2)).toEqual(['zone Asia/Ho_Chi_Minh', 'device d1 ExponentPushToken[def]']);
  });

  it('sends both again for another person on this phone', async () => {
    const p = phone();
    p.grant();
    await syncPush('p1', p.deps);
    await syncPush('p2', p.deps);
    expect(p.sent).toHaveLength(4);
  });

  it('registers the device without a push token where there is none', async () => {
    const p = phone();
    p.grant();
    p.setToken(null);
    await syncPush('p1', p.deps);
    await syncPush('p1', p.deps);
    expect(p.sent).toEqual(['zone Europe/London', 'device d1 null']);
  });

  it('tries again next launch when sending failed', async () => {
    let fail = true;
    const p = phone({
      updateSettings: () => (fail ? Promise.reject(new Error('offline')) : Promise.resolve()),
    });
    await expect(syncPush('p1', p.deps)).rejects.toThrow('offline');
    fail = false;
    const calls: string[] = [];
    await syncPush('p1', {
      ...p.deps,
      updateSettings: (u) => Promise.resolve(void calls.push(u.timeZone ?? '')),
    });
    expect(calls).toEqual(['Europe/London']);
  });
});
