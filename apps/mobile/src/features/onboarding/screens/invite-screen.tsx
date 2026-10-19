import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '../../../ui/components/button';
import { TextField } from '../../../ui/components/text-field';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../../ui/type/accessibility-size';
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
  const ax = useAccessibilitySize();
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  /** What was pasted: its farm link, or the text as it is. */
  const pasted = (text: string) => {
    setLink(inviteLinkIn(text) ?? text.trim());
    setError(null);
  };
  // Read only when the person taps Paste (iOS asks whether to allow it), never as the sheet opens.
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

  const field = (
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
  );
  const paste = <Button label={t('onboarding.invite.paste')} kind="text" onPress={pasteByTap} />;
  const title = (
    <>
      <Txt variant="sheetTitle" accessibilityRole="header">
        {t('onboarding.invite.title')}
      </Txt>
      <Body>{t('onboarding.invite.body')}</Body>
    </>
  );
  const end = (
    <>
      <ErrorLine text={error} />
      <Button label={t('onboarding.invite.open')} onPress={open} disabled={link.trim() === ''} />
    </>
  );

  if (ax) {
    // The sheet keeps its height; at the accessibility sizes its words scroll inside it, and the
    // field and Paste stack.
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: palette.sheet }}
        contentContainerStyle={{ padding: 24, paddingTop: 28, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        {title}
        {field}
        <View style={{ alignItems: 'flex-start' }}>{paste}</View>
        {end}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.sheet, padding: 24, paddingTop: 28, gap: 12 }}>
      {title}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>{field}</View>
        {paste}
      </View>
      {end}
    </View>
  );
}
