import { KNOWN_REACTIONS, type PersonId } from '@kithfield/contracts';
import { View } from 'react-native';

import { ArtIcon } from '../../../ui/art/art-view';
import { Avatar } from '../../../ui/art/avatar';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { lookOf } from '../model/people';
import type { BubbleItem } from '../model/timeline';
import { useChatColours } from '../ui/chat-colours';
import { useRoom } from './room-context';

const known = new Set<string>(KNOWN_REACTIONS);

/** Who left a dewdrop, as the chip says it: "Pip and Bea", "Pip, Bea and you". */
export function useDewLabel(people: readonly PersonId[]): string {
  const { t } = useLocale();
  const { me, nameOf } = useRoom();
  const others = people.filter((p) => p !== me).map((p) => nameOf(p));
  const names = people.includes(me ?? '') ? [...others, t('chat.bubble.dew.you')] : others;
  const [a = '', b = '', c = ''] = names;
  if (names.length === 1) return t('chat.bubble.dew.one', { a });
  if (names.length === 2) return t('chat.bubble.dew.two', { a, b });
  if (names.length === 3) return t('chat.bubble.dew.three', { a, b, c });
  return t('chat.bubble.dew.many', { a, b });
}

function DewChip({ item }: { readonly item: BubbleItem }) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  const { toggleDew } = useRoom();
  const label = useDewLabel(item.dew);
  return (
    <Press
      onPress={() => toggleDew(item)}
      radius={16}
      haptic="soft"
      accessibilityLabel={`${label}. ${item.myDew !== null ? t('chat.bubble.dewdropOff') : t('chat.bubble.dewdropOn')}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 4,
        paddingLeft: 5,
        paddingRight: 10,
        borderRadius: 16,
        backgroundColor: palette.card,
        boxShadow: colours.chipShadow,
      }}
    >
      <ArtIcon name="dewdrop" size={20} color={palette.text} />
      <Txt variant="bubbleState" color={colours.chipInk}>
        {label}
      </Txt>
    </Press>
  );
}

function ReactionChip({
  reaction,
  people,
}: {
  readonly reaction: string;
  readonly people: readonly PersonId[];
}) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  const room = useRoom();
  const names = people.map((p) => room.nameOf(p)).join(', ');
  return (
    <View
      accessible
      accessibilityLabel={t('chat.bubble.reacted', { names, reaction })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 3,
        paddingLeft: 4,
        paddingRight: 8,
        borderRadius: 14,
        backgroundColor: palette.card,
        boxShadow: colours.chipShadow,
      }}
    >
      <ArtIcon name={known.has(reaction) ? reaction : 'sparkle'} size={18} color={palette.text} />
      <View style={{ flexDirection: 'row' }}>
        {people.slice(0, 4).map((p, i) => {
          const critter = room.people.get(p)?.critter;
          return critter ? (
            <Avatar
              key={p}
              kind={critter.species}
              look={lookOf(critter)}
              size={18}
              ring={palette.card}
              style={i > 0 ? { marginLeft: -5 } : null}
            />
          ) : null;
        })}
      </View>
    </View>
  );
}

/** The dewdrops and warm reactions under a bubble, tucked up against it. */
export function Reactions({ item }: { readonly item: BubbleItem }) {
  if (item.dew.length === 0 && item.reactions.length === 0) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: -12,
        ...(item.mine ? { marginRight: 12, justifyContent: 'flex-end' } : { marginLeft: 12 }),
      }}
    >
      {item.dew.length > 0 ? <DewChip item={item} /> : null}
      {item.reactions.map((r) => (
        <ReactionChip key={r.reaction} reaction={r.reaction} people={r.people} />
      ))}
    </View>
  );
}
