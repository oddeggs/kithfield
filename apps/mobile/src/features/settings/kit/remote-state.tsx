import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ArtStill } from '../../../ui/art/art-view';
import { Button } from '../../../ui/components/button';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
// The sheet's pencil-dashed rows: the app's one loading look (`12 States`, loading).
import { LOADER_AFTER_MS, PencilRows } from '../../farm/farm-states';
import { remoteView, type RemoteLike } from './remote-view';

/** True once `on` has held for the loader's wait, so a quick answer shows no loader at all. */
function useAfterWait(on: boolean): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!on) {
      setLate(false);
      return;
    }
    const timer = setTimeout(() => setLate(true), LOADER_AFTER_MS);
    return () => clearTimeout(timer);
  }, [on]);
  return on && late;
}

/**
 * What a screen built on fetched details shows before it can show itself: nothing for a quick
 * answer, pencil rows for a slow one, and a quiet "couldn't reach" with Try again when the fetch
 * failed and the phone holds nothing to show instead. Null once every fetch has answered.
 */
export function useRemoteGate(remotes: readonly RemoteLike[]): ReactNode {
  const view = remoteView(remotes);
  const slow = useAfterWait(view === 'loading');
  if (view === 'ready') return null;
  if (view === 'failed') {
    return (
      <LoadFailed
        onRetry={() => {
          for (const r of remotes) if (r.data === null) r.reload();
        }}
      />
    );
  }
  return slow ? (
    <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
      <PencilRows />
    </View>
  ) : (
    <View />
  );
}

/** The quiet failure inside a page: the duck under its cloud, a sentence and Try again. */
export function LoadFailed({ onRetry }: { readonly onRetry: () => void }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 24, gap: 12 }}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <ArtStill scene="spot" width={200} height={144} attrs={{ name: 'error' }} />
      </View>
      <Txt variant="sheetBody" multiline align="center" color={palette.body}>
        {t('settings.loadFailed')}
      </Txt>
      <Button label={t('settings.tryAgain')} onPress={onRetry} kind="secondary" size="medium" />
    </View>
  );
}
