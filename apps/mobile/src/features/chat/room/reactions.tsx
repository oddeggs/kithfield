import type { PersonId } from '@kithfield/contracts';
import { plantFor } from '@kithfield/farm';
import { View } from 'react-native';

import { useFarmSelector, type FarmReplicaState } from '../../../data';
import { ArtIcon } from '../../../ui/art/art-view';
import { Avatar } from '../../../ui/art/avatar';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { TravelAnchor, timing, travelIds, useRipples, useTravel } from '../../../ui/travel';
import { Txt } from '../../../ui/type/text';
import { DEWDROP, type RowMark } from '../../gestures';
import { lookOf } from '../model/people';
import type { BubbleItem } from '../model/timeline';
import { useChatColours } from '../ui/chat-colours';
import { SPROUT } from './header-art';
import { useRoom } from './room-context';

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

const seasonOf = (farm: FarmReplicaState | null) => farm?.state?.season.season ?? null;

/**
 * A dewdrop left in the chat brings a sprout of the farm's dewdrop plant up in the header, which
 * swells in and settles (signature motion). Under Reduce Motion nothing pops.
 */
function useDewSprout(farm: string): () => void {
  const travel = useTravel();
  const reduce = useReduceMotion();
  const season = useFarmSelector(farm, seasonOf);
  return () => {
    if (reduce || season === null) return;
    const spot = travelIds.chatSprout(farm);
    travel.fly({
      from: spot,
      to: spot,
      sprite: {
        scene: 'plant',
        attrs: { name: plantFor('dew', season), stage: 1, color: 'none' },
        width: SPROUT,
        height: SPROUT,
        drawings: 2,
      },
      fromWidth: SPROUT * 0.2,
      arc: 0,
      fade: 'in',
      // After the drop has rippled, then held a moment before it settles into the farm.
      delayMs: timing('dewdrop', 'total') * 0.5,
      durationMs: timing('dewdrop', 'total') * 0.5,
      holdMs: timing('dewdrop', 'total'),
    });
  };
}

function DewChip({ item }: { readonly item: BubbleItem }) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  const { toggleDew, farm } = useRoom();
  const label = useDewLabel(item.dew);
  // Leaving a dewdrop spreads two ripples from it; taking it back runs them in (signature motion).
  const ripples = useRipples();
  const dew = travelIds.dewdrop(farm, item.seq ?? -1);
  const sprout = useDewSprout(farm);
  return (
    <Press
      onPress={() => {
        ripples(dew, item.myDew !== null);
        if (item.myDew === null) sprout();
        toggleDew(item);
      }}
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
      <TravelAnchor id={dew}>
        <ArtIcon name="dewdrop" size={20} color={palette.text} />
      </TravelAnchor>
      <Txt variant="bubbleState" color={colours.chipInk}>
        {label}
      </Txt>
    </Press>
  );
}

function ReactionChip({
  reaction,
  icon,
  people,
}: {
  readonly reaction: string;
  readonly icon: string;
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
      <ArtIcon name={icon} size={18} color={palette.text} />
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

/**
 * The dewdrops and warm reactions under a bubble, tucked up against it: one chip per mark, in the
 * marks' order, each with who left it.
 */
export function Reactions({
  item,
  marks,
}: {
  readonly item: BubbleItem;
  readonly marks: readonly RowMark[];
}) {
  if (marks.length === 0) return null;
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
      {marks.map((mark) =>
        mark.id === DEWDROP ? (
          item.dew.length > 0 ? (
            <DewChip key={mark.id} item={item} />
          ) : null
        ) : (
          <ReactionChip
            key={mark.id}
            reaction={mark.id}
            icon={mark.icon}
            people={item.reactions.find((r) => r.reaction === mark.id)?.people ?? []}
          />
        ),
      )}
    </View>
  );
}
