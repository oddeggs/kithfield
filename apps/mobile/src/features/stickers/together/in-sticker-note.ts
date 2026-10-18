import { useEffect, useState } from 'react';

import { useFarm, useFarmEvents } from '../../../data';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useSession } from '../../../ui/session/session';
import { personFile } from '../local-files';
import { firstInSticker } from '../model/in-sticker';

/**
 * The first time a friend draws you into a together sticker, a small note says so once, and that
 * it can be turned off in Settings. Mounted by a farm's chat.
 */
export function useInStickerNote(farm: string): void {
  const { t } = useLocale();
  const toast = useToast();
  const { person } = useSession();
  const events = useFarmEvents(farm, 50);
  const state = useFarm(farm)?.state ?? null;
  const [noted, setNoted] = useState<boolean | null>(null);
  useEffect(() => {
    setNoted(person ? personFile('noted', person.id).exists : null);
  }, [person]);
  useEffect(() => {
    if (noted !== false) return;
    const found = firstInSticker(events, person?.id ?? null, false);
    if (!found) return;
    const by = state?.members.find((m) => m.person === found.actor)?.name ?? t('stickers.someone');
    toast.show(`${t('stickers.inSticker.title')}. ${t('stickers.inSticker.body', { name: by })}`);
    setNoted(true);
    if (!person) return;
    void personFile('noted', person.id)
      .write('1')
      .catch(() => undefined);
  }, [events, noted, person, state, t, toast]);
}
