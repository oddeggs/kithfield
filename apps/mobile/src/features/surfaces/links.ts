import { FarmId, PersonId, type SurfaceLink } from '@kithfield/contracts';

/*
 * The links the surfaces open the app with: `<scheme>://surfaces/open?to=…`, read by the
 * `surfaces/open` route. A surface turns a farm's link into the fire room's or a plan's
 * (`targets/_shared/SurfaceLinks.swift`).
 */

export type SurfaceTarget =
  | { readonly to: 'farm'; readonly farm: FarmId }
  | { readonly to: 'fire'; readonly farm: FarmId }
  | { readonly to: 'critter'; readonly farm: FarmId; readonly person: PersonId }
  | { readonly to: 'plan'; readonly farm: FarmId; readonly seed: number }
  | { readonly to: 'share' };

export function surfaceLink(scheme: string, target: SurfaceTarget): SurfaceLink {
  const params: [string, string][] = [['to', target.to]];
  if ('farm' in target) params.push(['farm', target.farm]);
  if ('person' in target) params.push(['person', target.person]);
  if ('seed' in target) params.push(['seed', String(target.seed)]);
  const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${scheme}://surfaces/open?${query}`;
}

/** A link's target, from the route's search params; null for one it doesn't know. */
export function targetOf(params: Readonly<Record<string, string | string[] | undefined>>) {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === 'string' && value !== '' ? value : null;
  };
  const to = one('to');
  if (to === 'share') return { to } as const;
  const farm = FarmId.safeParse(one('farm'));
  if (!farm.success) return null;
  if (to === 'farm' || to === 'fire') return { to, farm: farm.data } as const;
  const person = PersonId.safeParse(one('person'));
  if (to === 'critter' && person.success) {
    return { to, farm: farm.data, person: person.data } as const;
  }
  const seed = Number(one('seed'));
  if (to === 'plan' && Number.isInteger(seed) && seed > 0) {
    return { to, farm: farm.data, seed } as const;
  }
  return null;
}
