import type { FarmId, PersonId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtStill } from '../../ui/art/art-view';
import { lookOf } from '../../ui/art/critter-look';
import { ListGroup, ListRow } from '../../ui/components/list-row';
import { EmptyState, ErrorState } from '../../ui/components/state-shell';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { listOf } from '../farm/farm-copy';
import { BackButton } from './chrome';
import { usePeopleKnown } from './people-known';
import { useLoad, useRhythmApi } from './rhythm-api';
import { rhythmRoutes } from './routes';

/**
 * Friends' farms: the farms where someone you share a farm with lives, to visit at the gate.
 * Undesigned as a list (the design shows the visit itself): built from the list rows.
 */
export function GatesScreen({
  from,
  person,
}: {
  readonly from: FarmId;
  readonly person?: PersonId;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const api = useRhythmApi();
  const known = usePeopleKnown();
  const gates = useLoad(() => api.gates(person), [api, person]);
  const nameOf = (p: PersonId) => known.get(p)?.name ?? t('rhythm.someone');

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 3,
          paddingBottom: insets.bottom + 120,
          gap: 16,
        }}
      >
        <View style={{ paddingHorizontal: 20 }}>
          <BackButton onPress={() => router.back()} />
        </View>
        <View style={{ paddingHorizontal: 22, gap: 4 }}>
          <Txt variant="displayL" multiline accessibilityRole="header">
            {t('rhythm.gates.title')}
          </Txt>
          <Txt variant="sheetBody" multiline color={palette.body}>
            {t('rhythm.gates.body')}
          </Txt>
        </View>
        {gates.status === 'failed' ? (
          <ErrorState
            art={<ArtStill scene="spot" width={240} height={172} attrs={{ name: 'offline' }} />}
            title={t('rhythm.gates.title')}
            body={t('rhythm.loadFailed')}
            action={{ label: t('rhythm.tryAgain'), onPress: gates.reload }}
          />
        ) : gates.status === 'ready' && gates.value.gates.length === 0 ? (
          <EmptyState
            art={<ArtStill scene="gate" width={240} height={180} />}
            title={t('rhythm.gates.empty.title')}
            body={t('rhythm.gates.empty.body')}
          />
        ) : gates.status === 'ready' ? (
          <View style={{ paddingHorizontal: 16 }}>
            <ListGroup>
              {gates.value.gates.map((g) => {
                const first = g.friends[0];
                const friend = first ? known.get(first) : undefined;
                return (
                  <ListRow
                    key={g.farm}
                    title={g.name}
                    subtitle={t('rhythm.gates.friends', {
                      names: listOf(t, g.friends.slice(0, 3).map(nameOf)),
                    })}
                    {...(friend
                      ? {
                          critter: {
                            name: friend.name ?? '',
                            kind: friend.critter.species,
                            look: lookOf(friend.critter),
                          },
                        }
                      : { icon: 'farm' })}
                    onPress={() => first && router.push(rhythmRoutes.visit(g.farm, from, first))}
                  />
                );
              })}
            </ListGroup>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
