import type { SurfaceData } from '@kithfield/contracts';
import { day, night } from '@kithfield/theme';

import type { ArtStore } from '../../../ui/art/art-store';
import { imageNames } from '../../surfaces/names';
import { writeImages } from '../../surfaces/render';
import { androidExtrasStore } from '../surface-root';
import { redrawWidgets } from './redraw';

/**
 * The icons only Android's widgets draw: the dewdrop, in ink by day and moonlight by night, and the
 * moss check that takes its place once one was left.
 */
const EXTRA_ICONS = [
  { name: 'dewdrop', icon: 'dewdrop', color: day.ink },
  { name: 'dewdrop-night', icon: 'dewdrop', color: night.moon },
  { name: 'left', icon: 'check', color: day.moss },
] as const;

/**
 * After the surfaces wrote their files: draws Android's own icons beside them, then redraws every
 * widget on the home screen from the new files.
 */
export async function reloadAndroidWidgets(art: ArtStore, _data: SurfaceData): Promise<void> {
  await writeImages(
    art,
    androidExtrasStore(),
    EXTRA_ICONS.map(({ name, icon, color }) => ({
      name: imageNames.icon(name),
      drawing: {
        type: 'scene' as const,
        scene: 'icon',
        width: 24,
        height: 24,
        attrs: { name: icon, color },
      },
    })),
  );
  await redrawWidgets();
}
