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

/** Signed in with something they can sign in with again on a new phone. */
export const hasSignIn = (me: Me): boolean => me.signIn.length > 0;

/** The Terms in force are accepted. */
export const termsAccepted = (me: Me): boolean =>
  me.termsVersion !== null && me.termsVersion === me.currentTermsVersion;

/**
 * Where to go once someone is signed in (and has agreed to the Terms by continuing): the age check
 * before the critter picker, the picker while they have no critter, else they are through.
 */
export function afterSignIn(me: Me): Route | 'done' {
  if (!me.ageOk) return routes.age;
  if (me.name === null || me.critter === null) return routes.critter;
  return 'done';
}

/**
 * Where the way in opens for this person: the welcome for someone new, otherwise the first step
 * they haven't done. Someone signed in whose Terms are out of date (new Terms, or a launch cut
 * short before they were sent) sees the house rules first, to accept them.
 */
export function resumeAt(me: Me): Route | 'done' {
  if (!hasSignIn(me)) return routes.welcome;
  if (!termsAccepted(me)) return routes.acceptTerms;
  return afterSignIn(me);
}

/** After the critter moves in: a new farm still needs planting; joining goes straight in. */
export function afterNotifications(path: Path): Route | 'done' {
  return path.kind === 'start' ? routes.farm : 'done';
}
