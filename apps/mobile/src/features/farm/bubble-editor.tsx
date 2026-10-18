import { LIMITS, type FarmId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { fontFor, type } from '@kithfield/theme';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarmView, useSend } from '../../data';
import { Button } from '../../ui/components/button';
import { Card } from '../../ui/components/card';
import { Chip } from '../../ui/components/chip';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { Press } from '../../ui/motion/press';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { useNow } from './use-now';

const IDEAS = [
  'farm.bubble.idea.coast',
  'farm.bubble.idea.walk',
  'farm.bubble.idea.sleepy',
] as const;

/** A status as the farm takes it: 1 to 40 characters, not only spaces. */
export const validStatus = (text: string) =>
  text.trim().length > 0 && text.trim().length <= LIMITS.status;

/**
 * Your bubble: a status over your critter for 24 hours, 40 characters at most, written
 * with the `status` command. Clearing it writes the same command with no words.
 */
export function BubbleEditor({ farm }: { readonly farm: FarmId }) {
  const { t, fontLocale } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const now = useNow();
  const me = useSession().person?.id ?? null;
  const view = useFarmView<FarmView>(farm, now);
  const send = useSend(farm);
  const current = view?.critters.find((c) => c.person === me)?.status ?? null;
  const [text, setText] = useState(current ?? '');
  // The farm is read from the phone a moment after the sheet opens: show your bubble once it is.
  const shown = useRef(current !== null);
  useEffect(() => {
    if (shown.current || current === null) return;
    shown.current = true;
    setText((typed) => (typed === '' ? current : typed));
  }, [current]);
  const [busy, setBusy] = useState(false);

  const write = async (words: string | null) => {
    if (busy) return;
    setBusy(true);
    const result = await send('status', { status: 'words', text: words });
    setBusy(false);
    if (result.status === 'refused') {
      toast.show(t('farm.bubble.failed'));
      return;
    }
    haptics.soft();
    router.back();
  };

  const font = fontFor({ ...type.handL, size: 21, lineHeight: 25 }, fontLocale);
  return (
    // The keyboard lifts the button with it.
    <KeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1, paddingHorizontal: 20, paddingTop: 26, gap: 12 }}
    >
      <Txt variant="displayM" accessibilityRole="header">
        {t('farm.bubble.title')}
      </Txt>
      <Card style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          maxLength={LIMITS.status}
          placeholder={t('farm.bubble.placeholder')}
          placeholderTextColor={palette.placeholder}
          selectionColor={palette.go.bg}
          accessibilityLabel={t('farm.bubble.edit')}
          returnKeyType="done"
          onSubmitEditing={() => validStatus(text) && void write(text.trim())}
          style={[font, { color: palette.text, paddingVertical: 0 }]}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Txt variant="caption" style={{ fontSize: 13 }} color={palette.secondary}>
            {t('farm.bubble.meta')}
          </Txt>
          {current ? (
            <Press
              onPress={() => void write(null)}
              darken={false}
              accessibilityRole="button"
              hitSlop={12}
            >
              <Txt variant="caption" style={{ fontSize: 13 }} color={palette.secondary}>
                {t('farm.bubble.clear')}
              </Txt>
            </Press>
          ) : null}
        </View>
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {IDEAS.map((idea) => (
          <Chip key={idea} label={t(idea)} kind="suggestion" onPress={() => setText(t(idea))} />
        ))}
      </View>
      <View style={{ marginTop: 'auto', marginBottom: Math.max(insets.bottom, 20) }}>
        <Button
          label={t('farm.bubble.float')}
          disabled={!validStatus(text) || busy}
          onPress={() => void write(text.trim())}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
