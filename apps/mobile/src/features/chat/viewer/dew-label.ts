import type { FarmState, PersonId } from '@kithfield/contracts';

import { useLocale } from '../../../ui/locale/locale-provider';

/** "Pip and Bea", "Pip, Bea and you": who left a dewdrop, outside a chat's room. Empty for nobody. */
export function useDewLabelFor(
  people: readonly PersonId[],
  me: PersonId | null,
  state: FarmState | null,
): string {
  const { t } = useLocale();
  const nameOf = (p: PersonId) =>
    state?.members.find((m) => m.person === (state.aliases[p] ?? p))?.name ??
    t('chat.friendWhoLeft');
  const others = people.filter((p) => p !== me).map(nameOf);
  const names = me !== null && people.includes(me) ? [...others, t('chat.bubble.dew.you')] : others;
  const [a = '', b = '', c = ''] = names;
  if (names.length === 0) return '';
  if (names.length === 1) return t('chat.bubble.dew.one', { a });
  if (names.length === 2) return t('chat.bubble.dew.two', { a, b });
  if (names.length === 3) return t('chat.bubble.dew.three', { a, b, c });
  return t('chat.bubble.dew.many', { a, b });
}
