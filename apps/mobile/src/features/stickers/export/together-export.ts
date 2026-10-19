import type { FarmState } from '@kithfield/contracts';
import type { Translate } from '@kithfield/i18n';

import type { DataClient } from '../../../data';
import { stickersApi } from '../api';
import { personFile } from '../local-files';
import { OWN } from '../model/catalogue';
import { sceneOfSticker, type StickerPerson } from '../model/look';
import type { PackSticker } from './pack';

/*
 * Together stickers on their way out of Kithfield. Asking (`POST /v1/stickers/together/export`)
 * is remembered on the phone; each time the Messages drawer is brought up to date, every
 * remembered sticker is asked about again (which only reads where things stand) and goes into the
 * drawer once everyone in it said OK, and comes out again if someone changes their mind.
 */

/** A together sticker someone asked to take out of Kithfield. */
export interface TogetherExport {
  readonly farm: string;
  readonly sticker: string;
  readonly with: readonly string[];
}

const keyOf = (e: TogetherExport) => `${e.farm}/${e.sticker}/${[...e.with].sort().join(',')}`;

/** The asked-for stickers with one more, once. */
export function addTogetherExport(
  list: readonly TogetherExport[],
  next: TogetherExport,
): TogetherExport[] {
  return list.some((e) => keyOf(e) === keyOf(next)) ? [...list] : [...list, next];
}

/** The asked-for stickers everyone in said OK to, given who said OK to each. */
export function approvedExports(
  list: readonly TogetherExport[],
  ok: readonly (readonly string[])[],
): TogetherExport[] {
  return list.filter((e, i) => e.with.every((p) => ok[i]?.includes(p) === true));
}

/** The person's asked-for stickers on this phone. */
export async function readTogetherExports(person: string): Promise<TogetherExport[]> {
  try {
    const file = personFile('together', person);
    if (!file.exists) return [];
    const parsed: unknown = JSON.parse(await file.text());
    return Array.isArray(parsed) ? (parsed as TogetherExport[]) : [];
  } catch {
    return [];
  }
}

/** Remembers an asked-for sticker. */
export async function rememberTogetherExport(person: string, next: TogetherExport): Promise<void> {
  const file = personFile('together', person);
  const list = addTogetherExport(await readTogetherExports(person), next);
  if (!file.exists) file.create();
  await file.write(JSON.stringify(list));
}

/**
 * The together stickers that go into the Messages drawer now, as the pack's last stickers: each
 * asked about again, drawn with everyone as they look today. One that can't be asked about (no
 * network) stays out until the next time.
 */
export async function approvedTogether(
  client: DataClient,
  t: Translate,
  me: StickerPerson & { readonly person: string },
  first: number,
): Promise<PackSticker[]> {
  const list = await readTogetherExports(me.person);
  const api = stickersApi(client.api);
  const ok = await Promise.all(
    list.map((e) =>
      api.askToExport({ farm: e.farm, people: [...e.with] }).then(
        (r) => r.ok,
        () => [] as string[],
      ),
    ),
  );
  const out: PackSticker[] = [];
  for (const [i, e] of approvedExports(list, ok).entries()) {
    const state: FarmState | null = (await client.replica(e.farm)).getState().state;
    const personOf = (p: string): StickerPerson | null => {
      const m = state?.members.find((x) => x.person === p);
      return m ? { name: m.name, critter: m.critter } : null;
    };
    const attrs = sceneOfSticker(t, { pack: OWN, sticker: e.sticker, with: e.with }, me, personOf);
    out.push({
      id: `together_${e.sticker}`,
      stem: `${String(first + i).padStart(2, '0')}-together-${e.sticker.replace(/_/g, '-')}`,
      label: attrs['caption'] ?? e.sticker,
      attrs,
    });
  }
  return out;
}
