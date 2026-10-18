import type { FarmList } from '@kithfield/contracts';
import { motion } from '@kithfield/theme';
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { ArtIcon, ArtLoop } from '../../ui/art/art-view';
import { Avatar } from '../../ui/art/avatar';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { lookOf, type Friend } from './model/people';
import { useGestureColours } from './ui/colours';

export type FarmRow = FarmList['farms'][number];

/** What the phone already knows of a farm, for its row's subtitle and art. */
export interface FarmGlance {
  readonly critters: number;
  readonly dozing: boolean;
  readonly season: string;
}

/** A farm or visit to forward to: its strip or the two critters, and a tick when picked. */
export function ForwardRow({
  row,
  me,
  glance,
  picked,
  onToggle,
}: {
  readonly row: FarmRow;
  readonly me: Friend | null;
  readonly glance: FarmGlance | undefined;
  readonly picked: boolean;
  readonly onToggle: () => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const gc = useGestureColours();
  const visit = row.kind === 'visit';
  const title = visit ? (row.with?.name ?? t('gestures.aFriend')) : (row.name ?? '');
  const subtitle = visit
    ? t('gestures.forward.visit')
    : glance === undefined
      ? null
      : glance.dozing
        ? t('gestures.forward.dozing')
        : t('gestures.forward.critters', { count: glance.critters });
  return (
    <Press
      onPress={onToggle}
      haptic="select"
      darken={false}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 9,
        borderBottomWidth: 1,
        borderBottomColor: palette.hairline,
      }}
    >
      {visit && row.with ? (
        <View style={{ width: 44, height: 44 }}>
          <Avatar
            kind={row.with.critter.species}
            look={lookOf(row.with.critter)}
            size={30}
            ring={palette.sheet}
            style={{ position: 'absolute', left: 0, top: 0 }}
          />
          <Avatar
            kind={me?.kind ?? 'rabbit'}
            look={me?.look ?? {}}
            size={30}
            ring={palette.sheet}
            style={{ position: 'absolute', right: 0, bottom: 0 }}
          />
        </View>
      ) : (
        <View style={{ width: 44, height: 44, borderRadius: 13, overflow: 'hidden' }}>
          <ArtLoop
            scene="strip"
            width={44}
            height={44}
            attrs={{ season: glance?.season ?? 'autumn' }}
            paused
          />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Txt variant="rowTitle" numberOfLines={1} style={{ fontSize: 15.5, lineHeight: 18.6 }}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="traySubtitle" color={palette.secondary}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          ...(picked
            ? { backgroundColor: palette.go.bg }
            : {
                borderWidth: 1.5,
                borderColor: gc.pickRing,
              }),
        }}
      >
        {picked ? (
          // Picked rows tick in over 120 ms.
          <Animated.View entering={ZoomIn.duration(motion.cross.durationMs)}>
            <ArtIcon name="check" size={14} color={gc.pickTick} />
          </Animated.View>
        ) : null}
      </View>
    </Press>
  );
}
