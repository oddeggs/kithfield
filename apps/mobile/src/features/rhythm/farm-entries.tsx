import type { FarmId, FarmState, PersonId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { radii } from '@kithfield/theme';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';

import { useFarmEvents } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { useFarmFlags } from '../farm/valley-store';
import { fieldGuideRoutes } from '../field-guide/routes';
import { useHarvestMoment, useRareBloomMoment } from '../field-guide/use-moments';
import { say } from './copy';
import { captionKey, projectKeys } from './project-copy';
import { sharedRainToday, showSharedRain, todayWeather } from './moments';
import { rhythmRoutes } from './routes';
import { WeatherChip } from './weather-screen';

/* What the farm home shows of the farm's rhythm: its sheet rows, the weather chip, moments. */

const TILE = 46;

function Row({
  art,
  title,
  line,
  onPress,
}: {
  readonly art: ReactNode;
  readonly title: string;
  readonly line: string;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Press
      onPress={onPress}
      darken={false}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${line}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46 }}
    >
      <View
        style={{
          width: TILE,
          height: TILE,
          borderRadius: radii.tile + 2,
          overflow: 'hidden',
          backgroundColor: palette.segment.track,
        }}
      >
        {art}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="planTitle" multiline>
          {title}
        </Txt>
        <Txt variant="planDetail" multiline color={palette.secondary}>
          {line}
        </Txt>
      </View>
      <Txt variant="chevron" color={palette.chevron} importantForAccessibility="no">
        ›
      </Txt>
    </Press>
  );
}

/**
 * The farm sheet's rows for the farm's rhythm: the restoration project, the Sunday harvest, the
 * scrapbook and friends' farms. Visits keep their porch instead.
 */
export function RhythmSheetRows({
  farm,
  state,
  view,
  onRecap,
}: {
  readonly farm: FarmId;
  readonly state: FarmState;
  readonly view: FarmView;
  /** Opens the Sunday harvest its own way (the crops hop into its basket); straight in otherwise. */
  readonly onRecap?: () => void;
}) {
  const { t } = useLocale();
  if (state.kind !== 'farm') return null;
  const project = view.restoration;
  return (
    <View style={{ gap: 12, marginTop: 12 }}>
      {project ? (
        <Row
          art={
            <ArtStill
              scene={project.scene ?? 'barn'}
              width={TILE}
              height={TILE}
              attrs={{ progress: project.progress, season: state.season.season }}
            />
          }
          title={say(t, projectKeys(project.project).name)}
          line={say(t, captionKey(project, 'today'))}
          onPress={() => router.push(rhythmRoutes.project(farm))}
        />
      ) : null}
      <Row
        art={
          <ArtStill
            scene="plant"
            width={TILE}
            height={TILE}
            attrs={{ name: 'clover', stage: 3, color: 'none' }}
          />
        }
        title={t('fieldGuide.title')}
        line={t('rhythm.row.guideLine')}
        onPress={() => router.push(fieldGuideRoutes.guide(farm))}
      />
      <Row
        art={<ArtStill scene="harvest" width={TILE} height={TILE} />}
        title={t('rhythm.row.recap')}
        line={t('rhythm.row.recapLine')}
        onPress={onRecap ?? (() => router.push(rhythmRoutes.recap(farm)))}
      />
      <Row
        art={<ArtStill scene="pressed" width={TILE} height={TILE} attrs={{ name: 'daisy' }} />}
        title={t('rhythm.scrapbook.title')}
        line={t('rhythm.scrapbook.row')}
        onPress={() => router.push(rhythmRoutes.scrapbook(farm))}
      />
      <Row
        art={<ArtStill scene="icon" width={TILE} height={TILE} attrs={{ name: 'door' }} />}
        title={t('rhythm.row.gates')}
        line={t('rhythm.row.gatesLine')}
        onPress={() => router.push(rhythmRoutes.gates(farm))}
      />
    </View>
  );
}

/** Today's real weather over the farm, under its header; it opens the weather and its credit. */
export function RhythmWeatherChip({
  farm,
  state,
  view,
  top,
}: {
  readonly farm: FarmId;
  readonly state: FarmState;
  readonly view: FarmView;
  readonly top: number;
}) {
  const events = useFarmEvents(farm, 100);
  const weather = todayWeather(state, view, events);
  if (!weather) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top, right: 16 }}>
      <WeatherChip weather={weather} onPress={() => router.push(rhythmRoutes.weather(farm))} />
    </View>
  );
}

/**
 * The farm's rhythm moments as the farm opens: shared rain shows once on the day it fell, to the
 * people it fell on; a rare bloom once per bloom, and harvest day once a season (each cover marks
 * itself seen on this phone).
 */
export function useRhythmMoments(farm: FarmId, view: FarmView | null, me: PersonId | null): void {
  const flags = useFarmFlags(farm);
  const events = useFarmEvents(farm, 100);
  // Only over the farm itself, never over a screen opened from it.
  const focused = useIsFocused();
  const people = view ? sharedRainToday(events, view.today) : null;
  const shown = useRef<string | null>(null);
  const today = view?.today ?? null;
  const raining = view?.sharedRain ?? false;
  useEffect(() => {
    if (!focused || !view || !today || !raining || shown.current === today) return;
    let live = true;
    void flags.read('rain').then(async (seenOn) => {
      if (!live || !showSharedRain(view, people, me, seenOn)) return;
      shown.current = today;
      await flags.write('rain', today);
      router.push(rhythmRoutes.rain(farm));
    });
    return () => {
      live = false;
    };
  }, [farm, flags, focused, me, people, raining, today, view]);

  const rare = useRareBloomMoment(farm);
  const harvest = useHarvestMoment(farm);
  const next = rare ?? harvest;
  const pushed = useRef<string | null>(null);
  const key = next === null ? null : JSON.stringify(next);
  useEffect(() => {
    if (!focused || next === null || key === null || pushed.current === key) return;
    pushed.current = key;
    router.push(next);
  }, [focused, key, next]);
}
