import { describe, expect, it } from '@jest/globals';

import { me } from '../../ui/session/me.test-data';
import { afterNotifications, afterSignIn, resumeAt, routes, termsStep } from './flow';

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

  it('resumes at planting when the app closed after the critter was chosen', () => {
    const draft = { person: 'p1', name: 'June', critter: null };
    const fresh = me({ name: null, critter: null });
    expect(resumeAt(fresh, draft)).toBe(routes.farm);
    expect(afterSignIn(fresh, draft)).toBe(routes.farm);
    expect(resumeAt(fresh, null)).toBe(routes.critter);
    // The profile went in but planting failed: still back to planting.
    expect(resumeAt(me(), draft)).toBe(routes.farm);
  });

  it('accepts the first Terms by continuing, but shows new Terms instead of accepting them', () => {
    expect(termsStep(me({ termsVersion: null }))).toBe('accept');
    expect(termsStep(me({ termsVersion: '2025-01-01' }))).toBe('show');
    expect(termsStep(me())).toBe('done');
  });
});
