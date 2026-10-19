import type { Critter } from '@kithfield/contracts';
import type { Translate } from '@kithfield/i18n';

import { exportOrder, packOf, OWN } from '../model/catalogue';
import { sceneOfSticker } from '../model/look';

/** One sticker of a pack that leaves the app: its file stem, its words and how the art draws it. */
export interface PackSticker {
  readonly id: string;
  /** `01-wave`: the order is in the name, so a folder lists them in the pack's order. */
  readonly stem: string;
  readonly label: string;
  readonly attrs: Readonly<Record<string, string>>;
}

/** The person's own pack as it leaves the app, in its export order, wearing what they wear now. */
export function ownPack(
  t: Translate,
  me: { readonly name: string | null; readonly critter: Critter },
): PackSticker[] {
  const pack = packOf(OWN);
  if (!pack) return [];
  return exportOrder(pack).map((st, i) => {
    const attrs = sceneOfSticker(t, { pack: OWN, sticker: st.id }, me, () => null);
    return {
      id: st.id,
      stem: `${String(i + 1).padStart(2, '0')}-${st.id.replace(/_/g, '-')}`,
      label: attrs['caption'] ?? st.id,
      attrs,
    };
  });
}
