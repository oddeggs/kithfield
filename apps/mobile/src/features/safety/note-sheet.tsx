import type { SafetyNote } from '@kithfield/contracts';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence } from 'react-native-reanimated';

import { ArtIcon } from '../../ui/art/art-view';
import { Avatar } from '../../ui/art/avatar';
import { Button } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { fadeTo } from '../../ui/motion/motion';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { useSafetyApi } from '../settings/api/use-api';
import { lookOf } from '../settings/format';
import { useKitColors } from '../settings/kit/colors';
import { SheetPage } from '../settings/kit/sheet-page';
import { KText } from '../settings/kit/text';
import { SAFETY_EMAIL } from '../settings/links';
import { useRemote } from '../settings/use-remote';
import { useRemoteGate } from '../settings/kit/remote-state';
import { useSomeone } from './member';
import { ruleKey } from './rules';
import { swap } from '../settings/go';

type Answered = Extract<SafetyNote, { note: 'report_answered' }>;
type Removed = Extract<SafetyNote, { note: 'content_removed' }>;
type Appealed = Extract<SafetyNote, { note: 'appeal_answered' }>;

function useDay() {
  const { language } = useLocale();
  return (at: number) =>
    new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'long' }).format(at);
}

function Point({
  icon,
  title,
  text,
}: {
  readonly icon: string;
  readonly title: string;
  readonly text: string;
}) {
  const kit = useKitColors();
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          backgroundColor: kit.settingsTile,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ArtIcon name={icon} size={22} color="" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <KText kind="rowTitle" style={{ fontSize: 14.5, lineHeight: 18.1 }}>
          {title}
        </KText>
        <KText kind="card" multiline color={kit.body2} style={{ marginTop: 2, lineHeight: 18.9 }}>
          {text}
        </KText>
      </View>
    </View>
  );
}

/** The lantern glows once as the note appears (600 ms), then rests. */
function Lantern() {
  const kit = useKitColors();
  const reduce = useReduceMotion();
  const glow = useSharedValue(0);
  useEffect(() => {
    if (!reduce) glow.set(withSequence(fadeTo(1), fadeTo(0.35)));
  }, [glow, reduce]);
  const halo = useAnimatedStyle(() => ({ opacity: glow.get() }));
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: 64 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: kit.lanternGlow,
          },
          halo,
        ]}
      />
      <ArtIcon name="lantern" size={64} color="" />
    </View>
  );
}

/** The reporter hears back: what happened to what they reported, never the sanction. */
function AnsweredBody({ note }: { readonly note: Answered }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const day = useDay();
  const someone = useSomeone(note.farm, note.about);
  const name = someone.name ?? t('safety.friend');
  const what =
    note.eventAt === null
      ? t('safety.answered.person', { name })
      : note.kind === 'message'
        ? t('safety.answered.message', { name, day: day(note.eventAt) })
        : t('safety.answered.thing', { name, day: day(note.eventAt) });
  const removed = note.outcome === 'removed';
  return (
    <SheetPage
      footer={
        <>
          <Button label={t('safety.answered.thanks')} onPress={() => router.back()} />
          {note.about ? (
            <Button
              label={t('safety.answered.block', { name })}
              kind="text"
              onPress={() =>
                swap({
                  pathname: '/(modal)/safety-block',
                  params: { person: note.about ?? '', farm: note.farm },
                })
              }
            />
          ) : null}
        </>
      }
    >
      <Lantern />
      <Txt variant="handS" color={kit.link} align="center" style={{ fontSize: 17, lineHeight: 17 }}>
        {t('safety.answered.eyebrow')}
      </Txt>
      <Txt
        variant="displayM"
        multiline
        align="center"
        accessibilityRole="header"
        style={{ lineHeight: 29.1 }}
      >
        {t('safety.answered.title')}
      </Txt>
      <View
        style={{
          borderRadius: 18,
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.cardBorder,
          paddingVertical: 12,
          paddingHorizontal: 14,
          flexDirection: 'row',
          gap: 10,
          alignItems: 'center',
        }}
      >
        {someone.critter ? (
          <View style={{ opacity: 0.6 }}>
            <Avatar kind={someone.critter.species} look={lookOf(someone.critter)} size={34} />
          </View>
        ) : null}
        <KText
          kind="card"
          multiline
          color={palette.secondary}
          style={{ flex: 1, fontSize: 14, lineHeight: 18.9 }}
        >
          <KText
            kind="card"
            color={palette.secondary}
            style={
              removed ? { textDecorationLine: 'line-through', fontSize: 14 } : { fontSize: 14 }
            }
          >
            {what}
          </KText>
          {` · ${removed ? t('safety.answered.removed') : t('safety.answered.kept')}`}
        </KText>
      </View>
      <KText kind="sheetBody" multiline color={palette.creditText} style={{ lineHeight: 22.5 }}>
        {removed ? t('safety.answered.removedBody') : t('safety.answered.keptBody')}
      </KText>
      <UnsafeLine text={t('safety.answered.unsafe', { email: SAFETY_EMAIL })} />
    </SheetPage>
  );
}

/**
 * "Still feel unsafe?" with the safety address as a link VoiceOver finds (and a tap writes to),
 * drawn as the design draws it.
 */
