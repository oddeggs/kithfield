import { sizes } from '@kithfield/theme';
import { useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ArtIcon } from '../art/art-view';
import { Avatar } from '../art/avatar';
import { Glass } from '../components/glass';
import { HoneyDot } from '../components/honey-dot';
import { useLocale } from '../locale/locale-provider';
import { fadeTo, sheetTo } from '../motion/motion';
import { Press } from '../motion/press';
import { useReduceMotion } from '../motion/reduce-motion';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';
import { tabs, type TabName, type YouCritter } from './tab-activity';

const BAR = sizes.tabBar;
const ITEM = 52;
const SIDE = 6;
const ICON = 26;
/** At the accessibility text sizes the labels hide and the icons stay (`12 States`, largest Dynamic Type). */
const AX_FONT_SCALE = 1.6;

const icons: Record<Exclude<TabName, 'you'>, string> = {
  farm: 'farm',
  chat: 'chat',
  seedbed: 'seeds',
};
const labelKeys = {
  farm: 'shell.tab.farm',
  chat: 'shell.tab.chat',
  seedbed: 'shell.tab.seedBed',
  you: 'shell.tab.you',
} as const;

export interface TabBarViewProps {
  readonly active: TabName;
  readonly dots: Readonly<Record<TabName, boolean>>;
  readonly you: YouCritter | null;
  readonly onPress: (tab: TabName) => void;
  readonly onLongPress?: (tab: TabName) => void;
}

/**
 * The floating glass tab bar (`01 Foundations`; the farm home in `04 Farm and Chat`): 64 tall, four tabs,
 * the active one on a soft pill that springs between tabs, new activity as a honey dot.
 */
export function TabBarView({ active, dots, you, onPress, onLongPress }: TabBarViewProps) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const reduce = useReduceMotion();
  const { fontScale } = useWindowDimensions();
  const showLabels = fontScale < AX_FONT_SCALE;
  const [width, setWidth] = useState(0);
  const itemWidth = width > 0 ? (width - SIDE * 2) / tabs.length : 0;
  const index = tabs.indexOf(active);
  const x = useSharedValue(0);
  const pill = useSharedValue(1);
  const placed = useRef(false);
  useEffect(() => {
    if (itemWidth === 0) return;
    const to = index * itemWidth;
    if (!placed.current) {
      placed.current = true;
      x.set(to);
    } else if (reduce) {
      pill.set(0);
      x.set(to);
      pill.set(fadeTo(1));
    } else {
      x.set(sheetTo(to, false));
    }
  }, [index, itemWidth, reduce, x, pill]);
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
    opacity: pill.get(),
  }));
  const tb = palette.tabBar;
  return (
    <Glass
      radius={BAR / 2}
      fill={tb.fill}
      border={tb.border}
      shadow="0 10px 30px -12px rgba(60,40,20,.35)"
      style={{ height: BAR }}
    >
      <View
        accessibilityRole="tabbar"
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIDE }}
      >
        {itemWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: SIDE,
                width: itemWidth,
                height: ITEM,
                borderRadius: ITEM / 2,
                backgroundColor: tb.activeBg,
              },
              pillStyle,
            ]}
          />
        ) : null}
        {tabs.map((tab) => {
          const focused = tab === active;
          const colour = focused ? palette.tabActive : palette.tabInactive;
          const label = t(labelKeys[tab]);
          return (
            <Press
              key={tab}
              darken={false}
              onPress={() => onPress(tab)}
              {...(onLongPress ? { onLongPress: () => onLongPress(tab) } : {})}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              {...(dots[tab] ? { accessibilityValue: { text: t('shell.tab.somethingNew') } } : {})}
              style={{
                flex: 1,
                height: ITEM,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}
            >
              {tab === 'you' ? (
                you ? (
                  <Avatar kind={you.kind} {...(you.look ? { look: you.look } : {})} size={ICON} />
                ) : (
                  <View
                    style={{
                      width: ICON,
                      height: ICON,
                      borderRadius: ICON / 2,
                      backgroundColor: palette.fillSoft,
                    }}
                  />
                )
              ) : (
                <ArtIcon name={icons[tab]} size={ICON} color={colour} />
              )}
              {showLabels ? (
                <Txt variant="tab" color={colour} allowFontScaling={false} numberOfLines={1}>
                  {label}
                </Txt>
              ) : null}
              {dots[tab] ? <HoneyDot style={{ position: 'absolute', top: 6, right: 22 }} /> : null}
            </Press>
          );
        })}
      </View>
    </Glass>
  );
}
