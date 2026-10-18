import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '../../../ui/components/button';
import { TextField } from '../../../ui/components/text-field';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { inviteCodeIn, inviteLinkIn } from '../invite-code';
import { Body, ErrorLine } from '../kit';

/**
 * "I have an invite": a sheet with one field for the farm link. It reads the clipboard once as it
 * opens (iOS asks whether to allow the paste), and fills the field when a farm link is there.
 */
export function InviteScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { palette } = useTheme();
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  /** What was pasted: its farm link, or the text as it is. */
  const pasted = (text: string) => {
    setLink(inviteLinkIn(text) ?? text.trim());
    setError(null);
  };
  // Read only when the person taps Paste: the system button needs no prompt; the fallback asks.
  const pasteByTap = () => {
    Clipboard.getStringAsync().then(pasted, () => undefined);
  };

  const open = () => {
    const code = inviteCodeIn(link);
    if (!code) {
      setError(t('onboarding.invite.notALink'));
      return;
    }
    router.dismiss();
    router.push({ pathname: '/i/[code]', params: { code } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.sheet, padding: 24, paddingTop: 28, gap: 12 }}>
      <Txt variant="sheetTitle" accessibilityRole="header">
        {t('onboarding.invite.title')}
      </Txt>
      <Body>{t('onboarding.invite.body')}</Body>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        {Clipboard.isPasteButtonAvailable ? (
          <Clipboard.ClipboardPasteButton
            acceptedContentTypes={['plain-text']}
            displayMode="iconAndLabel"
            cornerStyle="capsule"
            backgroundColor={palette.fillSecondary}
            foregroundColor={palette.text}
            onPress={(data) => {
              if (data.type === 'text') pasted(data.text);
            }}
            style={{ height: 36, width: 110 }}
          />
        ) : (
          <Button label={t('onboarding.invite.paste')} kind="text" onPress={pasteByTap} />
        )}
      </View>
      <TextField
        value={link}
        onChangeText={(text) => {
          setLink(text);
          setError(null);
        }}
        placeholder={t('onboarding.invite.placeholder')}
        accessibilityLabel={t('onboarding.invite.field')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={open}
      />
      <ErrorLine text={error} />
      <Button label={t('onboarding.invite.open')} onPress={open} disabled={link.trim() === ''} />
    </View>
  );
}
