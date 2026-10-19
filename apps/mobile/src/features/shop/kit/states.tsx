import { View } from 'react-native';

import { ArtStill } from '../../../ui/art/art-view';
import { ErrorState } from '../../../ui/components/state-shell';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { SText } from './text';

/** While the shop's first answer is on its way: one quiet line where the content goes. */
export function ShopLoading() {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <View style={{ paddingVertical: 24, alignItems: 'center' }} accessibilityLiveRegion="polite">
      <SText f="hand" s={17} lh={1.1} color={palette.secondary}>
        {t('shop.loading')}
      </SText>
    </View>
  );
}

/** The shop couldn't load (offline, or the server didn't answer), with a way to try again. */
export function ShopFailed({ onRetry }: { readonly onRetry: () => void }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ErrorState
        art={<ArtStill scene="spot" width={300} height={216} attrs={{ name: 'offline' }} />}
        title={t('shop.offline.title')}
        body={t('shop.offline.body')}
        action={{ label: t('shop.offline.retry'), onPress: onRetry }}
      />
    </View>
  );
}
