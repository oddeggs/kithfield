import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useStoredLanguage } from '../../features/settings/device-prefs';
import { ArtProvider, createArtStore } from '../../ui/art/art-provider';
import { ArtIcon, ArtStill } from '../../ui/art/art-view';
import { Avatar } from '../../ui/art/avatar';
import { LocaleProvider, useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { ReduceMotionProvider } from '../../ui/motion/reduce-motion';
import { ThemeProvider, useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { EVENTS, type TrayAction, type TrayCard } from './tauri';

function PopButton({
  label,
  primary,
  onPress,
}: {
  readonly label: string;
  readonly primary: boolean;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Press
      onPress={onPress}
      radius={17}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flex: 1,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? palette.primary.bg : palette.fillSoft,
      }}
    >
      <Txt
        variant="buttonSmall"
        color={primary ? palette.primary.fg : palette.text}
        style={{ fontSize: 13 }}
      >
        {label}
      </Txt>
    </Press>
  );
}

/**
 * The critter's popover: the night widget, who left a firefly or who is
 * by the fire, and a way to the farm. It draws only what the app's window sends it, and hands
 * its buttons back to that window, so it holds no data of its own.
 */
function TrayPopover() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const [card, setCard] = useState<TrayCard | null>(null);

  useEffect(() => {
    const heard = listen<TrayCard>(EVENTS.card, ({ payload }) => setCard(payload));
    void emit(EVENTS.wanted);
    return () => void heard.then((off) => off());
  }, []);

  const act = (action: TrayAction) => {
    void emit(EVENTS.action, action);
    void getCurrentWindow().hide();
  };
  if (!card) return null;

  const title =
    card.kind === 'firefly'
      ? t('platforms.tray.firefly', { name: card.name })
      : card.kind === 'fire'
        ? card.line
        : t('platforms.tray.quiet');
  const sub =
    card.kind === 'firefly'
      ? t('platforms.tray.fireflyBody')
      : card.kind === 'fire'
        ? t('platforms.tray.fireBody')
        : null;
  const species = card.kind === 'quiet' ? null : card.species;

  return (
    <View
      style={{
        margin: 0,
        borderRadius: 16,
        backgroundColor: palette.card,
        padding: 14,
        gap: 10,
      }}
    >
      <View style={{ height: 120, borderRadius: 12, overflow: 'hidden' }}>
        <ArtStill
          scene="widget"
          width={272}
          height={120}
          attrs={{ season: card.kind === 'quiet' ? 'spring' : card.season }}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {species ? <Avatar kind={species} size={34} /> : null}
        <View style={{ flex: 1 }}>
          <Txt variant="rowTitle" style={{ fontSize: 14, lineHeight: 16.8 }}>
            {title}
          </Txt>
          {sub ? (
            <Txt
              variant="caption"
              color={palette.secondary}
              style={{ fontSize: 12.5, lineHeight: 16.25 }}
            >
              {sub}
            </Txt>
          ) : null}
        </View>
        {card.kind === 'firefly' ? <ArtIcon name="firefly" size={30} color={palette.text} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PopButton label={t('platforms.tray.open')} primary onPress={() => act('open')} />
        {card.kind === 'firefly' ? (
          <PopButton
            label={t('platforms.tray.sendBack')}
            primary={false}
            onPress={() => act('sendBack')}
          />
        ) : card.kind === 'fire' ? (
          <PopButton label={t('platforms.tray.sit')} primary={false} onPress={() => act('sit')} />
        ) : null}
      </View>
    </View>
  );
}

/** The popover's page: the app's providers around the card, on a see-through window. */
export function TrayPopoverRoot() {
  const language = useStoredLanguage();
  const [art] = useState(() => createArtStore());
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);
  return (
    <SafeAreaProvider>
      <ReduceMotionProvider>
        <LocaleProvider storedChoice={language}>
          <ThemeProvider>
            <ArtProvider store={art}>
              <TrayPopover />
            </ArtProvider>
          </ThemeProvider>
        </LocaleProvider>
      </ReduceMotionProvider>
    </SafeAreaProvider>
  );
}
