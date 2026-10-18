import { joinPathFor } from '../features/onboarding/invite-code';

/**
 * Links the system opens the app with. A farm invite (`kithfield.com/i/<code>`) goes to the join
 * route, which works both before and after the way in; every other link is left as it came.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return joinPathFor(path) ?? path;
}
