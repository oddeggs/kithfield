import type { Language } from '@kithfield/i18n';
import type { Appearance } from '@kithfield/theme';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Segmented } from '../components/segmented';
import { LocaleScope, useLocale } from '../locale/locale-provider';
import { ThemeScope, useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';
import { BubblesSection, TraySection } from './sections-chat';
import { SheetSample } from './sheet-sample';
import { CardsSection, IconsSection } from './sections-cards';
import { ButtonsSection, ControlsSection } from './sections-controls';
import { SheetsSection, ShellsSection } from './sections-sheets';
import { TypeSection } from './sections-type';

const sectionNames = [
  'buttons',
  'controls',
  'bubbles',
  'sheets',
  'tray',
  'cards',
  'icons',
  'shells',
  'type',
] as const;
type SectionName = (typeof sectionNames)[number];

function Sections({
  only,
  onOpenSheet,
}: {
  readonly only: SectionName | null;
  readonly onOpenSheet: () => void;
}) {
  const show = (name: SectionName) => only === null || only === name;
  return (
    <>
      {show('buttons') ? <ButtonsSection /> : null}
      {show('controls') ? <ControlsSection /> : null}
      {show('bubbles') ? <BubblesSection /> : null}
      {show('sheets') ? <SheetsSection onOpenSheet={onOpenSheet} /> : null}
      {show('tray') ? <TraySection /> : null}
      {show('cards') ? <CardsSection /> : null}
      {show('icons') ? <IconsSection /> : null}
      {show('shells') ? <ShellsSection /> : null}
      {show('type') ? <TypeSection /> : null}
    </>
  );
}

function Page({
  appearance,
  language,
  setAppearance,
  setLanguage,
  only,
}: {
  readonly appearance: Appearance;
  readonly language: Language;
  readonly setAppearance: (a: Appearance) => void;
  readonly setLanguage: (l: Language) => void;
  readonly only: SectionName | null;
}) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState(-1);
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 4,
          gap: 20,
        }}
      >
        <View style={{ paddingHorizontal: 12, gap: 12 }}>
          <Txt variant="displayM" accessibilityRole="header">
            {t('gallery.title')}
          </Txt>
          <Segmented<Appearance>
            label={t('gallery.title')}
            value={appearance}
            onChange={setAppearance}
            segments={[
              { value: 'day', label: t('gallery.day') },
              { value: 'night', label: t('gallery.night') },
            ]}
          />
          <Segmented<Language>
            label={t('gallery.title')}
            value={language}
            onChange={setLanguage}
            segments={[
              { value: 'en', label: t('gallery.language.en') },
              { value: 'vi', label: t('gallery.language.vi') },
            ]}
          />
        </View>
        <Sections only={only} onOpenSheet={() => setSheet(0)} />
      </ScrollView>
      <SheetSample index={sheet} onIndexChange={setSheet} />
    </View>
  );
}

/**
 * Every component of the library, in day or night and English or Vietnamese, for comparing with
 * `design/renders/01-foundations/components.png`. `?night=1`, `?lang=vi` and `?section=cards`
 * set it up from a link, for scripted screenshots. Development builds only.
 */
export function Gallery() {
  const params = useLocalSearchParams<{ night?: string; lang?: string; section?: string }>();
  const [appearance, setAppearance] = useState<Appearance>(params.night === '1' ? 'night' : 'day');
  const [language, setLanguage] = useState<Language>(params.lang === 'vi' ? 'vi' : 'en');
  const only = sectionNames.find((s) => s === params.section) ?? null;
  // A new link onto the open gallery sets it up again.
  useEffect(() => {
    setAppearance(params.night === '1' ? 'night' : 'day');
    setLanguage(params.lang === 'vi' ? 'vi' : 'en');
  }, [params.night, params.lang]);
  return (
    <ThemeScope appearance={appearance}>
      <LocaleScope language={language}>
        <Page
          key={`${appearance}:${language}`}
          appearance={appearance}
          language={language}
          setAppearance={setAppearance}
          setLanguage={setLanguage}
          only={only}
        />
      </LocaleScope>
    </ThemeScope>
  );
}
