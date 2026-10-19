import type { Bindings } from '../env';

/**
 * Deleting an account deletes the person's customer at RevenueCat too (their app user id is the
 * person id), so the purchase history it kept goes with everything else. Apple keeps its own
 * records of what was bought; buying again or restoring on a new account starts afresh. Without
 * `REVENUECAT_SECRET_KEY` (local, tests) there is nothing to delete there. A customer RevenueCat
 * never had is already gone; any other failure throws, so the purge tries again.
 */
export async function forgetRevenueCatCustomer(
  env: Pick<Bindings, 'REVENUECAT_SECRET_KEY'>,
  person: string,
  fetcher: typeof fetch = fetch,
): Promise<'deleted' | 'absent' | 'skipped'> {
  const key = env.REVENUECAT_SECRET_KEY;
  if (key === undefined || key === '') return 'skipped';
  const response = await fetcher(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(person)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } },
  );
  if (response.status === 404) return 'absent';
  if (!response.ok) throw new Error(`RevenueCat answered ${response.status}`);
  return 'deleted';
}
