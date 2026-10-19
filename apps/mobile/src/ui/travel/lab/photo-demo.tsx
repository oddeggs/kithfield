import { useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ArtStill } from '../../art/art-view';
import { useLocale } from '../../locale/locale-provider';
import { fadeTo } from '../../motion/motion';
import { Press } from '../../motion/press';
import { TravelAnchor, TravelSpot } from '../anchors';
import type { SpriteSpec } from '../sprite';
import { timing } from '../timings';
import { useTravel } from '../travel-host';
import { BlankBubble, ChatPaper, LabNotes, LabStage, STAGE_W, useLabFlight } from './kit';

const H = 600;
const BUBBLE = { width: 220, height: 150 };
const FULL = { width: STAGE_W, height: 260 };
const FULL_TOP = (H - FULL.height) / 2;
const SNAP = { width: 180, height: 130 };
const PAGE = { x: 24, y: 40, width: STAGE_W - 48, height: H - 80 };
/** The page's photos, fanned as the storyboard lays them, and the flower pressed between. */
const FAN = [
  { name: 'picnic', x: 60, y: 120 },
  { name: 'river', x: 110, y: 190 },
  { name: 'garden', x: 160, y: 260 },
] as const;
const STACK = { x: STAGE_W / 2 - SNAP.width / 2, y: 420, width: SNAP.width, height: SNAP.height };
const FLOWER = { width: 240, height: 320 };
const viewer = timing('photo', 'viewer');
const pressing = timing('photo', 'pressing');

const snapArt = (name: string, size: { width: number; height: number }): SpriteSpec => ({
  scene: 'snap',
  attrs: { name },
  ...size,
});

/**
 * A photo opens full screen from its bubble and closes back into it; after a hangout its photos
 * fan out on a page, and the page closes on a pressed flower.
 */
export function PhotoDemo() {
  const { t } = useLocale();
  const { go, current } = useLabFlight();
  const { fly } = useTravel();
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const dark = useSharedValue(0);
  const page = useSharedValue(0);
  const flower = useSharedValue(0);
  const darkStyle = useAnimatedStyle(() => ({ opacity: dark.get() }));
  const pageStyle = useAnimatedStyle(() => ({ opacity: page.get() }));
  const flowerStyle = useAnimatedStyle(() => ({ opacity: flower.get() }));

  const toggle = () => {
    if (current.current) return current.current.reverse();
    if (!open) {
      setOpen(true);
      dark.set(fadeTo(1));
      go({
        from: 'lab:bubble-photo',
        to: 'lab:full-photo',
        sprite: snapArt('dusk', FULL),
        arc: 0,
        durationMs: viewer,
      });
      return;
    }
    setOpen(false);
    dark.set(fadeTo(0));
    go({
      from: 'lab:full-photo',
      to: 'lab:bubble-photo',
      sprite: snapArt('dusk', FULL),
      arc: 0,
      durationMs: viewer,
    });
  };

  const press = () => {
    if (pressed) {
      setPressed(false);
      page.set(fadeTo(0));
      flower.set(fadeTo(0));
      return;
    }
    setPressed(true);
    page.set(fadeTo(1));
    FAN.forEach((f, i) => {
      // Out of the stack, fanned on the page, then gathered as the page closes.
      fly({
        from: 'lab:stack',
        to: `lab:fan:${i}`,
        sprite: snapArt(f.name, SNAP),
        arc: 30,
        delayMs: i * 90,
        durationMs: pressing * 0.3,
        holdMs: pressing * 0.2,
        onLanded: () =>
          fly({
            from: `lab:fan:${i}`,
            to: 'lab:stack',
            sprite: snapArt(f.name, SNAP),
            toWidth: SNAP.width * 0.3,
            arc: 0,
            fade: 'out',
            durationMs: pressing * 0.25,
            ...(i === FAN.length - 1 ? { onTouchdown: () => flower.set(fadeTo(1)) } : {}),
          }),
      });
    });
  };

  return (
    <View>
      <LabStage height={H}>
        <ChatPaper top={0}>
          <BlankBubble width={200} />
          <Press
            onPress={toggle}
            radius={18}
            darken={false}
            accessibilityLabel={t('motionLab.photo')}
          >
            <TravelAnchor
              id="lab:bubble-photo"
              style={{
                width: BUBBLE.width,
                height: BUBBLE.height,
                borderRadius: 18,
                overflow: 'hidden',
              }}
            >
              <ArtStill
                scene="snap"
                width={BUBBLE.width}
                height={BUBBLE.height}
                attrs={{ name: 'dusk' }}
              />
            </TravelAnchor>
          </Press>
          <BlankBubble width={240} />
        </ChatPaper>
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              backgroundColor: '#17151c',
            },
            darkStyle,
          ]}
        >
          <Press
            onPress={toggle}
            darken={false}
            style={{ flex: 1 }}
            accessibilityLabel={t('motionLab.photo')}
          >
            <TravelAnchor
              id="lab:full-photo"
              style={{
                position: 'absolute',
                left: 0,
                top: FULL_TOP,
                width: FULL.width,
                height: FULL.height,
              }}
            >
              {open ? (
                <ArtStill
                  scene="snap"
                  width={FULL.width}
                  height={FULL.height}
                  attrs={{ name: 'dusk' }}
                />
              ) : null}
            </TravelAnchor>
          </Press>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: PAGE.x,
              top: PAGE.y,
              width: PAGE.width,
              height: PAGE.height,
              borderRadius: 22,
              backgroundColor: '#fbf4e6',
              boxShadow: '0 10px 30px -12px rgba(60,40,20,.4)',
              alignItems: 'center',
              justifyContent: 'center',
            },
            pageStyle,
          ]}
        >
          <Animated.View style={flowerStyle}>
            <ArtStill
              scene="pressed"
              width={FLOWER.width}
              height={FLOWER.height}
              attrs={{ name: 'daisy' }}
            />
          </Animated.View>
        </Animated.View>
        <TravelSpot id="lab:stack" box={STACK} />
        {FAN.map((f, i) => (
          <TravelSpot
            key={f.name}
            id={`lab:fan:${i}`}
            box={{ x: f.x, y: f.y, width: SNAP.width, height: SNAP.height }}
          />
        ))}
      </LabStage>
      <LabNotes
        hint={t('motionLab.photo.hint')}
        actions={[
          { label: t('motionLab.photo'), onPress: toggle },
          { label: t('motionLab.photo.press'), onPress: press },
        ]}
      />
    </View>
  );
}
