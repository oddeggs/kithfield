import type { ConfigContext, ExpoConfig } from 'expo/config';

// The catalogue files themselves: the config runs in Node, outside Metro, so the path names the file.
import { systemPermissionsEn } from '../../packages/i18n/src/system-permissions.en.ts';
import { systemPermissionsVi } from '../../packages/i18n/src/system-permissions.vi.ts';

/** Two environments, dev and prd, installed side by side. */
export type AppVariant = 'dev' | 'prd';

export interface VariantConfig {
  name: string;
  bundleIdentifier: string;
  /** Shared by the app and its extensions (widgets, share, Live Activity). */
  appGroup: string;
  scheme: string;
  /** Hosts universal links and the API: one host per environment. */
  host: string;
  /** The Google OAuth client for iOS; the API accepts its ID tokens (`GOOGLE_IOS_CLIENT_ID`). */
  googleIosClientId: string;
}

/** The `kithfield` project on the `kithfield` Expo account: https://expo.dev/accounts/kithfield/projects/kithfield */
export const EAS_PROJECT_ID = 'cb527a7c-d45c-4e14-98ca-5ecc3c3affaa';
const IOS_DEPLOYMENT_TARGET = '17.0';

/** The theme's embedded fonts, by PostScript name; each is also its file name. */
export const FONTS = [
  'YoungSerif-Regular',
  'Gaegu-Bold',
  'PatrickHand-Regular',
  'Lora-Regular',
  'Lora-SemiBold',
].map((name) => `../../packages/theme/fonts/${name}.ttf`);

/** Bundle ids are placeholders until the Apple developer team registers them. */
export const VARIANTS: Record<AppVariant, VariantConfig> = {
  dev: {
    name: 'Kithfield Dev',
    bundleIdentifier: 'com.kithfield.app.dev',
    appGroup: 'group.com.kithfield.app.dev',
    scheme: 'kithfield-dev',
    host: 'dev.kithfield.com',
    googleIosClientId: '564934268570-n2lmcq3r3vc060p5hsankdnisfnalk0v.apps.googleusercontent.com',
  },
  prd: {
    name: 'Kithfield',
    bundleIdentifier: 'com.kithfield.app',
    appGroup: 'group.com.kithfield.app',
    scheme: 'kithfield',
    host: 'kithfield.com',
    googleIosClientId: '564934268570-jr7d94ci3jtb88sm4uqio1pjoatb3l31.apps.googleusercontent.com',
  },
};

/** Unset means dev, for local work; every EAS profile names its variant. */
export function resolveVariant(raw: string | undefined): AppVariant {
  if (!isSet(raw)) return 'dev';
  if (raw === 'dev' || raw === 'prd') return raw;
  throw new Error(`APP_VARIANT must be dev or prd, not "${raw}"`);
}

/** Settings read from the environment; unset or empty means the variant's default. */
export interface BuildEnv {
  /** Points the app at another API, such as `wrangler dev` on this Mac. */
  apiBase: string | undefined;
}

const isSet = (value: string | undefined): value is string => value !== undefined && value !== '';

/** Google sends its OAuth sheet back to the client id's reversed form, a URL scheme the app claims. */
export function googleRedirectScheme(clientId: string): string {
  return `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/, '')}`;
}

type PermissionKey = keyof typeof systemPermissionsEn;

/** The Info.plist usage strings, keyed by plist key, in one language. */
function usageStrings(copy: Record<PermissionKey, string>) {
  return {
    NSCameraUsageDescription: copy['systemPermissions.camera'],
    NSMicrophoneUsageDescription: copy['systemPermissions.microphone'],
    NSPhotoLibraryUsageDescription: copy['systemPermissions.photos'],
    NSPhotoLibraryAddUsageDescription: copy['systemPermissions.photosAdd'],
    NSFaceIDUsageDescription: copy['systemPermissions.faceId'],
    NSContactsUsageDescription: copy['systemPermissions.contacts'],
    NSLocationWhenInUseUsageDescription: copy['systemPermissions.location'],
    NSCalendarsWriteOnlyAccessUsageDescription: copy['systemPermissions.calendar'],
  };
}

/** English is the base Info.plist; Vietnamese goes in `vi.lproj/InfoPlist.strings`. */
export const USAGE = usageStrings(systemPermissionsEn);

/**
 * Native modules' config plugins. Each permission string is given to every plugin that can write
 * it, so plugin order never decides which text wins. Ask only for what a screen uses: no
 * background location, no full calendar or reminders access.
 */
