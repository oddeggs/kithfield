import type { FarmId, Me } from '@kithfield/contracts';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOpenFarm } from '../../data';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { FarmLive } from './farm-live';
import { FarmPanel } from './farm-panel';
import { MessagesPanel, ViewDigest } from './messages-panel';
import { YouPanel } from './you-panel';

/** Holds the chosen farm's socket open while the lab shows it. */
function OpenFarm({ farm }: { readonly farm: FarmId }) {
  useOpenFarm(farm);
  return (
    <>
      <FarmLive farm={farm} />
      <MessagesPanel farm={farm} />
      <ViewDigest farm={farm} />
    </>
  );
}

/**
 * Development only: one farm across phones through the local API, for checking sync by hand. Set
 * a name and critter, plant a farm or move in with a code, then write, dewdrop and cut the
 * network, and compare the farm view's digest across phones.
 */
export function SyncLab() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<Me | null>(null);
  const [farm, setFarm] = useState<FarmId | null>(null);
  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1, backgroundColor: palette.background }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 16,
          gap: 22,
        }}
      >
        <Txt variant="displayM" accessibilityRole="header">
          {t('syncLab.title')}
        </Txt>
        <Txt variant="caption" multiline color={palette.muted}>
          {t('syncLab.subtitle')}
        </Txt>
        <YouPanel me={me} onMe={setMe} />
        <FarmPanel me={me} farm={farm} onFarm={setFarm} />
        {farm ? <OpenFarm key={farm} farm={farm} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
