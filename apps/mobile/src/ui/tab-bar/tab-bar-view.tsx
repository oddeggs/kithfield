import { sizes } from '@kithfield/theme';
import { useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
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
import { useAccessibilitySize } from '../type/accessibility-size';
import { componentType } from '../type/styles';
import { Txt } from '../type/text';
import type { YouCritter } from './tab-activity';
import { tabs, type TabName } from './tabs';

const BAR = sizes.tabBar;
const ITEM = 52;
const SIDE = 6;
const ICON = 26;
/** Between the icon and its label. */
const LABEL_GAP = 2;

/** How a tab lays out inside the bar: its padding, its icon, and the label line under it. */
export const tabItemFrame = {
  padding: SIDE,
  icon: ICON,
  labelAndGap: componentType.tab.lineHeight + LABEL_GAP,
} as const;

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
  // At the accessibility sizes the labels hide and the icons stay.
  const showLabels = !useAccessibilitySize();
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
      shadow={tb.shadow}
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
              // At accessibility sizes, holding a tab shows its name large, as UIKit's bars do.
              accessibilityShowsLargeContentViewer
              accessibilityLargeContentTitle={label}
              accessibilityState={{ selected: focused }}
              {...(dots[tab] ? { accessibilityValue: { text: t('shell.tab.somethingNew') } } : {})}
              style={{
                flex: 1,
                height: ITEM,
                alignItems: 'center',
                justifyContent: 'center',
                gap: LABEL_GAP,
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