const PERMISSION_PLUGINS: NonNullable<ExpoConfig['plugins']> = [
  ['expo-notifications', { enableRemoteNotifications: true }],
  [
    'expo-camera',
    {
      cameraPermission: USAGE.NSCameraUsageDescription,
      microphonePermission: USAGE.NSMicrophoneUsageDescription,
      barcodeScannerEnabled: true,
      recordAudioAndroid: false,
    },
  ],
  [
    'expo-image-picker',
    {
      photosPermission: USAGE.NSPhotoLibraryUsageDescription,
      cameraPermission: USAGE.NSCameraUsageDescription,
      microphonePermission: USAGE.NSMicrophoneUsageDescription,
    },
  ],
  [
    'expo-media-library',
    {
      photosPermission: USAGE.NSPhotoLibraryUsageDescription,
      savePhotosPermission: USAGE.NSPhotoLibraryAddUsageDescription,
      isAccessMediaLocationEnabled: false,
      // Limited access is a choice, not something to nag about on every launch.
      preventAutomaticLimitedAccessAlert: true,
    },
  ],
  [
    'expo-audio',
    {
      microphonePermission: USAGE.NSMicrophoneUsageDescription,
      enableBackgroundPlayback: false,
      enableBackgroundRecording: false,
    },
  ],
  ['expo-video', { supportsBackgroundPlayback: false, supportsPictureInPicture: false }],
  ['expo-local-authentication', { faceIDPermission: USAGE.NSFaceIDUsageDescription }],
  ['expo-contacts', { contactsPermission: USAGE.NSContactsUsageDescription }],
  [
    'expo-location',
    {
      locationWhenInUsePermission: USAGE.NSLocationWhenInUseUsageDescription,
      locationAlwaysAndWhenInUsePermission: false,
      locationAlwaysPermission: false,
      locationFullAccuracyPermission: false,
      motionUsagePermission: false,
      isIosBackgroundLocationEnabled: false,
      isAndroidBackgroundLocationEnabled: false,
    },
  ],
  [
    'expo-calendar',
    {
      writeOnlyAccess: true,
      writeOnlyCalendarPermission: USAGE.NSCalendarsWriteOnlyAccessUsageDescription,
      calendarPermission: false,
      remindersPermission: false,
    },
  ],
];

/** The app's config for one variant. */
export function buildConfig(
  config: ConfigContext['config'],
  appVariant: AppVariant,
  { apiBase }: BuildEnv,
): ExpoConfig {
  const variant = VARIANTS[appVariant];
  return {
    ...config,
    name: variant.name,
    owner: 'kithfield',
    slug: 'kithfield',
    scheme: variant.scheme,
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    // A build only takes updates made from the same native code.
    runtimeVersion: { policy: 'fingerprint' },
    updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
    ios: {
      bundleIdentifier: variant.bundleIdentifier,
      deploymentTarget: IOS_DEPLOYMENT_TARGET,
      supportsTablet: true,
      associatedDomains: [`applinks:${variant.host}`, `webcredentials:${variant.host}`],
      // Google's OAuth sheet returns here; iOS only, so links and routes keep `scheme`.
      scheme: googleRedirectScheme(variant.googleIosClientId),
      usesAppleSignIn: true,
      config: { usesNonExemptEncryption: false },
      infoPlist: { CFBundleAllowMixedLocalizations: true },
    },
    android: {
      package: variant.bundleIdentifier,
    },
    locales: { vi: { ios: usageStrings(systemPermissionsVi) } },
    plugins: [
      'expo-router',
      // The phone's cache of each farm's log and the outbox, encrypted at rest.
      ['expo-sqlite', { useSQLCipher: true }],
      // Fonts are embedded natively so the first frame already has them.
      ['expo-font', { fonts: FONTS }],
      ...PERMISSION_PLUGINS,
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      ...config.extra,
      appVariant,
      apiBase: isSet(apiBase) ? apiBase : `https://${variant.host}/api`,
      appGroup: variant.appGroup,
      googleIosClientId: variant.googleIosClientId,
      eas: { projectId: EAS_PROJECT_ID },
    },
  };
}

// React Native's globals type `process` loosely; this file runs in Node, where each value is a string.
const env = process.env as Partial<Record<string, string>>;

export default ({ config }: ConfigContext): ExpoConfig =>
  buildConfig(config, resolveVariant(env['APP_VARIANT']), { apiBase: env['API_BASE'] });
