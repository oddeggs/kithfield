import type { Critter, LanguageTag } from '@kithfield/contracts';
import { night } from '@kithfield/theme';
import { useEffect } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Avatar } from '../../ui/art/avatar';
import { lookOf } from '../../ui/art/critter-look';
import { Toggle } from '../../ui/components/toggle';
import { useLocale } from '../../ui/locale/locale-provider';
import { fadeTo, sheetTo } from '../../ui/motion/motion';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { Txt } from '../../ui/type/text';
import type { CaptionRow } from './caption-lines';
import { FireButton } from './fire-chrome';
import { fireLook } from './look';

/*
 * Live captions by the fire (a patron perk): words appear as friends who said yes talk, in your
 * language if you like, only on your phone, and they're gone when the fire goes out. A friend who
 * said no shows as a quiet "…".
 */

/** The languages captions are read in. */
export const CAPTION_LANGS = ['en', 'vi'] as const satisfies readonly LanguageTag[];

const langKey = (lang: string) =>
  lang === 'vi' ? 'fire.captions.lang.vi' : 'fire.captions.lang.en';

/** The captions card under the header (16-10). */
export function CaptionsCard({
  rows,
  lang,
  original,
  whoIs,
  top,
  onSettings,
}: {
  readonly rows: readonly CaptionRow[];
  readonly lang: LanguageTag;
  readonly original: boolean;
  readonly whoIs: (id: string) => { readonly name: string; readonly critter: Critter | null };
  readonly top: number;
  readonly onSettings: () => void;
}) {
  const { t } = useLocale();
  const said = rows.find((r) => r.kind === 'line' && r.line.said !== lang);
  const from = said?.kind === 'line' ? said.line.said : null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: 10,
        right: 10,
        top,
        borderRadius: 30,
        backgroundColor: 'rgba(20,22,42,.8)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,.1)',
        paddingTop: 14,
        paddingHorizontal: 16,
        paddingBottom: 16,
        gap: 12,
        zIndex: 11,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <PlusBadge />
        <Txt
          variant="caption"
          color={fireLook.sub}
          style={{ fontSize: 12.5, lineHeight: 14, fontWeight: '600' }}
        >
          {t('fire.captions.title')}
        </Txt>
        {from !== null ? (
          <>
            <Txt variant="caption" color={night.dim} style={{ fontSize: 12.5, lineHeight: 14 }}>
              ·
            </Txt>
            <Txt
              variant="caption"
              color={fireLook.sub}
              numberOfLines={1}
              style={{ fontSize: 12.5, lineHeight: 14, fontWeight: '600', flexShrink: 1 }}
            >
              {t('fire.captions.pair', { from: t(langKey(from)), to: t(langKey(lang)) })}
            </Txt>
          </>
        ) : null}
        <Press
          onPress={onSettings}
          darken={false}
          accessibilityRole="button"
          accessibilityLabel={t('fire.captions.settings')}
          style={{ marginLeft: 'auto' }}
        >
          <Txt
            variant="caption"
            color={fireLook.eyebrow}
            style={{ fontSize: 12.5, lineHeight: 14, fontWeight: '600' }}
          >
            {t('fire.captions.settings')}
          </Txt>
        </Press>
      </View>
      {rows.length === 0 ? (
        <Txt variant="caption" color={night.dim} style={{ fontSize: 14, lineHeight: 19 }}>
          {t('fire.captions.waiting')}
        </Txt>
      ) : (
        rows.map((row, i) => {
          const latest = i === rows.length - 1;
          const speaker = row.kind === 'line' ? row.line.speaker : row.speaker;
          const who = whoIs(speaker);
          const text =
            row.kind === 'line'
              ? (row.line.translation?.text ?? row.line.text)
              : t('fire.captions.withheld');
          const originalText = row.kind === 'line' && row.line.translation ? row.line.text : null;
          return (
            <View
              key={`${speaker}:${row.kind === 'line' ? row.line.chunk : 'w'}`}
              style={{
                flexDirection: 'row',
                gap: 10,
                alignItems: 'flex-start',
                opacity: latest ? 1 : 0.78,
              }}
            >
              {who.critter ? (
                <Avatar
                  kind={who.critter.species}
                  look={lookOf(who.critter)}
                  size={28}
                  style={{ marginTop: 2 }}
                />
              ) : (
                <View style={{ width: 28 }} />
              )}
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Txt
                  variant="caption"
                  color={fireLook.sub}
                  style={{ fontSize: 12.5, lineHeight: 14, fontWeight: '600' }}
                >
                  {who.name}
                </Txt>
                <Txt
                  variant="body"
                  color={fireLook.text}
                  multiline
                  style={{ fontSize: 17, lineHeight: 23, fontWeight: latest ? '600' : '500' }}
                >
                  {text}
                </Txt>
                {original && originalText !== null ? (
                  <Txt
                    variant="caption"
                    color={night.dim}
                    multiline
                    style={{ fontSize: 14, lineHeight: 19 }}
                  >
                    {originalText}
                  </Txt>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

function PlusBadge() {
  const { t } = useLocale();
  return (
    <View
      style={{
        paddingVertical: 4,
        paddingHorizontal: 7,
        borderRadius: 7,
        backgroundColor: fireLook.primary,
      }}
    >
      <Txt
        variant="label"
        color={fireLook.primaryInk}
        style={{ fontSize: 10.5, lineHeight: 11, letterSpacing: 0.42 }}
      >
        {t('fire.captions.plus')}
      </Txt>
    </View>
  );
}

function Row({
  title,
  sub,
  right,
  last = false,
}: {
  readonly title: string;
  readonly sub?: string;
  readonly right: React.ReactNode;
  readonly last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: 'rgba(255,255,255,.08)',
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="rowTitle" color={fireLook.text} style={{ fontSize: 15.5, lineHeight: 19.4 }}>
          {title}
        </Txt>
        {sub ? (
          <Txt
            variant="caption"
            color={fireLook.sub}
            multiline
            style={{ fontSize: 13, lineHeight: 17.6, marginTop: 2 }}
          >
            {sub}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** "Hear it, read it": turning captions on, the language and the original (16-11). */
export function CaptionsSheet({
  open,
  perks,
  on,
  lang,
  original,
  onOn,
  onLang,
  onOriginal,
  onPlus,
  onClose,
}: {
  readonly open: boolean;
  /** Whether your patron perks are on; without them the sheet offers Plus. */
  readonly perks: boolean;
  readonly on: boolean;
  readonly lang: LanguageTag;
  readonly original: boolean;
  readonly onOn: (on: boolean) => void;
  readonly onLang: () => void;
  readonly onOriginal: (on: boolean) => void;
  readonly onPlus: () => void;
  readonly onClose: () => void;
}) {
  const { t } = useLocale();
  const reduce = useReduceMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(reduce ? fadeTo(open ? 1 : 0) : sheetTo(open ? 1 : 0, false));
  }, [open, reduce, shown]);
  const scrim = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, shown.get())) }));
  const sheet = useAnimatedStyle(() => ({
    opacity: reduce ? shown.get() : 1,
    transform: [{ translateY: reduce ? 0 : (1 - shown.get()) * 760 }],
  }));
  return (
    <View
      pointerEvents={open ? 'box-none' : 'none'}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(10,10,24,.4)',
          },
          scrim,
        ]}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={onClose}
          accessibilityLabel={t('fire.captions.notNow')}
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[
          {
            position: 'absolute',
            left: 8,
            right: 8,
            bottom: 8,
            top: 150,
            borderRadius: 44,
            backgroundColor: night.panel,
            boxShadow: '0 -10px 40px -16px rgba(0,0,0,.6)',
            paddingTop: 10,
            paddingHorizontal: 20,
          },
          sheet,
        ]}
      >
        <View
          style={{
            width: 36,
            height: 5,
            borderRadius: 3,
            backgroundColor: 'rgba(255,255,255,.3)',
            alignSelf: 'center',
          }}
        />
        <ScrollView
          contentContainerStyle={{ gap: 12, paddingTop: 12, paddingBottom: 30, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PlusBadge />
            <Txt variant="handL" color={fireLook.eyebrow} style={{ fontSize: 17, lineHeight: 17 }}>
              {t('fire.captions.sheetEyebrow')}
            </Txt>
          </View>
          <Txt
            variant="displayM"
            color={fireLook.text}
            accessibilityRole="header"
            style={{ fontSize: 26, lineHeight: 28.6 }}
          >
            {t('fire.captions.sheetTitle')}
          </Txt>
          <Txt
            variant="body"
            color={fireLook.sub}
            multiline
            style={{ fontSize: 14.5, lineHeight: 21 }}
          >
            {t('fire.captions.lead', { processor: t('fire.captions.processor') })}
          </Txt>
          <View
            style={{
              borderRadius: 22,
              backgroundColor: night.bubble,
              paddingVertical: 2,
              paddingHorizontal: 14,
            }}
          >
            <Row
              title={t('fire.captions.live')}
              sub={t('fire.captions.liveSub')}
              right={
                <Toggle
                  value={on}
                  onChange={onOn}
                  label={t('fire.captions.live')}
                  disabled={!perks}
                />
              }
            />
            <Press
              onPress={onLang}
              darken={false}
              disabled={!perks}
              accessibilityRole="button"
              accessibilityLabel={`${t('fire.captions.translate')}, ${t(langKey(lang))}`}
            >
              <Row
                title={t('fire.captions.translate')}
                sub={t('fire.captions.translateSub')}
                right={
                  <Txt variant="body" color={fireLook.sub} style={{ fontSize: 15, lineHeight: 18 }}>
                    {`${t(langKey(lang))} ›`}
                  </Txt>
                }
              />
            </Press>
            <Row
              title={t('fire.captions.original')}
              last
              right={
                <Toggle
                  value={original}
                  onChange={onOriginal}
                  label={t('fire.captions.original')}
                  disabled={!perks}
                />
              }
            />
          </View>
          <Txt
            variant="caption"
            color={night.dim}
            multiline
            style={{ fontSize: 12.5, lineHeight: 18 }}
          >
            {t('fire.captions.free')}
          </Txt>
          <View style={{ marginTop: 'auto', gap: 6 }}>
            {perks ? (
              <FireButton label={t('fire.captions.done')} onPress={onClose} height={56} />
            ) : (
              <FireButton label={t('fire.captions.turnOn')} onPress={onPlus} height={56} />
            )}
            {perks ? null : (
              <Press
                onPress={onClose}
                darken={false}
                accessibilityRole="button"
                accessibilityLabel={t('fire.captions.notNow')}
                style={{ height: 46, alignItems: 'center', justifyContent: 'center' }}
              >
                <Txt
                  variant="button"
                  color={fireLook.text}
                  style={{ fontSize: 16, lineHeight: 19 }}
                >
                  {t('fire.captions.notNow')}
                </Txt>
              </Press>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}
