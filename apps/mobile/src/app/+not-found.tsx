import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { ArtStill } from '../ui/art/art-view';
import { EmptyState } from '../ui/components/state-shell';
import { useLocale } from '../ui/locale/locale-provider';
import { useTheme } from '../ui/theme/theme-provider';

/** A link to somewhere the app doesn't have: back to the farm. */
export default function NotFound() {
  const { palette } = useTheme();
  const { t } = useLocale();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <EmptyState
        art={<ArtStill scene="spot" width={300} height={216} attrs={{ name: 'offline' }} />}
        title={t('shell.notFound.title')}
        body={t('shell.notFound.body')}
        action={{
          label: t('shell.notFound.action'),
          icon: 'farm',
          kind: 'primary',
          onPress: () => router.replace('/farm'),
        }}
      />
    </View>
  );
}
