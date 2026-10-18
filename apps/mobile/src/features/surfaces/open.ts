import { router } from 'expo-router';

import type { SurfaceTarget } from './links';

/** Opens what a surface or a push points at, through the same route a surface link takes. */
export function openTarget(target: SurfaceTarget): void {
  const params: Record<string, string> = { to: target.to };
  if ('farm' in target) params['farm'] = target.farm;
  if ('person' in target) params['person'] = target.person;
  if ('seed' in target) params['seed'] = String(target.seed);
  router.navigate({ pathname: '/surfaces/open', params });
}
