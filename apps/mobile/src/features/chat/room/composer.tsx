import { fontFor, motion } from '@kithfield/theme';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  TextInput,
  View,
  type TextInputInstance,
  type TextInputSelectionChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useDataClient } from '../../../data';
import { ArtIcon } from '../../../ui/art/art-view';
import { Avatar } from '../../../ui/art/avatar';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { componentType } from '../../../ui/type/styles';
import { Txt } from '../../../ui/type/text';
import {
  draftSegments,
  insertMention,
  mentionQuery,
  rankMentions,
  type Mentionable,
} from '../model/mentions';
import { type lookOf } from '../model/people';
import type { BubbleItem } from '../model/timeline';
import { go } from '../routes';
import { useChatColours } from '../ui/chat-colours';
import { useRoom } from './room-context';

/** A member in the @ list: their critter and how they are (lamp on, napping, dozing). */
export interface MentionRow extends Mentionable {
  readonly species: string;
  readonly look: ReturnType<typeof lookOf> | null;
  readonly how: string;
}

const TYPING_EVERY_MS = 3000;
const TYPING_IDLE_MS = 5000;

/** Tells the farm this person is writing, at most every few seconds, and stops when idle. */
function useTypingSignal(farm: string) {
  const client = useDataClient();
  const last = useRef(0);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
      client.typing(farm, false);
    },
    [client, farm],
  );
  return useMemo(
    () => ({
      wrote(empty: boolean) {
        if (idle.current) clearTimeout(idle.current);
        if (empty) {
          last.current = 0;
          client.typing(farm, false);
          return;
        }
        const now = Date.now();
        if (now - last.current > TYPING_EVERY_MS) {
          last.current = now;
          client.typing(farm, true);
        }
        idle.current = setTimeout(() => {
          last.current = 0;
          client.typing(farm, false);
        }, TYPING_IDLE_MS);
      },
    }),
    [client, farm],
  );
}