function UnsafeLine({ text }: { readonly text: string }) {
  const { palette } = useTheme();
  const at = text.indexOf(SAFETY_EMAIL);
  const write = () => void Linking.openURL(`mailto:${SAFETY_EMAIL}`);
  if (at < 0) {
    return (
      <KText kind="card" multiline color={palette.secondary}>
        {text}
      </KText>
    );
  }
  return (
    <KText kind="card" multiline color={palette.secondary}>
      {text.slice(0, at)}
      <KText kind="card" color={palette.secondary} onPress={write} accessibilityRole="link">
        {SAFETY_EMAIL}
      </KText>
      {text.slice(at + SAFETY_EMAIL.length)}
    </KText>
  );
}

/** The reported person: which rule, what it means for the account, and another look. */
function RemovedBody({ note }: { readonly note: Removed }) {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const day = useDay();
  const [shown, setShown] = useState(false);
  const when = note.eventAt ?? note.at;
  const where = note.farmName
    ? t('safety.removedNote.where', { farm: note.farmName, day: day(when) })
    : t('safety.removedNote.visit', { day: day(when) });
  const until = note.pausedUntil
    ? new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
        day: 'numeric',
        month: 'long',
      }).format(note.pausedUntil)
    : '';
  const account = {
    unchanged: t('safety.removedNote.unchanged'),
    warned: t('safety.removedNote.warned'),
    paused: t('safety.removedNote.paused', { day: until }),
    removed_from_farm: t('safety.removedNote.removed', { farm: note.farmName ?? '' }),
  }[note.account];
  const rule = ruleKey(note.rule);
  return (
    <SheetPage
      footer={
        <>
          {note.appealable ? (
            <Button
              label={t('safety.removedNote.appeal')}
              onPress={() =>
                swap({ pathname: '/(modal)/safety-appeal', params: { action: note.action } })
              }
            />
          ) : null}
          <Button
            label={t('safety.removedNote.okay')}
            kind={note.appealable ? 'text' : 'primary'}
            onPress={() => router.back()}
          />
        </>
      }
    >
      <Txt variant="handS" color={kit.honeyNote.icon} style={{ fontSize: 17, lineHeight: 17 }}>
        {t('safety.removedNote.eyebrow')}
      </Txt>
      <Txt variant="displayM" multiline accessibilityRole="header" style={{ lineHeight: 29.1 }}>
        {note.kind === 'message' ? t('safety.removedNote.message') : t('safety.removedNote.thing')}
      </Txt>
      <View
        style={{
          borderRadius: 18,
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.cardBorder,
          paddingVertical: 12,
          paddingHorizontal: 14,
          gap: 6,
        }}
      >
        <KText kind="label" color={kit.settingsLabel} style={{ letterSpacing: 0.48 }}>
          {where}
        </KText>
        {note.excerpt ? (
          <Press
            onPress={() => setShown(true)}
            darken={false}
            accessibilityRole="button"
            accessibilityLabel={shown ? note.excerpt : t('safety.removedNote.show')}
          >
            <View style={{ borderRadius: 6, overflow: 'hidden' }}>
              <KText
                kind="card"
                multiline
                color={kit.body2}
                style={{ fontSize: 14.5, lineHeight: 20.3 }}
              >
                {note.excerpt}
              </KText>
              {shown ? null : (
                <BlurView
                  intensity={18}
                  tint={palette.appearance === 'night' ? 'dark' : 'light'}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
              )}
            </View>
          </Press>
        ) : null}
        <KText kind="settingSub" color={palette.secondary}>
          {t('safety.removedNote.hidden')}
        </KText>
      </View>
      <Point
        icon="note"
        title={t('safety.removedNote.rule')}
        text={rule.key === null ? t('safety.rule.number', { n: rule.n }) : t(rule.key)}
      />
      <Point icon="check" title={t('safety.removedNote.account')} text={account} />
      {note.appealable ? (
        <KText kind="card" multiline color={kit.body2} style={{ fontSize: 14, lineHeight: 20.3 }}>
          {t('safety.removedNote.appealText')}
        </KText>
      ) : null}
    </SheetPage>
  );
}

/** An appeal's answer, written by someone who wasn't part of the first decision. */
function AppealedBody({ note }: { readonly note: Appealed }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  return (
    <SheetPage
      footer={<Button label={t('safety.removedNote.okay')} onPress={() => router.back()} />}
    >
      <Txt variant="handS" color={kit.honeyNote.icon} style={{ fontSize: 17, lineHeight: 17 }}>
        {t('safety.removedNote.eyebrow')}
      </Txt>
      <Txt variant="displayM" multiline accessibilityRole="header" style={{ lineHeight: 29.1 }}>
        {t('safety.appealed.title')}
      </Txt>
      <KText kind="sheetBody" multiline color={palette.creditText}>
        {note.outcome === 'undone' ? t('safety.appealed.undone') : t('safety.appealed.kept')}
      </KText>
      <KText kind="card" multiline color={kit.body2}>
        {note.reply}
      </KText>
    </SheetPage>
  );
}

/** One note from the safety team, as the sheet its kind calls for. */
export function NoteSheet({ id }: { readonly id: string }) {
  const api = useSafetyApi();
  const notes = useRemote(() => api.notes());
  const note = notes.data?.notes.find((n) => n.id === id) ?? null;
  const gate = useRemoteGate([notes]);
  if (note === null) return <SheetPage>{gate}</SheetPage>;
  switch (note.note) {
    case 'report_answered':
      return <AnsweredBody note={note} />;
    case 'content_removed':
      return <RemovedBody note={note} />;
    case 'appeal_answered':
      return <AppealedBody note={note} />;
  }
}
