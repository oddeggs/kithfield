import type { Bindings } from '../env';
import { farmStub } from './http';

/** Writes `hibernate {on}` on every farm the person lives on; each farm skips a non-change. */
export const hibernateOnFarms = async (
  env: Bindings,
  person: string,
  on: boolean,
): Promise<void> => {
  const { results } = await env.DB.prepare(
    'SELECT farm_id FROM memberships WHERE person_id = ? AND left_at IS NULL',
  )
    .bind(person)
    .all<{ farm_id: string }>();
  await Promise.all(
    results.map(({ farm_id }) => farmStub(env, farm_id).setHibernating(person, on)),
  );
};
