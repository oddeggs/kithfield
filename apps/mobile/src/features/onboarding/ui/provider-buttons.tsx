import { day, pill, sizes } from '@kithfield/theme';
import { Image } from 'expo-image';
import { View } from 'react-native';

import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import googleKit from '../../../../assets/brand/google-g.png';

const height = sizes.buttonLarge;
const radius = pill(height);

/** Apple's own logo, U+F8FF in the system font: it takes the label's size, weight and colour. */
const APPLE_LOGO = '';

/**
 * The brands' colours, which their rules fix: Apple's button is black or white, never tinted,
 * and Google's G sits on white whatever the appearance.
 */
const brand = {
  black: '#000000',
  white: '#ffffff',
  googleBorder: 'rgba(42,34,29,.18)',
} as const;

/** The G as Google draws it, 20 points square. */
const G_SIZE = 20;
/**
 * Google's kit ships the G only inside its 44-point icon button, a white square with the G in
 * its middle 20 points. The file is bundled as Google made it; this frame shows just the G.
 */
const KIT_SIZE = 44;
const KIT_INSET = (KIT_SIZE - G_SIZE) / 2;

interface ProviderButtonProps {
  readonly onPress: () => void;
}

/** The surface every way-in button shares with the large `Button`: 56 tall, a pill, 18 aside. */
const shape = {
  minHeight: height,
  borderRadius: radius,
  paddingHorizontal: 18,
  // Room above and below a label that wraps at the accessibility sizes, so the button grows.
  paddingVertical: 10,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

const row = { flexDirection: 'row', alignItems: 'center', gap: 8 } as const;

/**
 * A label that wraps at the accessibility sizes fills the row, so its lines start at the logo:
 * the logo and the words stay together. On one line the row is just as wide as its content.
 */
const labelStyle = { flexShrink: 1, textAlign: 'left' } as const;

/**
 * Sign in with Apple, drawn as Apple's rules for a custom button ask: the logo glyph before the
 * label in one type style, black by day and white at night so it stands off the night sky.
 */
export function AppleSignInButton({ onPress }: ProviderButtonProps) {
  const { t } = useLocale();
  const { appearance } = useTheme();
  const label = t('onboarding.signIn.apple');
  const fill = appearance === 'night' ? brand.white : brand.black;
  const ink = appearance === 'night' ? brand.black : brand.white;
  return (
    <Press
      onPress={onPress}
      radius={radius}
      accessibilityLabel={label}
      style={[shape, { backgroundColor: fill }]}
    >
      <View style={row}>
        <Txt variant="button" color={ink} importantForAccessibility="no">
          {APPLE_LOGO}
        </Txt>
        <Txt variant="button" color={ink} style={labelStyle}>
          {label}
        </Txt>
      </View>
    </Press>
  );
}

/** Sign in with Google: white in both appearances, with Google's G before the label. */
export function GoogleSignInButton({ onPress }: ProviderButtonProps) {
  const { t } = useLocale();
  const label = t('onboarding.signIn.google');
  return (
    <Press
      onPress={onPress}
      radius={radius}
      accessibilityLabel={label}
      style={[
        shape,
        { backgroundColor: brand.white, borderWidth: 1, borderColor: brand.googleBorder },
      ]}
    >
      <View style={row}>
        <View style={{ width: G_SIZE, height: G_SIZE, overflow: 'hidden' }}>
          <Image
            source={googleKit}
            style={{
              position: 'absolute',
              left: -KIT_INSET,
              top: -KIT_INSET,
              width: KIT_SIZE,
              height: KIT_SIZE,
            }}
            accessible={false}
          />
        </View>
        <Txt variant="button" color={day.ink} style={labelStyle}>
          {label}
        </Txt>
      </View>
    </Press>
  );
}
