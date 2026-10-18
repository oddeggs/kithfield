import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon } from '../../ui/art/art-view';
import { EmptyState } from '../../ui/components/state-shell';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { tabBarClearance } from '../../ui/tab-bar/tab-bar';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { addToCalendar } from './calendar';
import { personOn, youLast } from './people';
import { peopleIn, type BedEntry } from './plan-status';
import { SeedArt } from './seed-art';
import { SeedCard } from './seed-card';
import { useMe, usePlanRejections, usePlantedAnswers } from './use-plans';
import { useSeedBed } from './use-seed-bed';

/** Where the design sets the screen's title, from the top of the screen. */
const TITLE_TOP = 66;

/** Opens a plan: the fire on its day, otherwise the plan itself. */
export function openPlan(entry: Pick<BedEntry, 'farm' | 'seed' | 'kind'>): void {
  const params = { farm: entry.farm, seed: String(entry.seed.seq) };
  if (entry.kind === 'today') router.push({ pathname: '/plans-hangout', params });
  else router.push({ pathname: '/seedbed/[seed]', params });
}

/**
 * The seed bed: every plan across the person's farms, away from the chat. Sprouted plans
 * first, then growing, then those needing something, then seeds resting in the shed.
 */
export function SeedBed() {
  const { palette } = useTheme();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const me = useMe();
  const { entries, states, loading } = useSeedBed();
  usePlanRejections();
  usePlantedAnswers();

  const plant = () => router.push('/plans-plant');
  const peopleOf = (entry: BedEntry) => {
    const state = states.get(entry.farm);
    if (!state) return [];
    return youLast(peopleIn(entry.seed).map((p) => personOn(state, p, me, t)));
  };
  const calendar = (entry: BedEntry) => {
    if (entry.day === null) return;
    addToCalendar(entry.seed, entry.day, entry.timeZone).catch(() =>
      show(t('plans.calendarFailed')),
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: Math.max(TITLE_TOP, insets.top + 7),
          paddingBottom: tabBarClearance(insets.bottom),
          flexGrow: 1,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            paddingHorizontal: 20,
          }}
        >
          <View style={{ flex: 1 }}>
            <Txt variant="displayL" accessibilityRole="header" style={{ lineHeight: 35.7 }}>
              {t('glossary.seedBed')}
            </Txt>
            <Txt
              variant="body"
              multiline
              color={palette.body}
              style={{ fontSize: 14.5, lineHeight: 20.3, marginTop: 4 }}
            >
              {t('plans.bed.subtitle')}
            </Txt>
          </View>
          <Press
            onPress={plant}
            haptic="tap"
            radius={22}
            accessibilityLabel={t('plans.bed.plant')}
            testID="plans-bed-plant"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: palette.go.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArtIcon name="plus" size={20} color={palette.go.fg} />
          </Press>
        </View>

        {entries.length > 0 ? (
          <View style={{ marginTop: 30, paddingHorizontal: 16, gap: 10 }}>
            {entries.map((entry) => (
              <SeedCard
                key={`${entry.farm}:${entry.seed.seq}`}
                entry={entry}
                people={peopleOf(entry)}
                onPress={() => openPlan(entry)}
                onCalendar={() => calendar(entry)}
              />
            ))}
          </View>
        ) : loading ? (
          <Txt variant="caption" color={palette.secondary} style={{ margin: 20 }}>
            {t('plans.bed.loading')}
          </Txt>
        ) : (
          <EmptyState
            art={<SeedArt stage={1} size={160} />}
            title={t('plans.bed.empty.title')}
            body={t('plans.bed.empty.body')}
            action={{ label: t('plans.bed.plant'), onPress: plant }}
          />
        )}
      </ScrollView>
    </View>
  );
}
