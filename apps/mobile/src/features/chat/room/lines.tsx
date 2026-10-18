import type { PersonId } from '@kithfield/contracts';
import { useState } from 'react';
import { View } from 'react-native';

import { ArtIcon, ArtLoop } from '../../../ui/art/art-view';
import { Avatar } from '../../../ui/art/avatar';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { dayPartOf, dividerDay, hourOf } from '../model/format';
import { lookOf } from '../model/people';
import type { LineKind } from '../model/timeline';
import { go } from '../routes';
import { useChatColours } from '../ui/chat-colours';
import { useRoom } from './room-context';

/** "thursday, after dinner": a day's first message, in the hand face. */
export function DayDivider({ at, now }: { readonly at: number; readonly now: number }) {
  const colours = useChatColours();
  const { t, language } = useLocale();
  const { state } = useRoom();
  const zone = state?.timeZone ?? null;
  const day = dividerDay(at, now, language, zone);
  const named =
    day === 'today' ? t('chat.day.today') : day === 'yesterday' ? t('chat.day.yesterday') : day;
  const text = t(`chat.day.${dayPartOf(hourOf(at, zone))}`, { day: named });
  return (
    <Txt variant="handS" color={colours.hand} align="center" accessibilityRole="header">
      {text}
    </Txt>
  );
}

const LINE_ICON: Readonly<Record<LineKind, string>> = {
  firefly: 'firefly',
  wave: 'wave',
  hug: 'sparkle',
  knock: 'door',
  dewdrop: 'dewdrop',
  joined: 'door',
  left: 'leaf',
  plan: 'seed',
  slow_post: 'envelope',
};

/** A gesture or a coming and going, as one hand-written line with its icon (04-04). */
export function GestureLine({
  kind,
  actor,
  to,
  title,
  others = [],
}: {
  readonly kind: LineKind;
  readonly actor: PersonId | null;
  readonly to: PersonId | null;
  readonly title: string | null;
  /** Friends who moved in alongside. */
  readonly others?: readonly PersonId[];
}) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  const { me, nameOf } = useRoom();
  const name = nameOf(actor);
  const toName = nameOf(to);
  const text = (() => {
    switch (kind) {
      case 'firefly':
        return to === me
          ? t('chat.bubble.fireflyYou', { name })
          : t('chat.bubble.firefly', { name, to: toName });
      case 'wave':
        return to ? t('chat.bubble.waveTo', { name, to: toName }) : t('chat.bubble.wave', { name });
      case 'hug':
        return to ? t('chat.bubble.hug', { name, to: toName }) : t('chat.bubble.hugAll', { name });
      case 'knock':
        return t('chat.bubble.knock', { name, to: toName });
      case 'dewdrop':
        return `${name} · ${t('chat.what.dewdrop')}`;
      case 'joined': {
        if (others.length === 0) return t('chat.bubble.joined', { name });
        const names = [name, ...others.map((p) => nameOf(p))];
        const last = names.pop() ?? '';
        const list =
          names.length === 1
            ? t('chat.names.two', { a: names[0] ?? '', b: last })
            : t('chat.names.more', { list: names.join(', '), last });
        return t('chat.bubble.joinedMany', { names: list });
      }
      case 'left':
        return t('chat.bubble.left', { name });
      case 'plan':
        return t('chat.bubble.plan', { name, title: title ?? '' });
      case 'slow_post':
        return t('chat.bubble.slowPostSealed', { name: toName });
    }
  })();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <ArtIcon name={LINE_ICON[kind]} size={22} color={palette.text} />
      <Txt variant="handS" multiline color={colours.hand} style={{ lineHeight: 18, flexShrink: 1 }}>
        {text}
      </Txt>
    </View>
  );
  if (kind === 'plan') {
    return (
      <Press onPress={go.seedBed} darken={false} accessibilityLabel={text}>
        {content}
      </Press>
    );
  }
  return (
    <View accessible accessibilityLabel={text} style={{ paddingHorizontal: 20 }}>
      {content}
    </View>
  );
}

