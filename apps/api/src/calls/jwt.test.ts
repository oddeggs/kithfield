import { describe, expect, it } from 'vitest';

import { signJwt, verifyJwt } from './jwt';

const SECRET = 'a-secret-long-enough-for-the-test-1234';

describe('LiveKit tokens', () => {
  it('verifies what it signed, while in date', async () => {
    const token = await signJwt({ iss: 'APIkey', nbf: 100, exp: 200, sub: 'pip' }, SECRET);
    expect(await verifyJwt(token, SECRET, 150)).toMatchObject({ iss: 'APIkey', sub: 'pip' });
  });

  it('refuses another secret, a changed body and an expired token', async () => {
    const token = await signJwt({ iss: 'APIkey', exp: 200 }, SECRET);
    expect(await verifyJwt(token, `${SECRET}x`, 150)).toBeNull();
    const [head, , sig] = token.split('.');
    const forged = `${head}.${btoa(JSON.stringify({ iss: 'APIkey', exp: 9e9 }))}.${sig}`;
    expect(await verifyJwt(forged, SECRET, 150)).toBeNull();
    expect(await verifyJwt(token, SECRET, 400)).toBeNull();
  });

  it('refuses an unsigned token', async () => {
    const none = `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(JSON.stringify({ iss: 'x' }))}.`;
    expect(await verifyJwt(none, SECRET, 0)).toBeNull();
  });
});
