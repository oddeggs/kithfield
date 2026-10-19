import { sizes } from '@kithfield/theme';
import { Canvas, Circle, Group, Rect, Skia } from '@shopify/react-native-skia';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { BackHandler, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { announcePolitely } from '../../ui/announce';
import { Button } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { setHintLayer } from './hint-layer';
import { useHint, type Hint } from './hint-store';
import { navBarHeight } from '../../ui/tab-bar/material-bar';
import { tabBarFrame } from '../../ui/tab-bar/tab-bar';

/** The spotlight's ease in and the card's rise (`12 States`, first-run hints). */
const IN_MS = 240;
const RISE = 8;
/** The card's width, the gap to the spotlight, and the arrow's half width, as the design sets them. */
const CARD_W = 230;
const GAP = 10;
const ARROW = 10;

/** What a tip points at: a circle on the screen, in window points. */
export interface Spot {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

const copyOf = {
  critter: 'states.hint.critter',
  message: 'states.hint.message',
  seed: 'states.hint.seed',
} as const satisfies Record<Hint, string>;

interface Measurable {
  measureInWindow(done: (x: number, y: number, width: number, height: number) => void): void;
}

/**
 * A view to point a tip at: put `ref` and `onLayout` on it, and `spot` is the circle round it in
 * the window once it has laid out.
 */
export function useSpotOf(pad = 8): {
  readonly spot: Spot | null;
  readonly ref: RefObject<ComponentRef<typeof View> | null>;
  readonly onLayout: () => void;
} {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const onLayout = () => {
    const view = ref.current as unknown as Measurable | null;
    view?.measureInWindow((x, y, w, h) => {
      if (w === 0 && h === 0) return;
      setSpot({ x: x + w / 2, y: y + h / 2, r: Math.max(w, h) / 2 + pad });
    });
  };
  return { spot, ref, onLayout };
}

/**
 * One first-run tip (`12 States`): the screen dims around a spotlight on what to try, and a card
 * says what it does, with the way on and a way to skip every tip. Shown only while `show` and only
 * when this tip is the next one; never again once seen. Without a spot the card sits low on the
 * screen, pointing at nothing.
 */
export function HintOverlay({
  hint,
  show,
  spot,
  tabBar = false,
}: {
  readonly hint: Hint;
  /** The screen is in front and settled, so the tip can't cover something else. */
  readonly show: boolean;
  readonly spot: Spot | null;
  /** The tip shows over a tab, whose floating bar stays lit. */
  readonly tabBar?: boolean;
}) {
  const state = useHint(hint);
  const visible = show && state.due;
  // Rendered only once its tip is due, so a screen with no tip pays nothing.
  return visible ? <HintCard hint={hint} spot={spot} state={state} tabBar={tabBar} /> : null;
}

function HintCard({
  hint,
  spot,
  state,
  tabBar,
}: {
  readonly hint: Hint;
  readonly spot: Spot | null;
  readonly state: ReturnType<typeof useHint>;
  readonly tabBar: boolean;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const shown = useSharedValue(0);
  const text = t(copyOf[hint]);
  const step = t('states.hint.step', { n: state.n, total: state.total });
  const said = useRef(false);

  useEffect(() => {
    shown.set(
      withTiming(1, {
        duration: IN_MS,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
        reduceMotion: ReduceMotion.Never,
      }),
    );
    if (!said.current) {
      said.current = true;
      announcePolitely(`${step}. ${text}`);
    }
  }, [shown, step, text]);

  const scrim = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const card = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: reduce ? 0 : (1 - shown.get()) * RISE }],
  }));

  // The scrim leaves out the spotlight and, on a tab, the floating tab bar, which stays lit over
  // it as the design layers it.
  const barBottom =
    insets.bottom > 0
      ? insets.bottom - tabBarFrame.liftUnderIndicator
      : tabBarFrame.bottomWithoutIndicator;
  const hole = useMemo(() => {
    if (!spot && !tabBar) return null;
    const b = Skia.PathBuilder.Make();
    if (spot) b.addCircle(spot.x, spot.y, spot.r);
    if (tabBar && Platform.OS === 'android') {
      // Android's navigation bar runs the full width along the bottom edge.
      const bar = navBarHeight(insets.bottom);
      b.addRect({ x: 0, y: height - bar, width, height: bar });
    } else if (tabBar) {
      const r = sizes.tabBar / 2;
      b.addRRect({
        rect: {
          x: tabBarFrame.side,
          y: height - barBottom - sizes.tabBar,
          width: width - tabBarFrame.side * 2,
          height: sizes.tabBar,
        },
        rx: r,
        ry: r,
      });
    }
    return b.build();
  }, [spot, tabBar, width, height, barBottom, insets.bottom]);

  // Wider when the text is large, so the card keeps a few words a line.
  const cardW = fontScale > 1.3 ? width - 32 : CARD_W;
  const below = spot === null ? false : spot.y < height * 0.6;
  const left =
    spot === null
      ? (width - cardW) / 2
      : Math.min(Math.max(spot.x - cardW / 2, 16), width - 16 - cardW);
  const arrowAt = spot === null ? null : Math.min(Math.max(spot.x - left - ARROW, 18), cardW - 38);
  const place =
    spot === null
      ? { bottom: insets.bottom + 120 }
      : below
        ? { top: spot.y + spot.r + GAP }
        : { bottom: height - (spot.y - spot.r - GAP) };

  const arrow = (dir: 'up' | 'down') =>
    arrowAt === null ? null : (
      <View
        style={{
          marginLeft: arrowAt,
          width: 0,
          height: 0,
          borderLeftWidth: ARROW,
          borderRightWidth: ARROW,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          ...(dir === 'up'
            ? { borderBottomWidth: ARROW, borderBottomColor: palette.card }
            : { borderTopWidth: ARROW, borderTopColor: palette.card }),
        }}
      />
    );

  return (
    <Layer onBack={state.ok}>
      <Animated.View
        style={[{ position: 'absolute', left: 0, top: 0, width, height }, scrim]}
        // On Android the screen under the tip keeps its touches: the person can try what it shows.
        pointerEvents={Platform.OS === 'android' ? 'none' : 'auto'}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Canvas style={{ width, height }}>
          {hole ? (
            <Group clip={hole} invertClip>
              <Rect x={0} y={0} width={width} height={height} color={palette.text} opacity={0.55} />
            </Group>
          ) : (
            <Rect x={0} y={0} width={width} height={height} color={palette.text} opacity={0.55} />
          )}
          {spot ? (
            <Circle
              cx={spot.x}
              cy={spot.y}
              r={spot.r}
              style="stroke"
              strokeWidth={2}
              color={palette.card}
              opacity={0.9}
            />
          ) : null}
        </Canvas>
      </Animated.View>
      <Animated.View
        style={[{ position: 'absolute', left, width: cardW, ...place }, card]}
        accessibilityViewIsModal
        onAccessibilityEscape={state.ok}
      >
        {below ? arrow('up') : null}
        <View
          style={{
            borderRadius: 18,
            backgroundColor: palette.card,
            paddingVertical: 12,
            paddingHorizontal: 14,
            gap: 8,
            boxShadow: palette.trayShadow,
          }}
        >
          <Txt variant="handS" color={palette.go.bg} accessibilityRole="header">
            {step}
          </Txt>
          <Txt variant="body" multiline>
            {text}
          </Txt>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Press
              onPress={state.skip}
              darken={false}
              hitSlop={8}
              accessibilityLabel={t('states.hint.skip')}
            >
              <Txt variant="caption" color={palette.secondary}>
                {t('states.hint.skip')}
              </Txt>
            </Press>
            <Button label={t('states.hint.ok')} onPress={state.ok} size="small" haptic="select" />
          </View>
        </View>
        {!below && spot ? arrow('down') : null}
      </Animated.View>
    </Layer>
  );
}

/**
 * The window-wide layer the toasts use, so a tip shows over everything on the screen without
 * presenting anything (an RN `Modal` would hide the screen from VoiceOver and the tab bar's place).
 */
function Layer({
  children,
  onBack,
}: {
  readonly children: ReactNode;
  readonly onBack: () => void;
}) {
  const body = (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {children}
    </View>
  );
  if (Platform.OS === 'ios') return <FullWindowOverlay>{body}</FullWindowOverlay>;
  if (Platform.OS === 'android') return <AndroidLayer onBack={onBack}>{body}</AndroidLayer>;
  return body;
}

/**
 * Android has no window-wide layer above its sheets: the tip goes in the app's own layer over
 * every screen (`HintLayerHost`), which leaves the screen under it its touches, and the back
 * gesture puts it away as "OK" does.
 */
function AndroidLayer({
  children,
  onBack,
}: {
  readonly children: ReactNode;
  readonly onBack: () => void;
}) {
  // Every render: the card's words and place follow the screen.
  useEffect(() => setHintLayer(children));
  useEffect(() => () => setHintLayer(null), []);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => back.remove();
  }, [onBack]);
  return null;
}
