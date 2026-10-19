import type { FarmState, StickerPayload } from '@kithfield/contracts';
import { day } from '@kithfield/theme';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { TextInput, View, type TextInputInstance } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { useDataClient } from '../../data';
import { useCollection } from '../../features/stickers/data';
import { lookOfSticker, offered } from '../../features/stickers/model/catalogue';
import {
  captionText,
  sceneOfSticker,
  type StickerPerson,
} from '../../features/stickers/model/look';
import { ownedPacks } from '../../features/stickers/model/owned';
import { StickerArt } from '../../features/stickers/ui/sticker';
import { useMe } from '../../features/stickers/ui/use-me';
import { ArtIcon } from '../../ui/art/art-view';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { platformLook } from '../look';
import { KeyCap } from './key-cap';
import { colonQuery, matchStickers, withoutQuery, type StickerOption } from './sticker-match';

const CELL = 120;

export interface DeskComposerHandle {
  focus(): void;
  /** Starts editing a message: its words go into the field. */
  edit(text: string): void;
}

/**
 * The desktop's composer: + for the gesture tray, the words, ⌘D for a dewdrop, and the mic.
 * Typing `:` and a word offers the stickers whose words match, in a row over the field
 * (← → choose, ↩ send, Esc closes); the row cross-fades as the word changes (120 ms). Return
 * sends (so the field needs no send button), Shift-Return starts a new line, ↑ in an empty field
 * edits your last message.
 */
export const DeskComposer = forwardRef<
  DeskComposerHandle,
  {
    readonly farm: string;
    readonly state: FarmState | null;
    readonly disabled: boolean;
    readonly mic: ReactNode;
    readonly onSend: (text: string) => void;
    readonly onDewdrop: () => void;
    readonly onTray: () => void;
    readonly onEditLast: () => void;
    readonly onTyping: (empty: boolean) => void;
  }
