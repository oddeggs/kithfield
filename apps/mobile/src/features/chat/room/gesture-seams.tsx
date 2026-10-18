import { View } from 'react-native';

import { ArtIcon } from '../../../ui/art/art-view';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import type { BubbleItem } from '../model/timeline';
import { Reactions } from './reactions';

/*
 * Where the gestures feature's pieces plug into the chat: the marks under a message (its
 * `reactionRow()`) and a file in a message (its `FileBubble`). Until they are merged, the chat
 * draws its own.
 */

/** The dewdrops and reactions under a bubble. */
export function ReactionRow({ item }: { readonly item: BubbleItem }) {
  return <Reactions item={item} />;
}

/** The gestures feature's `FileBubbleProps`. */
export interface FileBubbleProps {
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
  readonly mine: boolean;
  /** 0–1 while it goes up. */
  readonly progress?: number;
  readonly mediaKey: string;
}

/** A file in a message: its name and size on a card. */
export function FileBubble({ name, bytes }: FileBubbleProps) {
  const { palette } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={name}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, width: 206 }}
    >
      <ArtIcon name="note" size={28} color={palette.text} />
      <View style={{ flexShrink: 1 }}>
        <Txt variant="rowTitle" numberOfLines={1}>
          {name}
        </Txt>
        <Txt variant="caption" color={palette.secondary}>
          {`${Math.max(1, Math.round(bytes / 1024))} KB`}
        </Txt>
      </View>
    </View>
  );
}
