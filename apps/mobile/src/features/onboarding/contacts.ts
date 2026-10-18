/** A contact as the address book gives it (only what the list needs). */
export interface BookContact {
  readonly id?: string | undefined;
  readonly name?: string | undefined;
  readonly firstName?: string | undefined;
  readonly lastName?: string | undefined;
  readonly phoneNumbers?: readonly { readonly number?: string | undefined }[] | undefined;
}

/** A friend to invite: who, the number the link goes to, and the letter on their circle. */
export interface Friend {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly initial: string;
}

/**
 * The people in the address book an invite can reach by text: with a name and a number, each
 * once, sorted by name in the reader's language. Nothing leaves the phone.
 */
export function friendsIn(contacts: readonly BookContact[], language: string): Friend[] {
  const seen = new Set<string>();
  const friends: Friend[] = [];
  for (const c of contacts) {
    const name = (c.name ?? [c.firstName, c.lastName].filter(Boolean).join(' ')).trim();
    const phone = c.phoneNumbers?.find((p) => p.number && p.number.trim() !== '')?.number?.trim();
    if (!name || !phone || !c.id || seen.has(c.id)) continue;
    seen.add(c.id);
    const initial = Array.from(name)[0]?.toLocaleUpperCase(language) ?? '?';
    friends.push({ id: c.id, name, phone, initial });
  }
  return friends.sort((a, b) => a.name.localeCompare(b.name, language));
}

/** The friends whose name holds what was typed, ignoring case and Vietnamese marks. */
export function matching(friends: readonly Friend[], query: string): readonly Friend[] {
  const fold = (s: string) =>
    s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const q = fold(query.trim());
  return q === '' ? friends : friends.filter((f) => fold(f.name).includes(q));
}

/** The tints the letter circles take, from the critters' own. */
const TINTS = ['#E6DDE4', '#EFE2C8', '#E2EAD0', '#F2E0D4', '#E4E3E3', '#ECDCCB'] as const;

export function tintFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length] ?? TINTS[0];
}
