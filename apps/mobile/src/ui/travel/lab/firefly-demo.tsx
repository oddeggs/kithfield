import { radii } from '@kithfield/theme';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { ArtStill } from '../../art/art-view';
import { Button } from '../../components/button';
import { Chip } from '../../components/chip';
import { useLocale } from '../../locale/locale-provider';
import { Press } from '../../motion/press';
import { useTheme } from '../../theme/theme-provider';
import { Txt } from '../../type/text';
import { TravelAnchor, TravelSpot } from '../anchors';
import type { SpriteSpec } from '../sprite';
import { timing } from '../timings';
import { useTravel, type FlightHandle } from '../travel-host';

const STAGE_H = 600;
const FARM_H = 330;
const DOOR_W = 120;
const DOOR_H = 150;
const TILE = 72;
const FIREFLY = 56;
const fireflyArt: SpriteSpec = {
  scene: 'icon',
  attrs: { name: 'firefly' },
  width: FIREFLY,
  height: FIREFLY,
};
const DOORS = [
  { kind: 'owl', side: 'left', x: 40 },
  { kind: 'rabbit', side: 'right', x: 393 - 40 - DOOR_W },
] as const;
const FLIGHT_MS = timing('firefly', 'flight');

/** Where the door scene sets a firefly down: on its step, right of the middle (`S.door`). */
function stepOf(w: number, h: number) {
  const s = Math.min(w / 80, h / 100);
  return { x: w / 2 + 16 * s, y: h * 0.86 - 2 * s };
}
const STEP = stepOf(DOOR_W, DOOR_H);
const SPOT = 24;
const stepId = (kind: string) => `lab:step:${kind}`;

/**
 * A firefly's flight to a door: it lifts out of the tray glowing, arcs over the farm on twos and
 * settles on the step, where the door keeps it. Choosing the other door mid-flight turns it;
 * calling it back flies it home into the tray.
 */
export function FireflyDemo() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { fly } = useTravel();
  const flight = useRef<FlightHandle | null>(null);
  const [door, setDoor] = useState<string>('owl');
  const [waiting, setWaiting] = useState<string | null>(null);

  const send = () => {
    if (flight.current || waiting) return;
    flight.current = fly({
      from: 'lab:tray',
      to: stepId(door),
      sprite: fireflyArt,
      fromWidth: FIREFLY,
      toWidth: SPOT * 1.4,
      arc: 150,
      grow: 0.2,
      hideTarget: false,
      durationMs: FLIGHT_MS,
      onLanded: () => {
        flight.current = null;
        setWaiting(door);
      },
      onReturned: () => {
        flight.current = null;
      },
    });
  };
  const pick = (kind: string) => {
    setDoor(kind);
    flight.current?.retarget(stepId(kind));
  };
  const recall = () => {
    if (flight.current) return flight.current.reverse();
    if (!waiting) return;
    // Recalled after it settled: it lifts off the step and flies home.
    setWaiting(null);
    flight.current = fly({
      from: stepId(waiting),
      to: 'lab:tray',
      sprite: fireflyArt,
      fromWidth: SPOT * 1.4,
      toWidth: FIREFLY,
      arc: 150,
      hideSource: false,
      durationMs: FLIGHT_MS,
      onLanded: () => {
        flight.current = null;
      },
    });
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ height: STAGE_H, overflow: 'hidden', backgroundColor: palette.firefly.bg }}>
        <ArtStill
          scene="farm"
          width={393}
          height={FARM_H}
          attrs={{ night: true, season: 'autumn' }}
        />
        {DOORS.map((d) => (
          <View
            key={d.kind}
            style={{
              position: 'absolute',
              left: d.x,
              top: FARM_H + 10,
              width: DOOR_W,
              height: DOOR_H,
              borderRadius: radii.tile,
              overflow: 'hidden',
            }}
          >
            <ArtStill
              scene="door"
              width={DOOR_W}
              height={DOOR_H}
              attrs={{ kind: d.kind, ...(waiting === d.kind ? { firefly: true } : {}) }}
            />
            <TravelSpot
              id={stepId(d.kind)}
              box={{ x: STEP.x - SPOT / 2, y: STEP.y - SPOT / 2, width: SPOT, height: SPOT }}
            />
          </View>
        ))}
        <Press
          onPress={send}
          haptic="soft"
          radius={radii.tile}
          accessibilityLabel={t('motionLab.firefly.send')}
          style={{ position: 'absolute', left: (393 - TILE) / 2, bottom: 20 }}
        >
          <View
            style={{
              width: TILE,
              height: TILE,
              borderRadius: radii.tile,
              backgroundColor: palette.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TravelAnchor id="lab:tray">
              <ArtStill scene="icon" width={FIREFLY} height={FIREFLY} attrs={{ name: 'firefly' }} />
            </TravelAnchor>
          </View>
        </Press>
      </View>
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        <Txt variant="note" multiline color={palette.secondary}>
          {t('motionLab.firefly.hint')}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {DOORS.map((d) => (
            <Chip
              key={d.kind}
              label={t(d.side === 'left' ? 'motionLab.firefly.left' : 'motionLab.firefly.right')}
              kind={door === d.kind ? 'selected' : 'default'}
              onPress={() => pick(d.kind)}
            />
          ))}
        </View>
        <Button label={t('motionLab.firefly.recall')} kind="text" onPress={recall} />
      </View>
    </View>
  );
}
