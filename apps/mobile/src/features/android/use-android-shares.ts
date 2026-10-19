import { getRandomBytes } from 'expo-crypto';
import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';

import { androidSystem, showChoices } from '../../../modules/android-system';
import { useDataClient } from '../../data';
import { createOpIdMaker } from '../../data/op-id';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import type { GroupStore } from '../surfaces/group-store';
import { takeShareIntent } from './share-intent';

const newOpId = createOpIdMaker(getRandomBytes);

/**
 * Follows the share sheet on Android: what was shared when the app opened, and each share that
 * arrives while it runs. Answers a starter that takes the outbox and a sender for the drafts, and
 * returns how to stop; elsewhere it does nothing.
 */
export function useAndroidShares() {
  const client = useDataClient();
  const { t } = useLocale();
  const { appearance } = useTheme();
  // Read when a share arrives, so a new language or nightfall doesn't restart the surfaces.
  const words = useRef({ t, dark: appearance === 'night' });
  words.current = { t, dark: appearance === 'night' };
  return useCallback(
    (group: GroupStore, send: () => Promise<void>) => {
      if (Platform.OS !== 'android' || androidSystem === null) return () => undefined;
      const take = () =>
        takeShareIntent({
          farms: async () => (await client.api.farms()).farms,
          group,
          choose: (names) =>
            new Promise((resolve) =>
              showChoices(
                {
                  title: words.current.t('android.share.pick'),
                  options: [...names, words.current.t('android.share.cancel')],
                  cancelButtonIndex: names.length,
                  dark: words.current.dark,
                },
                (i) => resolve(i >= 0 && i < names.length ? i : null),
              ),
            ),
          newOpId,
          now: Date.now,
        })
          .then((waiting) => (waiting ? send() : undefined))
          .catch(() => undefined);
      void take();
      const sub = androidSystem.addListener('onShare', () => void take());
      return () => sub.remove();
    },
    [client],
  );
}
