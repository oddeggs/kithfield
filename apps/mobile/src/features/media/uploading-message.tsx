import { radii } from '@kithfield/theme';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { UploadProgress } from './upload-progress';
import { SlowUploadNotice, UploadStatusLine } from './upload-status';
import type { UploadBatch, UploadItem } from './upload-model';

/*
 * A message of photos on its way, as 12-06 draws it on your side of the chat: the grid of tiles
 * with a ring over each item still going, the line under it, and the weak-signal card below when
 * the signal is thin. The chat draws its own bubbles; this is the reference arrangement it can
 * use as it is, or take the pieces from (`UploadProgress`, `UploadStatusLine`, `SlowUploadNotice`).
 */

/** The grid: 240 points wide, two columns, 118-point rows, 3 points apart. */
const GRID_WIDTH = 240;
const ROW = 118;
const GAP = 3;
/** Your bubble's corners: round but the tail. */
const CORNERS = {
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  borderBottomRightRadius: radii.bubbleTail,
  borderBottomLeftRadius: 20,
} as const;

const localTile = (item: UploadItem) => (
  <Image
    source={{ uri: item.uri }}
    contentFit="cover"
    style={{ width: '100%', height: '100%' }}
    transition={120}
  />
);

export function UploadingMessage({
  batch,
  slow,
  onCancel,
  onSendSmaller,
  onWaitForWifi,
  tile = localTile,
}: {
  readonly batch: UploadBatch;
  readonly slow: boolean;
  readonly onCancel: (item: string) => void;
  readonly onSendSmaller: () => void;
  readonly onWaitForWifi?: () => void;
  /** What each tile shows; the file on this phone by default. */
  readonly tile?: (item: UploadItem, index: number) => ReactNode;
}) {
  const single = batch.items.length === 1;
  const width = single ? GRID_WIDTH : (GRID_WIDTH - GAP) / 2;
  const going = batch.phase === 'uploading';
  return (
    // 12 points apart, as the chat spaces its messages.
    <View style={{ gap: 12 }}>
      <View style={{ alignSelf: 'flex-end', alignItems: 'flex-end', gap: 4, maxWidth: 262 }}>
        <View
          style={[
            { width: GRID_WIDTH, flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
            { overflow: 'hidden' },
            CORNERS,
          ]}
        >
          {batch.items.map((item, index) => (
            <View key={item.id} style={{ width, height: single ? ROW * 2 : ROW }}>
              {tile(item, index)}
              {going ? <UploadProgress item={item} onCancel={() => onCancel(item.id)} /> : null}
            </View>
          ))}
        </View>
        {going ? <UploadStatusLine batch={batch} slow={slow} /> : null}
      </View>
      {going && slow ? (
        <SlowUploadNotice
          onSendSmaller={onSendSmaller}
          {...(onWaitForWifi ? { onWaitForWifi } : {})}
        />
      ) : null}
    </View>
  );
}
