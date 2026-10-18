import type { Lang, MeSettings, QuietHours } from '@kithfield/contracts';
import { router } from 'expo-router';

import { useLocale } from '../../../ui/locale/locale-provider';
import { haptics } from '../../../ui/motion/haptics';
import { useDevicePref } from '../device-prefs';
import { HOUSE_HOURS, QUIET_PRESETS, clockTime, sameHours, zoneName } from '../format';
import { Group, NavBar, Note, Page, Row } from '../kit/layout';
import { usePhoneZone } from '../time-zone';
import { useMeSettings } from './use-me-settings';

export type ChoiceSetting = 'nudges' | 'quietHours' | 'language';

export const isChoiceSetting = (s: unknown): s is ChoiceSetting =>
  s === 'nudges' || s === 'quietHours' || s === 'language';

interface Option {
  readonly key: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly on: boolean;
  readonly pick: () => void;
}

/**
 * One setting chosen from a short list (gentle nudges, quiet hours, language), as the radio rows of
 * the farm's mute. No design draws these pickers; they are logged as undesigned.
 */
export function ChooseScreen({ setting }: { readonly setting: ChoiceSetting }) {
  const { t, language } = useLocale();
  const { settings, change } = useMeSettings();
  const zone = usePhoneZone();
  const [, setStoredLanguage] = useDevicePref('language');
  const choose = (update: Partial<MeSettings>) => {
    haptics.select();
    change(update);
    router.back();
  };
  const time = (q: QuietHours) => ({
    from: clockTime(q.from, language),
    to: clockTime(q.to, language),
  });

  const { title, note, options } = ((): {
    title: string;
    note: string;
    options: readonly Option[];
  } => {
    if (setting === 'nudges') {
      return {
        title: t('settings.nudges.title'),
        note: t('settings.nudges.note'),
        options: (['off', 'few', 'some'] as const).map((n) => ({
          key: n,
          title: t(`settings.nudges.${n}`),
          on: settings?.nudges === n,
          pick: () => choose({ nudges: n }),
        })),
      };
    }
    if (setting === 'quietHours') {
      return {
        title: t('settings.quietHours'),
        note: t('settings.quietHours.note', { ...time(HOUSE_HOURS), zone: zoneName(zone) }),
        options: QUIET_PRESETS.map((q) => ({
          key: q ? `${q.from}-${q.to}` : 'house',
          title: q ? t('settings.quietHours.range', time(q)) : t('settings.quietHours.house'),
          ...(q ? {} : { subtitle: t('settings.quietHours.houseSub', time(HOUSE_HOURS)) }),
          on: settings !== null && sameHours(settings.quietHours, q),
          // Quiet hours always travel with the zone they are read in.
          pick: () => choose({ quietHours: q, timeZone: zone }),
        })),
      };
    }
    return {
      title: t('settings.language'),
      note: t('settings.language.note'),
      options: (['en', 'vi'] as const satisfies readonly Lang[]).map((l) => ({
        key: l,
        title: t(`settings.language.${l}`),
        on: (settings?.lang ?? language) === l,
        pick: () => {
          setStoredLanguage(l);
          choose({ lang: l });
        },
      })),
    };
  })();

  return (
    <Page header={<NavBar title={title} />}>
      <Group>
        {options.map((o) => (
          <Row
            key={o.key}
            title={o.title}
            {...(o.subtitle ? { subtitle: o.subtitle } : {})}
            onPress={o.pick}
            selected={o.on}
          />
        ))}
      </Group>
      <Note text={note} />
    </Page>
  );
}
