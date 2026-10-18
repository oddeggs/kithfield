import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtLoop } from '../art/art-view';
import { LayeredScene } from '../art/layered-scene';
import { useLocale } from '../locale/locale-provider';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';

/**
 * Full-width scenes: the gate in layers (a still with only what moves looping over it), and a
 * loop too big to draw whole, held still rather than failing.
 */
export function ArtLab() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
    >
      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <Txt variant="displayL" accessibilityRole="header">
          {t('gallery.artLab.title')}
        </Txt>
      </View>
      <LayeredScene scene="gate" width={width} height={610} attrs={{ season: 'autumn' }} />
      <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
        <Txt variant="caption" multiline color={palette.secondary}>
          {t('gallery.artLab.layered')}
        </Txt>
      </View>
      <ArtLoop scene="farm" width={width} height={430} attrs={{ season: 'autumn' }} />
      <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
        <Txt variant="caption" multiline color={palette.secondary}>
          {t('gallery.artLab.held')}
        </Txt>
      </View>
    </ScrollView>
  );
}
