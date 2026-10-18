import { describe, expect, it } from '@jest/globals';

import { me } from '../../ui/session/me.test-data';
import { afterNotifications, afterSignIn, resumeAt, routes } from './flow';

describe('the way in', () => {
  it('starts someone new at the welcome', () => {
    expect(resumeAt(me({ signIn: [], name: null, critter: null, ageOk: false }))).toBe(
      routes.welcome,
    );
  });

  it('asks the age before the critter, after signing in', () => {
    expect(afterSignIn(me({ ageOk: false, name: null, critter: null }))).toBe(routes.age);
    expect(afterSignIn(me({ name: null, critter: null }))).toBe(routes.critter);
    expect(afterSignIn(me())).toBe('done');
  });

  it('shows the house rules to accept when the Terms changed, then goes on', () => {
    expect(resumeAt(me({ termsVersion: '2025-01-01' }))).toBe(routes.acceptTerms);
    expect(resumeAt(me({ termsVersion: null, ageOk: false }))).toBe(routes.acceptTerms);
    expect(resumeAt(me())).toBe('done');
  });

  it('plants a farm after the notifications ask, or goes straight in when joining', () => {
    expect(afterNotifications({ kind: 'start' })).toBe(routes.farm);
    expect(afterNotifications({ kind: 'join', code: 'abcd' })).toBe('done');
  });
});
