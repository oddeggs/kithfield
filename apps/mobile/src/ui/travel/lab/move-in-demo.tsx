import { radii } from '@kithfield/theme';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ArtStill } from '../../art/art-view';
import { Avatar } from '../../art/avatar';
import { useLocale } from '../../locale/locale-provider';
import { fadeTo } from '../../motion/motion';
import { Press } from '../../motion/press';
import { TravelAnchor, TravelSpot } from '../anchors';
import { timing } from '../timings';
import { LabNotes, LabStage, STAGE_W, useLabFlight } from './kit';

const KINDS = ['fox', 'rabbit', 'owl', 'hedgehog', 'duck', 'bear', 'otter', 'frog'] as const;
const TILE = 64;
const FACE = 120;
const STAGE = { x: 28, y: 24, width: STAGE_W - 56, height: 240 };
const STANDING = 130;
const MOVE_IN_H = 600;
/** A cottage door on the farm scene, and the foot of the path the critter hops up from. */
const DOOR = { x: STAGE_W * 0.3 - 14, y: MOVE_IN_H * 0.45 - 28, width: 28, height: 28 };
const PATH_FOOT = { x: STAGE_W * 0.5 - 60, y: MOVE_IN_H - 150, width: 120, height: 120 };
const HOPS = { count: 6, height: 10 };
const carry = timing('pickerToFarm', 'carry');
const walk = timing('pickerToFarm', 'walk');

const tileId = (kind: string) => `lab:tile:${kind}`;
const stageSprite = (kind: string) =>
  ({ scene: 'stage', attrs: { kind }, width: STAGE.width, height: STAGE.height }) as const;

/**
 * Picker to farm: the chosen critter carries from its tile to the stage and grows, then hops down
 * the path to its cottage, where the window lights. Back from the stage shrinks it into its tile.
 */
export function MoveInDemo() {
  const { t } = useLocale();
  const { go, current } = useLabFlight();
  const [kind, setKind] = useState<string | null>(null);
  const [home, setHome] = useState(false);
  const farm = useSharedValue(0);
  const glow = useSharedValue(0);
  const picker = useAnimatedStyle(() => ({ opacity: 1 - farm.get() }));
  const village = useAnimatedStyle(() => ({ opacity: farm.get() }));
  const lit = useAnimatedStyle(() => ({ opacity: glow.get() }));

  const pick = (next: string) => {
    if (current.current) return current.current.finish();
    setKind(next);
    // The stage shows the new critter once the face has landed on it.
    go({
      from: tileId(next),
      to: 'lab:stage',
      sprite: { avatar: next, size: FACE },
      becomes: stageSprite(next),
      fit: 0.4,
      grow: 0.25,
      arc: 40,
      durationMs: carry,
    });
  };

  const moveIn = () => {
    if (!kind || current.current) return;
    farm.set(fadeTo(1));
    go({
      from: 'lab:path-foot',
      to: 'lab:door',
      sprite: { critter: kind, size: STANDING },
      hops: HOPS,
      toWidth: 40,
      arc: -20,
      durationMs: walk,
      onTouchdown: () => {
        setHome(true);
        glow.set(fadeTo(1));
      },
    });
  };

  const back = () => {
    if (current.current) return current.current.reverse();
    if (home) {
      setHome(false);
      glow.set(fadeTo(0));
      farm.set(fadeTo(0));
      return;
    }
    if (!kind) return;
    const was = kind;
    go({
      from: 'lab:stage',
      to: tileId(was),
      sprite: { critter: was, size: STANDING },
      becomes: { avatar: was, size: TILE },
      fit: 1,
      toWidth: TILE,
      arc: 40,
      durationMs: carry,
      onLanded: () => setKind(null),
    });
  };

  return (
    <View>
      <LabStage height={MOVE_IN_H}>
        <Animated.View style={[{ flex: 1 }, picker]}>
          <View
            style={{
              position: 'absolute',
              left: STAGE.x,
              top: STAGE.y,
              width: STAGE.width,
              height: STAGE.height,
              borderTopLeftRadius: 120,
              borderTopRightRadius: 120,
              borderBottomLeftRadius: 30,
              borderBottomRightRadius: 30,
              overflow: 'hidden',
              backgroundColor: '#F3DCC8',
            }}
          >
            <TravelAnchor
              id="lab:stage"
              {...(kind ? { sprite: stageSprite(kind) } : {})}
              style={{ width: STAGE.width, height: STAGE.height }}
            >
              {kind ? (
                <ArtStill
                  scene="stage"
                  width={STAGE.width}
                  height={STAGE.height}
                  attrs={{ kind }}
                />
              ) : null}
            </TravelAnchor>
          </View>
          <View
            style={{
              position: 'absolute',
              top: STAGE.y + STAGE.height + 32,
              left: 24,
              right: 24,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 14,
              justifyContent: 'center',
            }}
          >
            {KINDS.map((k) => (
              <Press key={k} onPress={() => pick(k)} radius={radii.tile} darken={false}>
                <TravelAnchor id={tileId(k)} sprite={{ avatar: k, size: TILE }}>
                  <Avatar kind={k} size={TILE} />
                </TravelAnchor>
              </Press>
            ))}
          </View>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: 0, top: 0 }, village]}
        >
          <ArtStill
            scene="farm"
            width={STAGE_W}
            height={MOVE_IN_H}
            attrs={{ state: 'nocast', season: 'spring' }}
          />
          <TravelSpot id="lab:door" box={DOOR} />
          <TravelSpot id="lab:path-foot" box={PATH_FOOT} />
          {home && kind ? (
            <View style={{ position: 'absolute', left: DOOR.x - 6, top: DOOR.y - 12, width: 40 }}>
              <ArtStill scene="pose" width={40} height={40} attrs={{ kind, color: 'none' }} />
            </View>
          ) : null}
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: DOOR.x - 40,
                top: DOOR.y - 70,
                width: 110,
                height: 110,
                borderRadius: 55,
                backgroundImage: 'radial-gradient(rgba(255,210,110,0.85), rgba(255,210,110,0) 68%)',
              },
              lit,
            ]}
          />
        </Animated.View>
      </LabStage>
      <LabNotes
        hint={t('motionLab.moveIn.hint')}
        actions={[
          { label: t('motionLab.moveIn'), onPress: moveIn },
          { label: t('motionLab.back'), onPress: back },
        ]}
      />
    </View>
  );
}