>(function DeskComposer(props, ref) {
  const { farm, state, disabled, mic, onSend, onDewdrop, onTray, onEditLast, onTyping } = props;
  const { t } = useLocale();
  const { palette } = useTheme();
  const toast = useToast();
  const reduce = useReduceMotion();
  const client = useDataClient();
  const me = useMe();
  const { collection } = useCollection();
  const input = useRef<TextInputInstance>(null);
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [chosen, setChosen] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    edit: (words) => {
      setText(words);
      setCaret(words.length);
      input.current?.focus();
    },
  }));

  const sender: StickerPerson | null = useMemo(() => {
    const member = state?.members.find((m) => m.person === me.person);
    if (member) return { name: member.name, critter: member.critter };
    return me.critter ? { name: me.name, critter: me.critter } : null;
  }, [state, me.person, me.name, me.critter]);

  // Your own pack first, then the packs you own, each sticker with its words as you'd read them.
  const options = useMemo<StickerOption[]>(() => {
    const packs = ownedPacks(collection);
    const all = packs.length > 0 ? packs.map((p) => p.pack) : [];
    return all.flatMap((pack) =>
      offered(pack).map((s) => ({
        pack: pack.id,
        sticker: s.id,
        words: captionText(t, lookOfSticker({ pack: pack.id, sticker: s.id }).caption, {
          people: [sender?.name ?? null],
          replyTo: null,
        }),
      })),
    );
  }, [collection, sender?.name, t]);

  const query = colonQuery(text, caret);
  const open = query !== null && dismissed !== query.start;
  const matches = open ? matchStickers(options, query.query) : [];
  const pick = Math.min(chosen, Math.max(0, matches.length - 1));
  const empty = text.trim() === '';

  const change = (next: string) => {
    setText(next);
    setChosen(0);
    onTyping(next.trim() === '');
  };
  const send = () => {
    if (empty || disabled) return;
    onSend(text.trim());
    setText('');
    setCaret(0);
    onTyping(true);
  };
  const sendSticker = (option: StickerOption) => {
    if (!query) return;
    const payload: StickerPayload = { pack: option.pack, sticker: option.sticker };
    void client.send(farm, 'sticker', payload).then((result) => {
      if (result.status !== 'queued') toast.show(t('stickers.picker.refused'));
    });
    const rest = withoutQuery(text, query.start, caret);
    setText(rest.trim() === '' ? '' : rest);
    setCaret(query.start);
    setChosen(0);
  };

  const onKey = (e: {
    nativeEvent: { key: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number };
    preventDefault: () => void;
  }) => {
    const { key, shiftKey, isComposing, keyCode } = e.nativeEvent;
    // Keys while an input method composes (Vietnamese Telex, say) are its own: Return commits.
    if (isComposing || keyCode === 229) return;
    if (open && matches.length > 0) {
      if (key === 'ArrowRight' || key === 'ArrowLeft') {
        e.preventDefault();
        const step = key === 'ArrowRight' ? 1 : -1;
        setChosen((pick + step + matches.length) % matches.length);
        return;
      }
      if (key === 'Enter' && !shiftKey) {
        e.preventDefault();
        const option = matches[pick];
        if (option) sendSticker(option);
        return;
      }
    }
    if (open && key === 'Escape' && query) {
      e.preventDefault();
      setDismissed(query.start);
      return;
    }
    if (key === 'Enter' && !shiftKey) {
      e.preventDefault();
      send();
      return;
    }
    if (key === 'ArrowUp' && text === '') {
      e.preventDefault();
      onEditLast();
    }
  };

  return (
    <View style={{ paddingTop: 12, paddingHorizontal: 18, paddingBottom: 16, gap: 10 }}>
      {open && query ? (
        <Animated.View
          {...(reduce
            ? {}
            : {
                entering: FadeIn.duration(platformLook.quickFadeMs),
                exiting: FadeOut.duration(platformLook.quickFadeMs),
                layout: LinearTransition.duration(platformLook.quickFadeMs),
              })}
          style={{
            borderRadius: 22,
            backgroundColor: palette.card,
            boxShadow: '0 12px 30px -12px rgba(42,34,29,0.35)',
            padding: 14,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt variant="rowTitle" color={palette.secondary} style={{ fontSize: 14 }}>
              {t('platforms.stickers.matching')}
            </Txt>
            <Txt variant="rowTitle" style={{ fontSize: 14 }}>
              {`:${query.query}`}
            </Txt>
            <View
              style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <KeyCap keys="←" />
              <KeyCap keys="→" />
              <Txt variant="caption" color={palette.secondary}>
                {t('platforms.stickers.choose')}
              </Txt>
              <KeyCap keys="↩" />
              <Txt variant="caption" color={palette.secondary}>
                {t('platforms.stickers.send')}
              </Txt>
            </View>
          </View>
          {matches.length === 0 ? (
            <Txt variant="caption" color={palette.secondary}>
              {t('platforms.stickers.none')}
            </Txt>
          ) : (
            <Animated.View
              key={query.query}
              {...(reduce ? {} : { entering: FadeIn.duration(platformLook.quickFadeMs) })}
              style={{ flexDirection: 'row', gap: 4 }}
            >
              {matches.map((option, i) => (
                <Press
                  key={`${option.pack}/${option.sticker}`}
                  onPress={() => sendSticker(option)}
                  radius={16}
                  accessibilityLabel={option.words}
                  style={{
                    width: CELL,
                    height: CELL,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: i === pick ? day.moss : 'transparent',
                    backgroundColor: i === pick ? day.mossTint : 'transparent',
                  }}
                >
                  <StickerArt
                    attrs={sceneOfSticker(t, option, sender, () => null)}
                    size={CELL - 20}
                    still={i !== pick}
                  />
                </Press>
              ))}
            </Animated.View>
          )}
        </Animated.View>
      ) : null}
      <View
        style={{
          minHeight: 46,
          borderRadius: 23,
          backgroundColor: palette.card,
          borderWidth: open ? 2 : 1,
          borderColor: open ? day.moss : palette.cardBorder,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingLeft: open ? 13 : 14,
          paddingRight: open ? 7 : 8,
        }}
      >
        <Press onPress={onTray} radius={14} accessibilityLabel={t('chat.composer.tray')}>
          <ArtIcon name="plus" size={18} color={palette.text} />
        </Press>
        <TextInput
          ref={input}
          value={text}
          multiline
          numberOfLines={1}
          editable={!disabled}
          onChangeText={change}
          onSelectionChange={(e) => setCaret(e.nativeEvent.selection.end)}
          onKeyPress={onKey}
          placeholder={t('platforms.composer.placeholder')}
          placeholderTextColor={palette.placeholder}
          accessibilityLabel={t('platforms.composer.placeholder')}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14.5,
            lineHeight: 20,
            paddingVertical: 12,
            maxHeight: 132,
            color: palette.text,
            outlineWidth: 0,
          }}
        />
        <KeyCap keys="⌘D" />
        <Press onPress={onDewdrop} radius={16} accessibilityLabel={t('chat.composer.dewdrop')}>
          <ArtIcon name="dewdrop" size={26} color={palette.text} />
        </Press>
        {mic}
      </View>
    </View>
  );
});
