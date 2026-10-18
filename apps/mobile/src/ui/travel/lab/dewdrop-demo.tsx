import { useState } from 'react';
import { View } from 'react-native';

import { ArtStill } from '../../art/art-view';
import { useLocale } from '../../locale/locale-provider';
import { Press } from '../../motion/press';
import { useTheme } from '../../theme/theme-provider';
import { TravelAnchor } from '../anchors';
import type { SpriteSpec } from '../sprite';
import { timing } from '../timings';
import { useTravel } from '../travel-host';
import { BlankBubble, ChatPaper, LabNotes, LabStage, STAGE_W } from './kit';

const STRIP_H = 200;
const PHOTO = { width: 230, height: 150 };
const DROP = 44;
const SPROUT = 90;
/** Where the clover comes up in the farm above: on the strip's ground, right of the middle. */
const SPROUT_AT = {
  x: STAGE_W * 0.42 - SPROUT / 2,
  y: STRIP_H * 0.62 - SPROUT,
  width: SPROUT,
  height: SPROUT,
};
/** The storyboard's pencil-blue ripples, two of them, the second smaller and later. */
const RIPPLE = 'rgba(95,159,189,0.85)';
const RINGS = [
  { width: 120, height: 40, delay: 0 },
  { width: 80, height: 26, delay: 60 },
] as const;
const total = timing('dewdrop', 'total');

const dropArt: SpriteSpec = {
  scene: 'icon',
  attrs: { name: 'dewdrop' },
  width: DROP,
  height: DROP,
};
const sproutArt: SpriteSpec = {
  scene: 'plant',
  attrs: { name: 'clover', stage: 1, color: 'none' },
  width: SPROUT,
  height: SPROUT,
  drawings: 2,
};

/**
 * A dewdrop: tapped on a photo, it swells and falls onto the bubble, two ripples spread from it,
 * and a clover sprout pops up in the farm above. Taken back, the ripples run inward and the
 * sprout tucks into the soil.
 */
export function DewdropDemo() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { fly } = useTravel();
  const [left, setLeft] = useState(false);
  const [sprouted, setSprouted] = useState(false);

  const ripples = (inward: boolean) => {
    for (const r of RINGS) {
      const small = { width: r.width * 0.2, height: r.height * 0.2 };
      fly({
        from: 'lab:photo',
        to: 'lab:photo',
        sprite: { ring: RIPPLE, width: r.width, height: r.height },
        fromWidth: inward ? r.width * 1.6 : small.width,
        toWidth: inward ? small.width : r.width * 1.6,
        arc: 0,
        fade: inward ? 'in' : 'out',
        hideSource: false,
        hideTarget: false,
        delayMs: r.delay,
        durationMs: total * 0.45,
      });
    }
  };

  const toggle = () => {
    if (!left) {
      setLeft(true);
      fly({
        from: 'lab:dewdrop',
        to: 'lab:photo',
        sprite: dropArt,
        toWidth: DROP * 0.8,
        grow: 0.35,
        arc: 30,
        hideTarget: false,
        durationMs: total * 0.45,
        onTouchdown: () => {
          ripples(false);
          fly({
            from: 'lab:sprout',
            to: 'lab:sprout',
            sprite: sproutArt,
            fromWidth: SPROUT * 0.2,
            arc: 0,
            fade: 'in',
            durationMs: total * 0.5,
            // The farm holds the sprout from here, hidden until the pop has finished.
            onStart: () => setSprouted(true),
          });
        },
      });
      return;
    }
    setLeft(false);
    ripples(true);
    fly({
      from: 'lab:sprout',
      to: 'lab:sprout',
      sprite: sproutArt,
      toWidth: SPROUT * 0.15,
      arc: 0,
      fade: 'out',
      durationMs: total * 0.5,
      onStart: () => setSprouted(false),
    });
  };

  return (
    <View>
      <LabStage>
        <ArtStill scene="strip" width={STAGE_W} height={STRIP_H} attrs={{ season: 'spring' }} />
        <TravelAnchor
          id="lab:sprout"
          style={{
            position: 'absolute',
            left: SPROUT_AT.x,
            top: SPROUT_AT.y,
            width: SPROUT,
            height: SPROUT,
          }}
        >
          {sprouted ? (
            <ArtStill
              scene="plant"
              width={SPROUT}
              height={SPROUT}
              attrs={{ name: 'clover', stage: 1, color: 'none' }}
            />
          ) : null}
        </TravelAnchor>
        <ChatPaper top={STRIP_H - 24}>
          <BlankBubble width={200} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            <TravelAnchor
              id="lab:photo"
              style={{
                width: PHOTO.width,
                height: PHOTO.height,
                borderRadius: 18,
                overflow: 'hidden',
              }}
            >
              <ArtStill
                scene="snap"
                width={PHOTO.width}
                height={PHOTO.height}
                attrs={{ name: 'picnic' }}
              />
            </TravelAnchor>
            <Press
              onPress={toggle}
              radius={22}
              accessibilityLabel={t('motionLab.dew')}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: left ? palette.dewdropTint : palette.card,
              }}
            >
              <TravelAnchor id="lab:dewdrop">
                <ArtStill scene="icon" width={30} height={30} attrs={{ name: 'dewdrop' }} />
              </TravelAnchor>
            </Press>
          </View>
          <BlankBubble width={240} />
        </ChatPaper>
      </LabStage>
      <LabNotes
        hint={t('motionLab.dew.hint')}
        actions={[{ label: t('motionLab.dew'), onPress: toggle }]}
      />
    </View>
  );
}
