import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ArtIcon } from '../../../ui/art/art-view';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useSignOut } from '../../../ui/session/sign-out';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { useSettingsApi } from '../api/use-api';
import { useKitColors } from '../kit/colors';
import { SheetButtons, SheetPage } from '../kit/sheet-page';
import { KText } from '../kit/text';
import { useRemote } from '../use-remote';

/**
 * Signing out of this phone. Writes still waiting are sent first; any that can't be are named
 * before they are left behind. Then the session ends and the phone forgets its copy.
 */
export function SignOutSheet() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const toast = useToast();
  const signOutPhone = useSignOut();
  const api = useSettingsApi();
  const me = useRemote(() => api.me());
  const [unsent, setUnsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const anonymous = me.data !== null && me.data.signIn.length === 0;

  const signOut = async (force: boolean) => {
    setBusy(true);
    try {
      const result = await signOutPhone({ anyway: force });
      // Signed out, the data layer starts again from nothing and the app opens on the way in.
      if (result.status === 'unsent') setUnsent(true);
    } catch {
      toast.show(t('settings.failed'));
    } finally {
      setBusy(false);
    }
  };

  const note = unsent
    ? t('settings.signOut.unsent')
    : anonymous
      ? t('settings.signOut.anonymous')
      : t('settings.signOut.key');

  return (
    <SheetPage
      footer={
        <SheetButtons
          primary={unsent ? t('settings.signOut.anyway') : t('settings.signOut.action')}
          primaryKind="destructive"
          onPrimary={() => void signOut(unsent)}
          busy={busy}
          secondary={t('settings.cancel')}
          onSecondary={() => router.back()}
        />
      }
    >
      <Txt variant="displayM" multiline accessibilityRole="header" style={{ lineHeight: 29.1 }}>
        {t('settings.signOut.title')}
      </Txt>
      <KText kind="sheetBody" multiline color={palette.body}>
        {t('settings.signOut.body')}
      </KText>
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          alignItems: 'center',
          padding: 12,
          borderRadius: 16,
          backgroundColor: palette.card,
        }}
      >
        <ArtIcon name="key" size={24} color={palette.text} />
        <KText kind="card" multiline color={kit.body2} style={{ flex: 1, lineHeight: 18.9 }}>
          {note}
        </KText>
      </View>
    </SheetPage>
  );
}
