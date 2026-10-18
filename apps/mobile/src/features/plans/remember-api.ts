import type { RememberRequest, RememberResponse } from '@kithfield/contracts';

import type { ApiClient } from '../../data';

/**
 * The remember-me seed's endpoint (`POST /v1/remember`): personal, kept by the person's cottage,
 * never in a farm's log. The data layer's API client carries it as `remember`.
 */
export type PlantRemember = (seed: RememberRequest) => Promise<RememberResponse>;

type WithRemember = ApiClient & { readonly remember?: PlantRemember };

/** The API's `remember`, or null on a data layer that doesn't offer it yet. */
export function rememberOf(api: ApiClient): PlantRemember | null {
  return (api as WithRemember).remember ?? null;
}
