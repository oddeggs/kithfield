import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useArt } from '../../../ui/art/art-provider';
import { ArtIcon, ArtStill } from '../../../ui/art/art-view';
import { sceneLook } from '../../../ui/art/critter-look';
import { Button } from '../../../ui/components/button';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../../ui/type/accessibility-size';
import { Txt } from '../../../ui/type/text';
import { OWN } from '../model/catalogue';
import { sceneOfSticker } from '../model/look';
import { useStickerColours } from '../ui/colours';
import { HEADER_BOTTOM, leave, ScreenHeader } from '../ui/header';
import { useMe } from '../ui/use-me';
import { ownPack } from './pack';
import { bakeWhatsAppPack, openInWhatsApp, whatsappInstalled, type WhatsAppPack } from './whatsapp';

type PackState =
  | { readonly kind: 'packing'; readonly progress: number }
  /** `dropped`: stickers left out for being over the other app's limit. */
  | { readonly kind: 'ready'; readonly dropped?: number }
  /** Too few stickers came in under the other app's limit to make a pack. */
  | { readonly kind: 'too_big' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed' }
  /** Telegram sets are made by Kithfield's bot, which isn't connected yet. */
  | { readonly kind: 'soon' };

/**
 * Packing your pack for Telegram and WhatsApp, on the phone, from the same drawings. Each card
 * says when its pack is ready; Open hands it to the other app, which asks you to confirm.
 */
export function AddingScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const sc = useStickerColours();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const ax = useAccessibilitySize();
  const store = useArt();
  const me = useMe();
  const critter = me.critter;
  const stickers = useMemo(
    () => (critter ? ownPack(t, { name: me.name, critter }) : null),
    [t, me.name, critter],
  );
  const [whatsapp, setWhatsapp] = useState<PackState>({ kind: 'packing', progress: 0 });
  const pack = useRef<WhatsAppPack | null>(null);
  const name = me.name ?? t('stickers.someone');
  const set = t('stickers.adding.setName', { name });

  useEffect(() => {
    const person = me.person;
    if (stickers === null || critter === null || person === null) return;
    let stop = false;
    void (async () => {
      if (!(await whatsappInstalled())) {
        if (!stop) setWhatsapp({ kind: 'missing' });
        return;
      }
      try {
        const baked = await bakeWhatsAppPack(
          store.art,
          {
            person,
            name: set,
            stickers,
            tray: sceneOfSticker(
              t,
              { pack: OWN, sticker: 'face' },
              { name: me.name, critter },
              () => null,
            ),
          },
          (done, total) =>
            !stop && setWhatsapp({ kind: 'packing', progress: total > 0 ? done / total : 0 }),
          () => stop,
        );
        if (stop || baked.status === 'cancelled') return;
        if (baked.status === 'too_few') {
          setWhatsapp({ kind: 'too_big' });
          return;
        }
        pack.current = baked.pack;
        setWhatsapp({ kind: 'ready', dropped: baked.pack.dropped.length });
      } catch {
        if (!stop) setWhatsapp({ kind: 'failed' });
      }
    })();
    return () => {
      stop = true;
    };
  }, [stickers, critter, store, me.person, me.name, set, t]);

  const telegram: PackState = { kind: 'soon' };
  const count = stickers?.length ?? 0;
  const packing = whatsapp.kind === 'packing';

  const cards: { id: 'telegram' | 'whatsapp'; state: PackState }[] = [
    { id: 'telegram', state: telegram },
    { id: 'whatsapp', state: whatsapp },
  ];

  // At the accessibility sizes the blocks the design places on the screen stack in one column
  // that scrolls, under the header.
  const at = (place: { top: number; left: number; right?: number }) =>
    ax ? { marginHorizontal: place.left } : ({ position: 'absolute', ...place } as const);
  const blocks = (
    <>
      <View style={at({ top: insets.top + 45, left: 46 })}>
        <ArtStill
          scene="spot"
          width={300}
          height={180}
          attrs={{ name: 'done', ...(critter ? sceneLook(critter) : {}) }}
        />
      </View>
      <View style={[at({ top: insets.top + 237, left: 20, right: 20 }), { gap: 12 }]}>
        <Txt
          variant="displayM"
          multiline
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
        >
          {packing ? t('stickers.adding.packing', { name }) : t('stickers.adding.ready', { name })}
        </Txt>
        <Txt variant="body" multiline color={palette.body}>
          {packing ? t('stickers.adding.packingLead') : t('stickers.adding.lead')}
        </Txt>
        {cards.map((c) => (
          <View
            key={c.id}
            style={{
              borderRadius: 22,
              backgroundColor: palette.card,
              borderWidth: 1,
              borderColor: palette.cardBorder,
              padding: 14,
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                ...(ax ? { flexWrap: 'wrap' } : {}),
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 11,
                  backgroundColor: c.id === 'telegram' ? sc.telegramTile : sc.whatsappTile,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ArtIcon name="share" size={22} color={sc.tileIcon} />
              </View>
              <View style={ax ? { flexGrow: 1, flexBasis: 160 } : { flex: 1 }}>
                <Txt variant="rowTitle">
                  {c.id === 'telegram'
                    ? t('stickers.export.telegram')
                    : t('stickers.export.whatsapp')}
                </Txt>
                <Txt
                  variant="caption"
                  medium
                  color={c.state.kind === 'ready' ? sc.ready : palette.secondary}
                >
                  {stateWords(t, c.state)}
                </Txt>
              </View>
              {c.state.kind === 'ready' ? (
                <Press
                  onPress={() => {
                    if (c.id === 'whatsapp' && pack.current) {
                      void openInWhatsApp(pack.current).then((ok) => {
                        if (!ok) toast.show(t('stickers.adding.failed'));
                      });
                    }
                  }}
                  radius={18}
                  accessibilityLabel={`${t('stickers.adding.open')} ${c.id === 'telegram' ? t('stickers.export.telegram') : t('stickers.export.whatsapp')}`}
                  style={{
                    minHeight: 36,
                    borderRadius: 18,
                    paddingHorizontal: 14,
                    justifyContent: 'center',
                    backgroundColor: palette.primary.bg,
                  }}
                >
                  <Txt variant="buttonSmall" color={palette.primary.fg}>
                    {t('stickers.adding.open')}
                  </Txt>
                </Press>
              ) : null}
            </View>
            <Txt variant="notice" multiline color={sc.noteText}>
              {c.id === 'telegram'
                ? t('stickers.adding.telegram', { set, count })
                : t('stickers.adding.whatsapp', {
                    set,
                    count: pack.current?.stickers ?? count,
                  })}
              {c.id === 'whatsapp' && c.state.kind === 'ready' && c.state.dropped
                ? ` ${t('stickers.adding.dropped', { count: c.state.dropped })}`
                : ''}
            </Txt>
          </View>
        ))}
      </View>
    </>
  );
  const done = <Button label={t('stickers.done')} kind="secondary" onPress={leave} />;
  if (ax) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <ScreenHeader title={t('stickers.adding.title')} glass={false} />
        <ScrollView
          // Below the header, so nothing scrolls under its back button.
          style={{ marginTop: insets.top + HEADER_BOTTOM }}
          contentContainerStyle={{
            paddingTop: 45 - HEADER_BOTTOM,
            paddingBottom: insets.bottom + 16,
            gap: 12,
          }}
        >
          {blocks}
          <View style={{ marginHorizontal: 24 }}>{done}</View>
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title={t('stickers.adding.title')} glass={false} />
      {blocks}
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom }}>
        {done}
      </View>
    </View>
  );
}

function stateWords(t: ReturnType<typeof useLocale>['t'], state: PackState): string {
  switch (state.kind) {
    case 'packing':
      return t('stickers.adding.packMaking');
    case 'ready':
      return t('stickers.adding.packReady');
    case 'missing':
      return t('stickers.adding.notInstalled');
    case 'failed':
      return t('stickers.adding.failed');
    case 'too_big':
      return t('stickers.adding.tooBig');
    case 'soon':
      return t('stickers.adding.notYet');
  }
}
