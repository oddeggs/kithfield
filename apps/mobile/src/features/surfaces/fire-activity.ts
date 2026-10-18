import type { FireActivity } from '@kithfield/contracts';
import { useEffect, useRef } from 'react';

import { surfaces, type SurfacesEvents } from '../../../modules/surfaces';
import { surfaceLink } from './links';
import { appScheme } from './scheme';

/*
 * The fire's Live Activity, for the fire room to drive (`10 On the System`, the fire's Live
 * Activity): it starts when the person sits down, follows who's talking and whether they're
 * muted, and ends when they head home or 10 minutes after they're alone. It never starts on
 * anyone else's phone: only this phone's own sitting down starts it. Mute and Leave on it come
 * back through `useFireActivityButtons`.
 */

type Attributes = Omit<FireActivity['attributes'], 'link'>;
type State = FireActivity['state'];

let running: { id: string; farm: string } | null = null;

/** Starts the fire's activity for `farm`, or moves the one already showing to this state. */
export async function startFireActivity(attributes: Attributes, state: State): Promise<void> {
  if (surfaces === null || !surfaces.activitiesEnabled()) return;
  if (running?.farm === attributes.farm) return updateFireActivity(state);
  if (running) await endFireActivity();
  const link = surfaceLink(appScheme(), { to: 'fire', farm: attributes.farm });
  const id = await surfaces.startActivity(
    'fire',
    attributes.farm,
    JSON.stringify({ ...attributes, link }),
    JSON.stringify(state),
    true,
  );
  if (id !== null) running = { id, farm: attributes.farm };
}

export async function updateFireActivity(state: State): Promise<void> {
  if (surfaces === null || running === null) return;
  await surfaces.updateActivity(running.id, JSON.stringify(state));
}

export async function endFireActivity(): Promise<void> {
  if (surfaces === null || running === null) return;
  const { id } = running;
  running = null;
  await surfaces.endActivity(id, null);
}

/** Mute, Unmute and Leave pressed on the fire's activity, while the fire room listens. */
export function useFireActivityButtons(on: SurfacesEvents['onActivityAction']): void {
  const handler = useRef(on);
  handler.current = on;
  useEffect(() => {
    if (surfaces === null) return;
    const sub = surfaces.addListener('onActivityAction', (event) => handler.current(event));
    return () => sub.remove();
  }, []);
}
