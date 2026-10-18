import type { Me, MeSettings, MeSettingsUpdate } from '@kithfield/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useSettingsApi } from '../api/use-api';
import { useRemote, type Remote } from '../use-remote';

/** The settings with an update's given keys laid over them. */
const merged = (settings: MeSettings, update: MeSettingsUpdate): MeSettings => ({
  ...settings,
  ...(Object.fromEntries(
    Object.entries(update).filter(([, v]) => v !== undefined),
  ) as Partial<MeSettings>),
});

/**
 * The person and their settings for a settings screen, read again whenever the screen comes back
 * into view. `change` draws a change at once and takes it back if the server refuses.
 */
export function useMeSettings(): {
  readonly me: Remote<Me>;
  readonly settings: MeSettings | null;
  readonly change: (update: MeSettingsUpdate) => void;
} {
  const api = useSettingsApi();
  const toast = useToast();
  const { t } = useLocale();
  const me = useRemote(() => api.me());
  useFocusEffect(
    useCallback(() => {
      me.reload();
    }, [me.reload]),
  );
  const change = useCallback(
    (update: MeSettingsUpdate) => {
      let before: MeSettings | null = null;
      me.set((m) => {
        before = m.settings;
        return { ...m, settings: merged(m.settings, update) };
      });
      api.updateSettings(update).catch(() => {
        const previous = before;
        if (previous) me.set((m) => ({ ...m, settings: previous }));
        toast.show(t('settings.failed'));
      });
    },
    [api, me, toast, t],
  );
  return { me, settings: me.data?.settings ?? null, change };
}
