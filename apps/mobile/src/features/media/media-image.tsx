import { Image, type ImageContentFit } from 'expo-image';
import { View } from 'react-native';

import type { ViewStyleProp } from '../../ui/style';
import { useMediaUrl, useSignedUrl } from './use-upload';

/**
 * A photo from the farm by its media key: the sender's own copy while it is on the phone, else a
 * signed URL, cached on disk by the key (not the URL, which changes). Fades in as it decodes
 * (120 ms, as 04-14's tiles do).
 */
export function MediaImage({
  mediaKey,
  contentFit = 'cover',
  style,
  accessibilityLabel,
  remoteOnly = false,
}: {
  readonly mediaKey: string;
  readonly contentFit?: ImageContentFit;
  readonly style?: ViewStyleProp;
  readonly accessibilityLabel?: string;
  /** Always through the signed URL, even while the phone holds its own copy. */
  readonly remoteOnly?: boolean;
}) {
  const either = useMediaUrl(remoteOnly ? null : mediaKey);
  const signed = useSignedUrl(remoteOnly ? mediaKey : null);
  const uri = remoteOnly ? signed : either;
  return (
    <View style={style}>
      {uri !== null ? (
        <Image
          // Keyed by the object for signed URLs (they change); a local file is read as it is.
          source={uri.startsWith('http') ? { uri, cacheKey: mediaKey } : { uri }}
          cachePolicy="disk"
          contentFit={contentFit}
          transition={120}
          style={{ width: '100%', height: '100%' }}
          {...(accessibilityLabel ? { accessibilityLabel, accessible: true } : {})}
        />
      ) : null}
    </View>
  );
}