function MentionList({
  rows,
  onPick,
}: {
  readonly rows: readonly MentionRow[];
  readonly onPick: (row: Mentionable) => void;
}) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  const { visit } = useRoom();
  const reduce = useReduceMotion();
  const grown = useSharedValue(0);
  useEffect(() => {
    grown.set(withTiming(1, { duration: 160, easing: Easing.bezier(...motion.fade.bezier) }));
  }, [grown]);
  const style = useAnimatedStyle(() => ({
    opacity: grown.get(),
    transform: [
      { scale: reduce ? 1 : 0.96 + 0.04 * grown.get() },
      { translateY: reduce ? 0 : 6 * (1 - grown.get()) },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          borderRadius: 20,
          backgroundColor: palette.appearance === 'day' ? 'rgba(251,247,240,.97)' : palette.sheet,
          boxShadow: palette.trayShadow,
          padding: 6,
          marginHorizontal: 2,
          transformOrigin: 'bottom left',
        },
        style,
      ]}
    >
      <Txt
        variant="bubbleName"
        color={palette.secondary}
        style={{ paddingTop: 6, paddingHorizontal: 10, paddingBottom: 4 }}
      >
        {visit ? t('chat.mention.onThisPorch') : t('chat.mention.onThisFarm')}
      </Txt>
      {rows.slice(0, 5).map((row, i) => (
        <Press
          key={row.person}
          onPress={() => onPick(row)}
          haptic="select"
          radius={14}
          accessibilityLabel={`${row.name}, ${row.how}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 14,
            backgroundColor: i === 0 ? colours.mentionBg : 'transparent',
          }}
        >
          <Avatar kind={row.species} {...(row.look ? { look: row.look } : {})} size={32} />
          <Txt variant="rowTitle" style={{ fontSize: 15, lineHeight: 18 }}>
            {row.name}
          </Txt>
          <Txt variant="caption" color={palette.secondary} style={{ fontSize: 13, lineHeight: 16 }}>
            {row.how}
          </Txt>
        </Press>
      ))}
    </Animated.View>
  );
}

/** The chip over the field while replying or editing (04-08). */
function ContextChip({
  title,
  quote,
  closeLabel,
  onClose,
}: {
  readonly title: string;
  readonly quote: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
}) {
  const { palette } = useTheme();
  const colours = useChatColours();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: colours.replyBg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
      }}
    >
      <ArtIcon name="reply" size={18} color={colours.replyInk} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bubbleName" color={colours.replyInk}>
          {title}
        </Txt>
        <Txt
          variant="caption"
          color={palette.secondary}
          numberOfLines={1}
          style={{ fontSize: 13, lineHeight: 16.9 }}
        >
          {quote}
        </Txt>
      </View>
      <Press onPress={onClose} darken={false} hitSlop={14} accessibilityLabel={closeLabel}>
        <Txt variant="body" color={palette.placeholder} style={{ fontSize: 16, lineHeight: 16 }}>
          ✕
        </Txt>
      </Press>
    </View>
  );
}

export interface ComposerProps {
  readonly members: readonly MentionRow[];
  readonly replyTo: BubbleItem | null;
  readonly editing: BubbleItem | null;
  readonly onCancel: () => void;
  readonly onSend: (text: string) => void;
  readonly onDewdrop: () => void;
  /** The hold-to-record mic, shown while the field is empty. */
  readonly mic: ReactNode;
  readonly disabled?: boolean;
}

const quoteOf = (item: BubbleItem) =>
  item.body.kind === 'message' || item.body.kind === 'quiet_note' ? item.body.text : '';

/** The field at the bottom of a chat: +, the words with their mentions, a dewdrop, then mic or send. */
export function Composer({
  members,
  replyTo,
  editing,
  onCancel,
  onSend,
  onDewdrop,
  mic,
  disabled = false,
}: ComposerProps) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t, fontLocale } = useLocale();
  const room = useRoom();
  const typing = useTypingSignal(room.farm);
  const input = useRef<TextInputInstance>(null);
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);

  // Editing starts from the message's own words.
  useEffect(() => {
    if (!editing) return;
    const words = quoteOf(editing);
    setText(words);
    setCaret(words.length);
    input.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  const query = focused ? mentionQuery(text, caret) : null;
  const matches = query ? (rankMentions(members, query.query, room.me) as MentionRow[]) : [];
  const names = members.map((m) => m.name);
  const empty = text.trim() === '';
  const font = fontFor(componentType.fieldText, fontLocale, { multiline: true });

  const change = (next: string) => {
    setText(next);
    if (!editing) typing.wrote(next.trim() === '');
  };
  const pick = (row: Mentionable) => {
    if (!query) return;
    const next = insertMention(text, query.start, caret, row.name);
    setText(next.text);
    setCaret(next.caret);
    setTimeout(() => input.current?.setSelection(next.caret, next.caret), 0);
  };
  const send = () => {
    if (empty || disabled) return;
    onSend(text.trim());
    setText('');
    setCaret(0);
    typing.wrote(true);
  };
  const onSelection = (e: TextInputSelectionChangeEvent) => setCaret(e.nativeEvent.selection.end);

  return (
    <View style={{ gap: 8 }}>
      {matches.length > 0 ? <MentionList rows={matches} onPick={pick} /> : null}
      {editing ? (
        <ContextChip
          title={t('chat.composer.editing')}
          quote={quoteOf(editing)}
          closeLabel={t('chat.composer.cancelEdit')}
          onClose={() => {
            setText('');
            onCancel();
          }}
        />
      ) : replyTo ? (
        <ContextChip
          title={t('chat.composer.replying', { name: room.nameOf(replyTo.actor) })}
          quote={quoteOf(replyTo) || t('chat.bubble.original')}
          closeLabel={t('chat.composer.cancelReply')}
          onClose={onCancel}
        />
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <Press
          onPress={() => go.tray(room.farm)}
          radius={22}
          accessibilityLabel={t('chat.composer.tray')}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: palette.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArtIcon name="plus" size={20} color={palette.text} />
        </Press>
        <View
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 22,
            backgroundColor: palette.card,
            borderWidth: focused || !empty ? 1.5 : 1,
            borderColor: focused || !empty ? colours.fieldFocus : colours.fieldBorder,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 16,
            paddingRight: 6,
            gap: 6,
          }}
        >
          <TextInput
            ref={input}
            testID="chat-composer-field"
            multiline
            onChangeText={change}
            onSelectionChange={onSelection}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t('chat.composer.placeholder')}
            placeholderTextColor={palette.placeholder}
            selectionColor={palette.go.bg}
            editable={!disabled}
            accessibilityLabel={t('chat.composer.placeholder')}
            style={[
              font,
              { flex: 1, color: palette.text, paddingTop: 10, paddingBottom: 10, maxHeight: 132 },
            ]}
          >
            {draftSegments(text, names, caret).map((s, i) =>
              s.mention ? (
                <Txt
                  key={i}
                  variant="fieldText"
                  color={colours.mentionFg}
                  style={{ fontWeight: '600', backgroundColor: colours.mentionBg }}
                >
                  {s.text}
                </Txt>
              ) : (
                s.text
              ),
            )}
          </TextInput>
          {empty && !editing ? (
            <Press
              onPress={onDewdrop}
              haptic="soft"
              darken={false}
              hitSlop={8}
              accessibilityLabel={t('chat.composer.dewdrop')}
            >
              <ArtIcon name="dewdrop" size={28} color={palette.text} />
            </Press>
          ) : null}
        </View>
        {empty && !editing ? (
          mic
        ) : (
          <Press
            onPress={send}
            haptic="tap"
            radius={22}
            accessibilityLabel={editing ? t('chat.composer.saveEdit') : t('chat.composer.send')}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: palette.go.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Txt
              variant="body"
              color={palette.go.fg}
              style={{ fontSize: 20, lineHeight: 22, fontWeight: '700' }}
            >
              ↑
            </Txt>
          </Press>
        )}
      </View>
    </View>
  );
}
