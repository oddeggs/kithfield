import { HttpUrl } from '@kithfield/contracts';
import { useState } from 'react';
import { View } from 'react-native';

import { ArtIcon } from '../../ui/art/art-view';
import { Button } from '../../ui/components/button';
import { TextField } from '../../ui/components/text-field';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { useAttach, type AttachFrom } from './attach';
import { useGestureSend } from './send';
import { OverlaySheet } from './ui/overlay-sheet';
import { useOverlayClose } from './ui/presentation';
import { useGestureFarm } from './use-gesture-farm';

/**
 * Attach: photos from the library, the camera, a document from Files (up to 100 MB) or a
 * link. Photos and files go up through the media feature, then into the farm as one `media`
 * write; a link is a `link` write.
 */
export function AttachScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const toast = useToast();
  const g = useGestureFarm();
  const send = useGestureSend(g.farm);
  const attach = useAttach(g.farm);
  const { closing, close } = useOverlayClose();
  const [link, setLink] = useState<string | null>(null);

  const files = async (from: AttachFrom) => {
    if (await attach(from)) close();
  };
  const sendLink = async () => {
    const url = HttpUrl.safeParse(link?.trim() ?? '');
    if (!url.success) {
      toast.show(t('gestures.files.linkInvalid'));
      return;
    }
    if (await send('link', { url: url.data }, { sent: t('gestures.sent.link') })) close();
  };

  const tiles = [
    { icon: 'photo', label: t('gestures.files.photos'), onPress: () => void files('library') },
    {
      icon: 'camera',
      label: t('gestures.files.camera'),
      onPress: () => void files('camera'),
    },
    { icon: 'note', label: t('gestures.files.files'), onPress: () => void files('files') },
    { icon: 'link', label: t('gestures.files.link'), onPress: () => setLink('') },
  ];

  return (
    <OverlaySheet
      closing={closing}
      onClose={() => close()}
      padding={{ top: 10, side: 20, bottom: 0 }}
    >
      <View style={{ gap: 12, marginTop: -2 }}>
        <Txt variant="buttonText" accessibilityRole="header">
          {t('gestures.files.attach')}
        </Txt>
        {link === null ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {tiles.map((tile) => (
              <Press
                key={tile.icon}
                onPress={tile.onPress}
                radius={18}
                accessibilityLabel={tile.label}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 12,
                  borderRadius: 18,
                  backgroundColor: palette.card,
                }}
              >
                <ArtIcon name={tile.icon} size={28} color={palette.text} />
                <Txt variant="bubbleState">{tile.label}</Txt>
              </Press>
            ))}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <TextField
              value={link}
              onChangeText={setLink}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder={t('gestures.files.linkPlaceholder')}
              testID="attach-link"
            />
            <Button
              label={t('gestures.files.linkSend')}
              size="medium"
              disabled={link.trim() === ''}
              onPress={() => void sendLink()}
            />
          </View>
        )}
        <Txt
          variant="note"
          multiline
          color={palette.secondary}
          style={{ fontSize: 12.5, lineHeight: 17.5, marginBottom: 28 }}
        >
          {t('gestures.files.note')}
        </Txt>
      </View>
    </OverlaySheet>
  );
}
