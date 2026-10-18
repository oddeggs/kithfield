import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Press } from '../../../ui/motion/press';
import { ItemArt, type ItemLook } from '../item-art';
import { useInks } from './inks';
import { SText } from './text';

/**
 * An item on a card: its art in a 14-radius tile, then its name and, on the right, a tag or a
 * word (price, "patrons", "yours", "wearing"). Cards are 20-radius on the tile colour.
 */
export function ItemTile({
  look,
  name,
  width,
  artHeight,
  trailing,
  below,
  onPress,
  accessibilityLabel,
  bottomPad = 10,
}: {
  readonly look: ItemLook;
  readonly name: string;
  /** The card's width; the art is 16 narrower. */
  readonly width: number;
  readonly artHeight: number;
  readonly trailing?: ReactNode;
  /** A quiet line under the name (when the cart brings it back). */
  readonly below?: string | undefined;
  readonly onPress?: () => void;
  readonly accessibilityLabel: string;
  readonly bottomPad?: number;
}) {
  const inks = useInks();
  const artWidth = width - 16;
  const body = (
    <>
      <View style={{ height: artHeight, borderRadius: 14, overflow: 'hidden' }}>
        <ItemArt look={look} width={artWidth} height={artHeight} />
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 2,
        }}
      >
        <SText s={13} lh={1.2} w={600} numberOfLines={1} style={{ flexShrink: 1 }}>
          {name}
        </SText>
        {trailing}
      </View>
      {below ? (
        <SText
          s={12.5}
          lh={1.2}
          color={inks.body}
          numberOfLines={1}
          style={{ marginTop: -3, paddingHorizontal: 2 }}
        >
          {below}
        </SText>
      ) : null}
    </>
  );
  const card = {
    width,
    gap: 6,
    borderRadius: 20,
    backgroundColor: inks.tile,
    paddingTop: 8,
    paddingHorizontal: 8,
    paddingBottom: bottomPad,
  } as const;
  return onPress ? (
    <Press
      onPress={onPress}
      radius={20}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={card}
    >
      {body}
    </Press>
  ) : (
    <View style={card} accessible accessibilityLabel={accessibilityLabel}>
      {body}
    </View>
  );
}

/** Two columns of tiles with the design's 10-point gap. */
export function TileGrid({ children }: { readonly children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;
}