/** Where a message was unsent: a quiet gap, in italic (04-15). */
export function UnsentLine({
  actor,
  by,
}: {
  readonly actor: PersonId | null;
  readonly by: 'author' | 'safety';
}) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const { me, nameOf } = useRoom();
  const text =
    by === 'safety'
      ? t('chat.bubble.removed')
      : actor === me
        ? t('chat.bubble.unsentYou')
        : t('chat.bubble.unsentBy', { name: nameOf(actor) });
  return (
    <Txt
      variant="caption"
      align="center"
      color={palette.placeholder}
      style={{ fontSize: 13, lineHeight: 16.9, fontStyle: 'italic' }}
    >
      {text}
    </Txt>
  );
}

/** A friend back from a long nap, with a wave to welcome them (04-03). */
export function BackCard({ actor }: { readonly actor: PersonId }) {
  const colours = useChatColours();
  const { palette } = useTheme();
  const { t } = useLocale();
  const { people, nameOf, wave } = useRoom();
  const [waved, setWaved] = useState(false);
  const critter = people.get(actor)?.critter;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 18,
        backgroundColor: colours.backBg,
        marginHorizontal: 0,
      }}
    >
      {critter ? <Avatar kind={critter.species} look={lookOf(critter)} size={36} /> : null}
      <Txt
        variant="notice"
        multiline
        color={colours.backInk}
        style={{ flex: 1, fontSize: 14, lineHeight: 18.9 }}
      >
        <Txt variant="notice" color={colours.backInk} style={{ fontSize: 14, fontWeight: '600' }}>
          {t('chat.back.title', { name: nameOf(actor) })}
        </Txt>{' '}
        {t('chat.back.body')}
      </Txt>
      <Press
        onPress={() => {
          if (waved) return;
          setWaved(true);
          wave(actor);
        }}
        haptic="soft"
        radius={15}
        accessibilityLabel={waved ? t('chat.back.waved') : t('chat.back.wave')}
        style={{
          height: 30,
          paddingHorizontal: 12,
          borderRadius: 15,
          backgroundColor: waved ? palette.go.bg : palette.primary.bg,
          justifyContent: 'center',
        }}
      >
        <Txt variant="buttonSmall" color={palette.primary.fg} style={{ fontSize: 13 }}>
          {waved ? t('chat.back.waved') : t('chat.back.wave')}
        </Txt>
      </Press>
    </View>
  );
}

/**
 * Friends writing: each one's critter writing a letter, at most two, then "and others" (04-15).
 * On a visit: "Otis is writing you a letter" (04-07).
 */
export function TypingLine({ people }: { readonly people: readonly PersonId[] }) {
  const colours = useChatColours();
  const { t } = useLocale();
  const room = useRoom();
  if (people.length === 0) return null;
  const [a = '', b = ''] = people.map((p) => room.nameOf(p));
  const text =
    people.length === 1
      ? room.visit
        ? t('chat.typing.visit', { a })
        : t('chat.typing.one', { a })
      : people.length === 2
        ? t('chat.typing.two', { a, b })
        : t('chat.typing.many', { a, b });
  if (room.visit && people.length === 1) {
    // On a porch: their critter beside the line, writing at a little desk above the words (04-07).
    const critter = room.people.get(people[0] ?? '')?.critter;
    return (
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={text}
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}
      >
        {critter ? (
          <Avatar kind={critter.species} look={lookOf(critter)} size={30} />
        ) : (
          <View style={{ width: 30 }} />
        )}
        <View style={{ gap: 4 }}>
          <ArtLoop
            scene="writing"
            width={96}
            height={46}
            attrs={{ kind: critter?.species ?? 'rabbit' }}
            style={{ marginLeft: 2 }}
          />
          <Txt variant="handS" color={colours.hand} style={{ paddingLeft: 4 }}>
            {text}
          </Txt>
        </View>
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={text}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
    >
      {people.slice(0, 2).map((p) => (
        <ArtLoop
          key={p}
          scene="writing"
          width={96}
          height={46}
          attrs={{ kind: room.people.get(p)?.critter?.species ?? 'rabbit' }}
        />
      ))}
      <Txt variant="handS" color={colours.hand} style={{ fontSize: 16, lineHeight: 16 }}>
        {text}
      </Txt>
    </View>
  );
}
