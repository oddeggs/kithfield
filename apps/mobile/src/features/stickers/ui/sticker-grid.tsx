import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { Press } from '../../../ui/motion/press';
import { StickerArt } from './sticker';

/** One sticker in a grid: what the art draws, and what it says to VoiceOver. */
export interface GridSticker {
  readonly key: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly label: string;
}

/** Which rows of a grid are on screen, from the scroll view around it. */
export interface Viewport {
  /** The grid's top inside the scroll content, its scroll offset and the scroll view's height. */
  readonly top: number;
  readonly scrollY: number;
  readonly height: number;
}

/** Whether a row spanning `[rowTop, rowTop + rowH]` of the grid shows in the viewport. */
export function rowVisible(viewport: Viewport | null, rowTop: number, rowH: number): boolean {
  if (viewport === null) return true;
  const top = viewport.top + rowTop - viewport.scrollY;
  return top < viewport.height && top + rowH > 0;
}

/**
 * Stickers four to a row, each looping while its row is on screen and held still once scrolled
 * away (its loop is never baked). Tap sends; a long press shows it bigger.
 */
export function StickerGrid({
  stickers,
  size,
  columns = 4,
  rowGap = 4,
  viewport = null,
  hint,
  onPress,
  onLongPress,
}: {
  readonly stickers: readonly GridSticker[];
  readonly size: number;
  readonly columns?: number;
  readonly rowGap?: number;
  readonly viewport?: Viewport | null;
  readonly hint?: string;
  readonly onPress: (key: string) => void;
  readonly onLongPress?: (key: string) => void;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const rows: GridSticker[][] = [];
  for (let i = 0; i < stickers.length; i += columns) rows.push(stickers.slice(i, i + columns));
  const cell = width > 0 ? width / columns : size;
  return (
    <View onLayout={onLayout} style={{ gap: rowGap }}>
      {rows.map((row, r) => {
        const visible = rowVisible(viewport, r * (size + rowGap), size);
        return (
          <View key={row[0]?.key ?? r} style={{ flexDirection: 'row' }}>
            {row.map((s) => (
              <View key={s.key} style={{ width: cell, alignItems: 'center' }}>
                <Press
                  onPress={() => onPress(s.key)}
                  {...(onLongPress ? { onLongPress: () => onLongPress(s.key) } : {})}
                  haptic="soft"
                  darken={false}
                  accessibilityLabel={s.label}
                  {...(hint ? { accessibilityHint: hint } : {})}
                  style={{ width: size, height: size }}
                >
                  <StickerArt attrs={s.attrs} size={size} still={!visible} />
                </Press>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
