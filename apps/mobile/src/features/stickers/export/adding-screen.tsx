import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useArt } from '../../../ui/art/art-provider';
import { ArtIcon, ArtStill } from '../../../ui/art/art-view';
import { sceneLook } from '../../../ui/art/critter-look';
import { Button } from '../../../ui/components/button';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { OWN } from '../model/catalogue';
import { sceneOfSticker } from '../model/look';
import { useStickerColours } from '../ui/colours';
import { leave, ScreenHeader } from '../ui/header';
import { useMe } from '../ui/use-me';
import { ownPack } from './pack';
import { bakeWhatsAppPack, openInWhatsApp, whatsappInstalled, type WhatsAppPack } from './whatsapp';

type PackState =
  | { readonly kind: 'packing'; readonly progress: number }
  | { readonly kind: 'ready' }
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
    if (stickers === null || critter === null) return;
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
            identifier: `kithfield_${me.person ?? 'me'}`
              .replace(/[^a-zA-Z0-9_.-]/g, '_')
              .slice(0, 128),
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
        if (stop || baked === null) return;
        pack.current = baked;
        setWhatsapp({ kind: 'ready' });
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

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title={t('stickers.adding.title')} glass={false} />
      <View style={{ position: 'absolute', top: insets.top + 45, left: 46 }}>
        <ArtStill
          scene="spot"
          width={300}
          height={180}
          attrs={{ name: 'done', ...(critter ? sceneLook(critter) : {}) }}
        />
      </View>
      <View style={{ position: 'absolute', top: insets.top + 237, left: 20, right: 20, gap: 12 }}>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
              <View style={{ flex: 1 }}>
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
                    height: 36,
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
                : t('stickers.adding.whatsapp', { set, count })}
            </Txt>
          </View>
        ))}
      </View>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom }}>
        <Button label={t('stickers.done')} kind="secondary" onPress={leave} />
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
    case 'soon':
      return t('stickers.adding.notYet');
  }
}
