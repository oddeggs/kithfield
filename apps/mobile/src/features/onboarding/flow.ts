import type { Me } from '@kithfield/contracts';

/** The way in's screens, by route under `(onboarding)`. */
export const routes = {
  welcome: '/welcome',
  invite: '/invite',
  signIn: '/sign-in',
  email: '/email',
  emailCode: '/email-code',
  houseRules: '/house-rules',
  /** The house rules where Done accepts the Terms in force. */
  acceptTerms: '/house-rules?accept=1',
  age: '/age',
  tooYoung: '/too-young',
  critter: '/critter',
  look: '/look',
  notifications: '/notifications',
  farm: '/plant',
  contacts: '/contacts',
  friends: '/friends',
} as const;

export type Route = (typeof routes)[keyof typeof routes];

/**
 * Why someone is on the way in: starting a farm of their own, or moving into a friend's from an
 * invite (`03 Onboarding`, Flows in this file).
 */
export type Path = { readonly kind: 'start' } | { readonly kind: 'join'; readonly code: string };

/** A critter chosen on this phone for a farm not planted yet (see `draft.ts`), or null. */
export type Chosen = { readonly person: string } | null;

/** Signed in with something they can sign in with again on a new phone. */
export const hasSignIn = (me: Me): boolean => me.signIn.length > 0;

/** The Terms in force are accepted. */
export const termsAccepted = (me: Me): boolean =>
  me.termsVersion !== null && me.termsVersion === me.currentTermsVersion;

/**
 * Where to go once someone is signed in (and has agreed to the Terms by continuing): the age check
 * before the critter picker, the picker while they have no critter (or planting, when they chose
 * one on this phone and the way in closed before the farm was planted), else they are through.
 */
export function afterSignIn(me: Me, draft: Chosen = null): Route | 'done' {
  if (!me.ageOk) return routes.age;
  if (me.name === null || me.critter === null) return draft ? routes.farm : routes.critter;
  return 'done';
}

/**
 * The Terms after signing in: the first acceptance is the "by continuing you agree" on the
 * sign-in screen; a person who accepted older Terms is shown the new ones, never accepted for.
 */
export function termsStep(me: Me): 'accept' | 'show' | 'done' {
  if (termsAccepted(me)) return 'done';
  return me.termsVersion === null ? 'accept' : 'show';
}

/**
 * Where the way in opens for this person: the welcome for someone new, otherwise the first step
 * they haven't done. Someone signed in whose Terms are out of date (new Terms, or a launch cut
 * short before they were sent) sees the house rules first, to accept them.
 */
export function resumeAt(me: Me, draft: Chosen = null): Route | 'done' {
  if (!hasSignIn(me)) return routes.welcome;
  if (!termsAccepted(me)) return routes.acceptTerms;
  return afterSignIn(me, draft);
}

/** After the critter moves in: a new farm still needs planting; joining goes straight in. */
export function afterNotifications(path: Path): Route | 'done' {
  return path.kind === 'start' ? routes.farm : 'done';
}
