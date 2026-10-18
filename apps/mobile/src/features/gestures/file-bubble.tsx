import { viewDocument } from '@react-native-documents/viewer';
import { radii } from '@kithfield/theme';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ArtIcon } from '../../ui/art/art-view';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { crossTo } from '../../ui/motion/motion';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { iconOf, sizeOf, sortOf } from './model/files';
import { useGestureColours } from './ui/colours';

export interface FileBubbleProps {
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
  readonly mine: boolean;
  /** Upload progress from 0 to 1 while it goes up; absent once it's there. */
  readonly progress?: number;
  /**
   * Where to read the file: a local file while it is yours and fresh, or a short-lived signed
   * read URL (`POST /v1/media/read-urls`) from the media feature.
   */
  readonly resolveUri: () => Promise<string>;
}

/** A local copy of a file to hand to Quick Look or the share sheet. */
async function localCopy(uri: string, name: string): Promise<string> {
  if (uri.startsWith('file:')) return uri;
  const dir = `${FileSystem.cacheDirectory ?? ''}files/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const target = `${dir}${encodeURIComponent(name)}`;
  const { uri: saved } = await FileSystem.downloadAsync(uri, target);
  return saved;
}

/**
 * A file in the chat: its kind's tile, its name and "PDF · 240 KB", and while it goes up a
 * bar that fills continuously. A tap opens it in Quick Look; a long-press offers the share sheet,
 * where "Save to Files" is.
 */
export function FileBubble({ name, mime, bytes, mine, progress, resolveUri }: FileBubbleProps) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const gc = useGestureColours();
  const toast = useToast();
  // The bar fills continuously between progress reports, on the UI thread.
  const filled = useSharedValue(progress ?? 0);
  useEffect(() => {
    if (progress !== undefined) filled.set(crossTo(progress));
  }, [progress, filled]);
  const bar = useAnimatedStyle(() => ({ width: `${filled.get() * 100}%` }));
  const sort = sortOf(mime, name);
  const size = sizeOf(bytes);
  const fg = mine ? palette.bubble.yoursFg : palette.text;
  const line = t('gestures.files.line', {
    sort: t(`gestures.files.sort.${sort}`),
    size: size.value,
    unit: size.unit,
  });

  const openFile = async () => {
    try {
      const uri = await localCopy(await resolveUri(), name);
      await viewDocument({ uri, mimeType: mime });
    } catch {
      toast.show(t('gestures.files.cantOpen'));
    }
  };
  const share = async () => {
    try {
      const uri = await localCopy(await resolveUri(), name);
      await Sharing.shareAsync(uri, { mimeType: mime });
    } catch {
      toast.show(t('gestures.files.cantOpen'));
    }
  };

  return (
    <Press
      {...(progress === undefined
        ? { onPress: () => void openFile(), onLongPress: () => void share() }
        : {})}
      radius={20}
      accessibilityLabel={`${name}, ${line}`}
      accessibilityHint={t('gestures.files.open')}
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        width: 260,
        borderRadius: 20,
        ...(mine
          ? { borderBottomRightRadius: radii.bubbleTail }
          : { borderBottomLeftRadius: radii.bubbleTail }),
        backgroundColor: mine ? palette.bubble.yoursBg : palette.card,
        padding: 10,
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 44,
          height: 52,
          borderRadius: 8,
          backgroundColor: mine ? palette.bubble.yoursFg : palette.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ArtIcon name={iconOf(sort)} size={26} color={palette.text} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt
          variant="rowTitle"
          color={fg}
          numberOfLines={1}
          style={{ fontSize: 14.5, lineHeight: 18.1 }}
        >
          {name}
        </Txt>
        <Txt variant="note" color={fg} style={{ fontSize: 12.5, lineHeight: 16.25, opacity: 0.85 }}>
          {line}
        </Txt>
        {progress !== undefined ? (
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: gc.progressTrack,
              marginTop: 6,
            }}
          >
            <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: fg }, bar]} />
          </View>
        ) : null}
      </View>
    </Press>
  );
}
