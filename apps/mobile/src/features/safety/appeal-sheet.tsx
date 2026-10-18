import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput } from 'react-native';

import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { ApiError } from '../settings/api/request';
import { useSafetyApi } from '../settings/api/use-api';
import { SheetButtons, SheetPage } from '../settings/kit/sheet-page';
import { KText } from '../settings/kit/text';

/**
 * Asking for another look: a few words, read within 7 days by someone who
 * wasn't part of the first decision. One appeal per decision.
 */
export function AppealSheet({ action }: { readonly action: string }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const toast = useToast();
  const api = useSafetyApi();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const words = text.trim();
  const send = () => {
    setBusy(true);
    api.appeal({ action, text: words }).then(
      () => {
        haptics.success();
        toast.show(t('safety.appeal.sent'));
        router.back();
      },
      (error: unknown) => {
        setBusy(false);
        toast.show(
          error instanceof ApiError && error.status === 409
            ? t('safety.appeal.already')
            : t('safety.failed'),
        );
      },
    );
  };
  return (
    <SheetPage
      footer={
        <SheetButtons
          primary={t('safety.appeal.send')}
          onPrimary={send}
          busy={busy || words === ''}
          secondary={t('safety.cancel')}
          onSecondary={() => router.back()}
        />
      }
    >
      <Txt variant="displayM" multiline accessibilityRole="header">
        {t('safety.appeal.title')}
      </Txt>
      <KText kind="sheetBody" multiline color={palette.body}>
        {t('safety.appeal.lead')}
      </KText>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={t('safety.appeal.placeholder')}
        placeholderTextColor={palette.placeholder}
        accessibilityLabel={t('safety.appeal.placeholder')}
        multiline
        autoFocus
        maxLength={1000}
        style={{
          minHeight: 120,
          borderRadius: 16,
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.cardBorder,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: palette.text,
          fontSize: 15,
          textAlignVertical: 'top',
        }}
      />
    </SheetPage>
  );
}
