import { getLocales } from 'expo-localization';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useDataClient } from '../../../data';
import { Button } from '../../../ui/components/button';
import { Toggle } from '../../../ui/components/toggle';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useAccount } from '../../../ui/session/account';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../../ui/type/accessibility-size';
import { Txt } from '../../../ui/type/text';
import {
  daysIn,
  isComplete,
  monthDayOf,
  noBirthday,
  withPart,
  yearsUpTo,
  type Birthday,
} from '../birthday';
import { countryOf } from '../calendar';
import { routes } from '../flow';
import { useFlow } from '../flow-state';
import { SceneArt } from '../scene-art';
import {
  AxFlow,
  Body,
  BottomBar,
  ErrorLine,
  Title,
  TopBar,
  useDesignTop,
  useInks,
  useSceneAttrs,
  roseAttrs,
} from '../kit';
import { PickerSheet, type PickerOption } from '../picker-sheet';
import { useProgress } from '../progress';

type Part = keyof Birthday;

const MONTHS = [
  'onboarding.month.1',
  'onboarding.month.2',
  'onboarding.month.3',
  'onboarding.month.4',
  'onboarding.month.5',
  'onboarding.month.6',
  'onboarding.month.7',
  'onboarding.month.8',
  'onboarding.month.9',
  'onboarding.month.10',
  'onboarding.month.11',
  'onboarding.month.12',
] as const;

function Select({
  label,
  value,
  open,
  onPress,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly open: boolean;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  const inks = useInks();
  // At the accessibility sizes the three stack, each the width of the screen, and a month's name
  // may take two lines.
  const ax = useAccessibilitySize();
  return (
    <Press
      onPress={onPress}
      radius={16}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={{
        ...(ax ? { paddingVertical: 8, gap: 8 } : { flex: 1 }),
        minHeight: 54,
        borderRadius: 16,
        backgroundColor: palette.card,
        borderWidth: open ? 2 : 1,
        borderColor: open ? inks.moss : palette.chip.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: open ? 13 : 14,
      }}
    >
      <Txt
        variant="button"
        color={value ? palette.text : palette.placeholder}
        numberOfLines={ax ? 2 : 1}
        {...(ax ? { style: { flexShrink: 1 } } : {})}
      >
        {value ?? label}
      </Txt>
      <Txt variant="button" color={palette.chevron}>
        ▾
      </Txt>
    </Press>
  );
}

/**
 * The age check, after signing in and before the critter: only the birth year and the phone's
 * country go to the server, which says whether this person is old enough there. The day and month
 * are kept only when birthday blooms are on. Under age, nothing is saved and the person is told
 * kindly.
 */
export function AgeScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { palette } = useTheme();
  const top = useDesignTop();
  const scene = useSceneAttrs();
  const ax = useAccessibilitySize();
  const data = useDataClient();
  const account = useAccount();
  const { api, update } = useFlow();
  const progress = useProgress();
  const [birthday, setBirthday] = useState<Birthday>(noBirthday);
  const [bloom, setBloom] = useState(false);
  const [picking, setPicking] = useState<Part | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthName = (m: number) => t(MONTHS[m - 1] ?? 'onboarding.month.1');
  const options = useMemo<Record<Part, PickerOption<number>[]>>(
    () => ({
      day: Array.from({ length: daysIn(birthday.month, birthday.year) }, (_, i) => ({
        value: i + 1,
        label: String(i + 1),
      })),
      month: Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: monthName(i + 1) })),
      year: yearsUpTo(new Date().getFullYear()).map((y) => ({ value: y, label: String(y) })),
    }),
    // The month names follow the language through `t`.
    [birthday.month, birthday.year, t],
  );

  const shown: Record<Part, string | null> = {
    day: birthday.day === null ? null : String(birthday.day),
    month: birthday.month === null ? null : monthName(birthday.month),
    year: birthday.year === null ? null : String(birthday.year),
  };

  const go = async () => {
    if (busy || !isComplete(birthday)) return;
    setBusy(true);
    setError(null);
    try {
      const country = countryOf(getLocales()[0]?.regionCode);
      const answer = await api.age({ birthYear: birthday.year, country });
      if (answer === 'under_age') {
        await account.forget().catch(() => undefined);
        router.replace(routes.tooYoung);
        return;
      }
      const monthDay = bloom ? monthDayOf(birthday) : null;
      update({ birthday: monthDay });
      if (monthDay) await data.api.updateProfile({ birthday: monthDay });
      await progress.go(progress.next(await progress.me()));
    } catch {
      setError(t('onboarding.failed'));
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Part, string> = {
    day: t('onboarding.age.day'),
    month: t('onboarding.age.month'),
    year: t('onboarding.age.year'),
  };

  const words = (
    <>
      <Title line={1.12}>{t('onboarding.age.title')}</Title>
      <Body>{t('onboarding.age.body')}</Body>
      <View style={{ flexDirection: ax ? 'column' : 'row', gap: 8 }}>
        {(['day', 'month', 'year'] as const).map((part) => (
          <Select
            key={part}
            label={titles[part]}
            value={shown[part]}
            open={picking === part}
            onPress={() => setPicking(part)}
          />
        ))}
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 16,
          backgroundColor: palette.card,
        }}
      >
        <View style={{ flex: 1 }}>
          <Txt variant="rowTitle" style={{ fontSize: 15, lineHeight: 18 }}>
            {t('onboarding.age.bloom')}
          </Txt>
          <Txt
            variant="caption"
            color={palette.secondary}
            style={{ fontSize: 13, lineHeight: 16.9 }}
          >
            {t('onboarding.age.bloomBody')}
          </Txt>
        </View>
        <Toggle value={bloom} onChange={setBloom} label={t('onboarding.age.bloom')} />
      </View>
      <Txt
        variant="note"
        multiline
        color={palette.secondary}
        style={{ fontSize: 12.5, lineHeight: 18.1 }}
      >
        {t('onboarding.age.note')}
      </Txt>
      <ErrorLine text={error} />
    </>
  );
  const button = (
    <Button
      label={t('onboarding.continue')}
      onPress={() => void go()}
      disabled={busy || !isComplete(birthday)}
    />
  );
  const pickers = (
    <>
      {(['day', 'month', 'year'] as const).map((part) => (
        <PickerSheet
          key={part}
          title={titles[part]}
          options={options[part]}
          value={birthday[part]}
          open={picking === part}
          onPick={(value) => {
            setBirthday((b) => withPart(b, part, value));
            setPicking(null);
          }}
          onClose={() => setPicking((p) => (p === part ? null : p))}
        />
      ))}
    </>
  );

  if (ax) {
    return (
      <AxFlow bar={<TopBar onBack={() => router.back()} />} footer={button} overlay={pickers}>
        <SceneArt
          scene="plant"
          width={160}
          height={170}
          attrs={roseAttrs(scene, 3)}
          style={{ alignSelf: 'center' }}
        />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>{words}</View>
      </AxFlow>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <TopBar onBack={() => router.back()} />
      <SceneArt
        scene="plant"
        width={160}
        height={170}
        attrs={roseAttrs(scene, 3)}
        style={{ position: 'absolute', top: top(96), left: 116 }}
      />
      <View style={{ position: 'absolute', top: top(280), left: 20, right: 20, gap: 12 }}>
        {words}
      </View>
      <BottomBar>{button}</BottomBar>
      {pickers}
    </View>
  );
}
