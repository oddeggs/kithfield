import type { FarmId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { useFarm, useFarmEvents, useFarmView } from '../../data';
import { FarmScene } from '../../features/farm/farm-scene';
import { reactionTo, SAID_MS, type FarmReaction } from '../../features/farm/reactions';
import { farmRoutes } from '../../features/farm/routes';
import { useFireOnFarm } from '../../features/fire/fire-glow';
import { ArtIcon } from '../../ui/art/art-view';
import { useLocale } from '../../ui/locale/locale-provider';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { platformLook } from '../look';
import { useDesk } from './desk-context';
import { useNowMinute } from './use-now-minute';

/** A friend's newest message, popped over their cottage for a moment as they say it. */
function useReaction(farm: FarmId, me: string | null): FarmReaction | null {
  const events = useFarmEvents(farm, 10);
  const so = useRef<{ afterSeq: number; lastAt: number | null } | null>(null);
  const [said, setSaid] = useState<FarmReaction | null>(null);
  useEffect(() => {
    so.current = null;
  }, [farm]);
  useEffect(() => {
    if (events.length === 0) return;
    const newest = events.reduce((top, e) => Math.max(top, e.seq), 0);
    // What was there as the farm opened never pops up.
    if (so.current === null) {
      so.current = { afterSeq: newest, lastAt: null };
      return;
    }
    const now = Date.now();
    const next = reactionTo(events, me, so.current, now);
    so.current = { afterSeq: next.afterSeq, lastAt: next.reaction ? now : so.current.lastAt };
    if (next.reaction) setSaid(next.reaction);
  }, [events, me]);
  useEffect(() => {
    if (!said) return;
    const timer = setTimeout(() => setSaid(null), SAID_MS);
    return () => clearTimeout(timer);
  }, [said]);
  return said;
}

/**
 * The right pane: the chosen farm alive at the pane's size, reacting as friends chat, with a
 * card at its foot saying so. Tapping the art opens what it opens on the phone.
 */
export function DeskFarm({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const desk = useDesk();
  const reduce = useReduceMotion();
  const me = useSession().person?.id ?? null;
  const now = useNowMinute();
  const state = useFarm(farm)?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  const fire = useFireOnFarm(farm);
  const said = useReaction(farm, me);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s && s.width === width && s.height === height ? s : { width, height }));
  };
  const saidBy = said ? state?.members.find((m) => m.person === said.person)?.name : null;

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {size && state ? (
        <FarmScene
          state={state}
          view={view}
          me={me}
          width={size.width}
          height={size.height}
          night={palette.appearance === 'night'}
          running={!reduce}
          now={now}
          fire={fire}
          said={said}
          targets={{
            onCritter: (person) =>
              router.push({ pathname: '/(modal)/farm-critter', params: { farm, person } }),
            onHouse: (h) =>
              router.push({
                pathname: '/(modal)/farm-critter',
                params: { farm, person: h.person },
              }),
            onFire: () => desk.setFire(true),
            onPatch: () => router.navigate(farmRoutes.seedbed()),
            onPlan: (p) => router.push(farmRoutes.plan(farm, p.seed.seq)),
          }}
        />
      ) : null}
      <View
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          borderRadius: 18,
          paddingVertical: 10,
          paddingHorizontal: 12,
          // The page's own sheet colour, a little see-through, so it reads by day and at night.
          backgroundColor: `${palette.sheet}DB`,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <ArtIcon name="sparkle" size={18} color={platformLook.dropEdge} />
        <Txt variant="caption" style={{ flex: 1, fontSize: 12.5, lineHeight: 16.9 }}>
          {saidBy ? t('platforms.desk.reacts', { name: saidBy }) : t('platforms.desk.reactsQuiet')}
        </Txt>
      </View>
    </View>
  );
}
