import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient } from '../../../data';
import { useArt } from '../../../ui/art/art-provider';
import { ArtIcon } from '../../../ui/art/art-view';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { stickerRoutes } from '../routes';
import { useStickerColours } from '../ui/colours';
import { ScreenHeader } from '../ui/header';
import { StickerArt } from '../ui/sticker';
import { useMe } from '../ui/use-me';
import { wornName } from '../ui/worn';
import { ownPack } from './pack';
import { saveToPhotos } from './photos';
import { useMessagesSync } from './use-messages-sync';
import { roomy } from '../ui/type';

const PREVIEW = 76;
const PREVIEWED = 8;

/**
 * Your stickers, elsewhere: your own pack in the Messages drawer (always there, redrawn when your
 * critter changes), as a Telegram set or a WhatsApp pack, or saved to Photos.
 */
export function ExportScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const sc = useStickerColours();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const client = useDataClient();
  const store = useArt();
  const me = useMe();
  const critter = me.critter;
  const stickers = useMemo(
    () => (critter ? ownPack(t, { name: me.name, critter }) : []),
    [t, me.name, critter],
  );
  const messages = useMessagesSync(me);
  const [saving, setSaving] = useState(false);
  const [firstFarm, setFirstFarm] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    client.api.farms().then(
      (list) => live && setFirstFarm(list.farms.find((f) => f.kind === 'farm')?.farm ?? null),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client]);

  const name = me.name ?? t('stickers.someone');
  const worn = wornName(t, critter);
  const count = stickers.length;

  const save = () => {
    if (!critter) return;
    setSaving(true);
    void saveToPhotos(store.art, stickers).then((result) => {
      setSaving(false);
      if (result === 'saved') toast.show(t('stickers.export.saved'));
      else if (result === 'denied') toast.show(t('stickers.export.photosDenied'));
      else toast.show(t('stickers.adding.failed'));
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title={t('stickers.export.title')} glass={false} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 53,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 24,
          gap: 14,
        }}
      >
        <View
          style={{
            borderRadius: 24,
            backgroundColor: sc.preview,
            padding: 14,
            flexDirection: 'row',
            flexWrap: 'wrap',
            rowGap: 4,
          }}
        >
          {stickers.slice(0, PREVIEWED).map((s) => (
            <View key={s.id} style={{ width: '25%', alignItems: 'center' }}>
              <StickerArt attrs={s.attrs} size={PREVIEW} />
            </View>
          ))}
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Txt variant="displayS" accessibilityRole="header" style={roomy('displayS')}>
              {t('stickers.export.pack', { name })}
            </Txt>
            <Txt variant="rowSubtitle" color={palette.secondary} style={{ marginTop: 2 }}>
              {worn
                ? t('stickers.export.count', { count, item: worn })
                : t('stickers.export.countOwn', { count })}
            </Txt>
          </View>
          {firstFarm ? (
            <Pill
              label={t('stickers.export.together')}
              kind="outline"
              onPress={() => router.push(stickerRoutes.together(firstFarm, true))}
            />
          ) : null}
        </View>
        <View
          style={{
            borderRadius: 22,
            backgroundColor: palette.card,
            paddingVertical: 2,
            paddingHorizontal: 14,
          }}
        >
          <Row
            tile={sc.messagesTile}
            icon="chat"
            title={t('stickers.export.messages')}
            sub={t('stickers.export.messages.sub', { name })}
            trailing={
              <View
                accessibilityLiveRegion="polite"
                style={{
                  height: 30,
                  paddingHorizontal: 13,
                  borderRadius: 15,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: sc.onBg,
                  borderWidth: 1,
                  borderColor: sc.onBorder,
                }}
              >
                {messages.state === 'updating' || messages.state === 'checking' ? null : (
                  <ArtIcon name="check" size={13} color={sc.onFg} />
                )}
                <Txt variant="chip" medium color={sc.onFg}>
                  {messages.state === 'updating' || messages.state === 'checking'
                    ? t('stickers.export.updating')
                    : t('stickers.export.on')}
                </Txt>
              </View>
            }
          />
          <Row
            tile={sc.telegramTile}
            icon="share"
            title={t('stickers.export.telegram')}
            sub={t('stickers.export.telegram.sub')}
            trailing={
              <Pill
                label={t('stickers.export.add')}
                kind="ink"
                onPress={() => router.push(stickerRoutes.adding())}
              />
            }
          />
          <Row
            tile={sc.whatsappTile}
            icon="share"
            title={t('stickers.export.whatsapp')}
            sub={t('stickers.export.whatsapp.sub', { count })}
            trailing={
              <Pill
                label={t('stickers.export.add')}
                kind="ink"
                onPress={() => router.push(stickerRoutes.adding())}
              />
            }
          />
          <Row
            tile={sc.photosTile}
            icon="photo"
            iconColour={palette.text}
            title={t('stickers.export.photos')}
            sub={t('stickers.export.photos.sub')}
            last
            trailing={
              <Pill
                label={t('stickers.export.save')}
                kind="outline"
                disabled={saving}
                onPress={save}
              />
            }
          />
        </View>
        <Txt variant="note" multiline color={palette.secondary}>
          {t('stickers.export.footer')}
        </Txt>
      </ScrollView>
    </View>
  );
}

function Row({
  tile,
  icon,
  iconColour,
  title,
  sub,
  trailing,
  last = false,
}: {
  readonly tile: string;
  readonly icon: string;
  readonly iconColour?: string;
  readonly title: string;
  readonly sub: string;
  readonly trailing: ReactNode;
  readonly last?: boolean;
}) {
  const { palette } = useTheme();
  const sc = useStickerColours();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        minHeight: 44,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: palette.hairline,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: tile,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ArtIcon name={icon} size={26} color={iconColour ?? sc.tileIcon} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="rowTitle">{title}</Txt>
        <Txt variant="rowSubtitle" multiline color={palette.secondary} style={{ marginTop: 2 }}>
          {sub}
        </Txt>
      </View>
      {trailing}
    </View>
  );
}

/** The small round-ended buttons of the export list. */
export function Pill({
  label,
  kind,
  onPress,
  disabled = false,
}: {
  readonly label: string;
  readonly kind: 'ink' | 'outline';
  readonly onPress: () => void;
  readonly disabled?: boolean;
}) {
  const { palette } = useTheme();
  const ink = kind === 'ink';
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      radius={16}
      accessibilityLabel={label}
      style={{
        height: ink ? 30 : 32,
        paddingHorizontal: 13,
        borderRadius: 16,
        justifyContent: 'center',
        backgroundColor: ink ? palette.primary.bg : palette.card,
        borderWidth: 1,
        borderColor: ink ? palette.primary.bg : palette.chip.border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Txt variant="chip" medium color={ink ? palette.primary.fg : palette.text}>
        {label}
      </Txt>
    </Press>
  );
}
