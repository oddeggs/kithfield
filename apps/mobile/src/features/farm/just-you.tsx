import { View } from 'react-native';

import { ArtIcon } from '../../ui/art/art-view';
import { Button } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { typeAt } from './type-at';

/** The empty cottage spots under the title: one for each friend still to move in. */
const SLOTS = 4;

/**
 * A brand-new farm with only you on it (`12 States`, empty): one sentence on what will grow here,
 * a spot saved for each friend, and one way on. It never counts who is missing.
 */
export function JustYou({ onInvite }: { readonly onInvite: () => void }) {
  const { t, fontLocale } = useLocale();
  const { palette } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <Txt
        variant="displayM"
        multiline
        accessibilityRole="header"
        style={typeAt('displayM', 26, 28.6, fontLocale)}
      >
        {t('states.alone.title')}
      </Txt>
      <Txt
        variant="sheetBody"
        multiline
        color={palette.body}
        style={typeAt('body', 15, 21.3, fontLocale)}
      >
        {t('states.alone.body')}
      </Txt>
      {/* The spots repeat the invite below, so VoiceOver hears it once, on the button. */}
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginVertical: 4,
        }}
      >
        {Array.from({ length: SLOTS }, (_, i) => (
          <Press
            key={i}
            onPress={onInvite}
            haptic="select"
            darken={false}
            style={{ alignItems: 'center', gap: 6 }}
          >
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                borderWidth: 1.6,
                borderStyle: 'dashed',
                borderColor: palette.placeholder,
                opacity: 0.75,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArtIcon name="plus" size={18} color={palette.placeholder} />
            </View>
            <Txt
              variant="handS"
              color={palette.placeholder}
              align="center"
              style={typeAt('handS', 14, 15.4, fontLocale)}
            >
              {t('states.alone.slot')}
            </Txt>
          </Press>
        ))}
      </View>
      <Button label={t('states.alone.invite')} onPress={onInvite} />
    </View>
  );
}
