import type { FarmId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import {
  useFarm,
  useFarmLink,
  useFarmView,
  useNetworkSwitch,
  useSend,
  type FarmLink,
} from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { Avatar } from '../../ui/art/avatar';
import { Button } from '../../ui/components/button';
import { ListGroup, ListRow } from '../../ui/components/list-row';
import { Toggle } from '../../ui/components/toggle';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { Note, Section, lookOf } from './lab-kit';

/** Stage 0–4, as `PLANT_STAGES` names them. */
const STAGES = [
  'syncLab.stage.seed',
  'syncLab.stage.sprout',
  'syncLab.stage.bud',
  'syncLab.stage.bloom',
  'syncLab.stage.harvest',
] as const;

const LINKS = {
  connecting: 'syncLab.link.connecting',
  catching_up: 'syncLab.link.catchingUp',
  live: 'syncLab.link.live',
  offline: 'syncLab.link.offline',
  paused: 'syncLab.link.paused',
  stopped: 'syncLab.link.stopped',
} as const satisfies Record<Exclude<FarmLink['status'], 'blocked'>, string>;

/** The clock the farm view is drawn at, moving on every half minute. */
function useNow(stepMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(timer);
  }, [stepMs]);
  return now;
}

/** The link to the farm, and the development switch that cuts the network. */
function LinkLine({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const link = useFarmLink(farm);
  const net = useNetworkSwitch();
  const status =
    link.status === 'blocked'
      ? t('syncLab.link.blocked', { code: link.code })
      : t(LINKS[link.status]);
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="rowTitle" testID="sync-lab-link">
        {t('syncLab.link.label', { status })}
      </Txt>
      {net ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Txt variant="caption">{t('syncLab.network.off')}</Txt>
          <Toggle
            value={net.offline}
            onChange={(off) => net.network.setOffline(off)}
            label={t('syncLab.network.off')}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The live farm: its scene, the critters who live there, the link, and each plant's stage as the
 * shared rules see it now, with a dewdrop for the plant that dew grows.
 */
export function FarmLive({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const now = useNow();
  const replica = useFarm(farm);
  const view = useFarmView<FarmView>(farm, now);
  const send = useSend(farm);
  const [note, setNote] = useState<string | null>(null);
  const state = replica?.state ?? null;
  const sceneWidth = width - 32;

  const dewPlant = view?.plants.find((p) => p.family === 'dew') ?? null;
  const dewdrop = async () => {
    const result = await send('dewdrop', {});
    setNote(result.status === 'refused' ? t('syncLab.refused', { reason: result.reason }) : null);
  };

  return (
    <>
      <LinkLine farm={farm} />
      {view ? (
        // Drawn once as a still: a whole farm looped frame by frame is over the art cache's budget;
        // the farm screen moves its critters over a still background instead.
        <ArtStill
          scene="farm"
          width={sceneWidth}
          height={Math.round((sceneWidth * 4) / 3)}
          attrs={{ season: view.season.season }}
          style={{ borderRadius: 20, overflow: 'hidden' }}
        />
      ) : null}
      <Section title={t('syncLab.critters.section')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {(state?.members ?? []).map((m) => {
            const sleepy = view?.critters.find((c) => c.person === m.person)?.sleepy ?? false;
            return (
              <View key={m.person} style={{ alignItems: 'center', gap: 4 }}>
                <Avatar
                  kind={m.critter.species}
                  look={lookOf(m.critter)}
                  {...(sleepy ? { state: 'sleep' as const } : {})}
                  size={52}
                />
                <Txt variant="caption" color={palette.muted}>
                  {m.name ?? '…'}
                </Txt>
              </View>
            );
          })}
        </View>
      </Section>
      <Section title={t('syncLab.plants.section')}>
        {view && view.plants.length > 0 ? (
          <ListGroup>
            {view.plants.map((p) => {
              const dew = state?.plants.find((s) => s.plant === p.plant)?.dew ?? 0;
              const line = p.sleepy ? 'syncLab.plant.sleepy' : 'syncLab.plant.row';
              return (
                <ListRow
                  key={p.plant}
                  title={`${p.plant}${p.family ? ` (${p.family})` : ''}`}
                  subtitle={t(line, { stage: t(STAGES[p.stage] ?? STAGES[0]), dew })}
                  trailing={
                    <ArtStill
                      scene="plant"
                      width={44}
                      height={44}
                      attrs={{ name: p.plant, stage: p.stage, color: 'none' }}
                    />
                  }
                />
              );
            })}
          </ListGroup>
        ) : (
          <Note text={t('syncLab.plants.none')} />
        )}
        {dewPlant ? (
          <Button
            label={t('syncLab.dewdrop.action')}
            icon="dewdrop"
            kind="go"
            size="medium"
            accessibilityHint={t('syncLab.dewdrop.hint', { plant: dewPlant.plant })}
            onPress={() => void dewdrop()}
          />
        ) : null}
        <Note text={note} />
      </Section>
    </>
  );
}
