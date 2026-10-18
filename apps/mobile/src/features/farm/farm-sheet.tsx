import type { DoorstepItem, FarmState, PersonId } from '@kithfield/contracts';
import type { FarmView, PlanView } from '@kithfield/farm';
import { radii } from '@kithfield/theme';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ArtStill } from '../../ui/art/art-view';
import { CritterStack } from '../../ui/components/card';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { lookOf } from './farm-bake';
import { farmCredits, nameOf, planLine } from './farm-copy';

const TILE = 46;

/** A row of the farm's sheet: a drawing on a tile, a title, a line, and a chevron if it opens. */
function SheetRow({
  art,
  title,
  line,
  onPress,
  chevron = false,
}: {
  readonly art: ReactNode;
  readonly title: string;
  readonly line: string;
  readonly onPress?: () => void;
  readonly chevron?: boolean;
}) {
  const { palette } = useTheme();
  const body = (
    <>
      {art}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="planTitle" multiline>
          {title}
        </Txt>
        <Txt variant="planDetail" multiline color={palette.secondary}>
          {line}
        </Txt>
      </View>
      {chevron ? (
        <Txt variant="chevron" color={palette.chevron} importantForAccessibility="no">
          ›
        </Txt>
      ) : null}
    </>
  );
  const row = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46 } as const;
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`${title}, ${line}`} style={row}>
        {body}
      </View>
    );
  }
  return (
    <Press onPress={onPress} darken={false} accessibilityLabel={`${title}, ${line}`} style={row}>
      {body}
    </Press>
  );
}

export interface SheetActions {
  readonly onCredits: () => void;
  readonly onPlan: (plan: PlanView) => void;
  readonly onFirefly: (to: PersonId) => void;
  readonly onDoorstep: (item: DoorstepItem) => void;
  readonly onRose: (person: PersonId) => void;
}

/**
 * The farm's sheet (04-01): who the field thanks, the plans in the seed bed, a friend who has
 * been napping, and what waits on your step. Kinds of care and names, never how much.
 */
export function FarmSheetContent({
  state,
  view,
  me,
  actions,
}: {
  readonly state: FarmState;
  readonly view: FarmView;
  readonly me: PersonId | null;
  readonly actions: SheetActions;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const credits = farmCredits(t, state, view);
  const friends = credits.people.flatMap((p) => {
    const m = state.members.find((x) => x.person === p);
    return m ? [{ name: m.name ?? '', kind: m.critter.species, look: lookOf(m.critter) }] : [];
  });
  // A friend napping a while: not hibernating or paused, who chose that, and not yourself.
  const napper = view.critters.find(
    (c) => c.sleepy && !c.hibernating && !c.paused && c.person !== me,
  );
  const mine = view.doorstep.filter((d) => d.to === me && d.kind !== 'slow_post');
  const roses = view.roses.filter((r) => r.person !== me);
  const tile = {
    width: TILE,
    height: TILE,
    borderRadius: radii.tile + 2,
    overflow: 'hidden',
  } as const;

  return (
    <View style={{ gap: 12 }}>
      <Press
        onPress={actions.onCredits}
        darken={false}
        accessibilityLabel={`${credits.lead} ${credits.rest}`}
        accessibilityHint={t('farm.credits.who')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        {friends.length > 0 ? <CritterStack friends={friends} ring={palette.sheet} /> : null}
        <Txt variant="sheetBody" multiline color={palette.creditText} style={{ flex: 1 }}>
          <Txt variant="sheetBody" color={palette.creditText} style={{ fontWeight: '600' }}>
            {credits.lead}
          </Txt>{' '}
          {credits.rest}
        </Txt>
      </Press>
      <View style={{ height: 1, backgroundColor: palette.hairline }} />
      {mine.map((d) => (
        <SheetRow
          key={`step:${d.seq}`}
          art={
            <View style={[tile, { backgroundColor: palette.firefly.bg }]}>
              <ArtStill
                scene="icon"
                width={TILE}
                height={TILE}
                attrs={{ name: d.kind === 'gift' ? 'rosette' : 'firefly' }}
              />
            </View>
          }
          title={t(d.kind === 'gift' ? 'farm.doorstep.gift' : 'farm.doorstep.firefly', {
            name: d.visitor?.name ?? nameOf(t, state, d.from),
          })}
          line={t(d.kind === 'gift' ? 'farm.doorstep.giftBody' : 'farm.doorstep.fireflyBody')}
          onPress={() => actions.onDoorstep(d)}
        />
      ))}
      {roses.map((r) => (
        <SheetRow
          key={`rose:${r.person}`}
          art={
            <View style={[tile, { backgroundColor: palette.segment.track }]}>
              <ArtStill
                scene="plant"
                width={TILE}
                height={TILE}
                attrs={{ name: 'rose', stage: 3, color: 'none' }}
              />
            </View>
          }
          title={t('farm.rose.title', { name: nameOf(t, state, r.person) })}
          line={t('farm.rose.body')}
          onPress={() => actions.onRose(r.person)}
          chevron
        />
      ))}
      {view.plans.map((p) => (
        <SheetRow
          key={`plan:${p.seed.seq}`}
          art={
            <View style={[tile, { backgroundColor: palette.segment.track }]}>
              <ArtStill scene="seed" width={TILE} height={TILE} attrs={{ stage: p.stage }} />
            </View>
          }
          title={p.seed.title ?? ''}
          line={planLine(t, p)}
          onPress={() => actions.onPlan(p)}
          chevron
        />
      ))}
      {napper ? (
        <SheetRow
          art={
            <View style={[tile, { backgroundColor: palette.firefly.bg }]}>
              <ArtStill scene="icon" width={TILE} height={TILE} attrs={{ name: 'firefly' }} />
            </View>
          }
          title={t('farm.nap.title', { name: nameOf(t, state, napper.person) })}
          line={t('farm.nap.body')}
          onPress={() => actions.onFirefly(napper.person)}
        />
      ) : null}
    </View>
  );
}
