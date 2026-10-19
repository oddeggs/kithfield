import type { ConfigContext, ExpoConfig } from 'expo/config';
import { type ConfigPlugin, withInfoPlist } from 'expo/config-plugins';

// The catalogue files themselves: the config runs in Node, outside Metro, so the path names the file.
import { systemPermissionsEn } from '../../packages/i18n/src/system-permissions.en.ts';
import { systemPermissionsVi } from '../../packages/i18n/src/system-permissions.vi.ts';
import { day } from '../../packages/theme/src/colour.ts';

/**
 * The launch background (`13 Launch`): the farm's paper by day, and at night a warm dark that is
 * never navy, so the first app frame (the farm drawing in on the same paper) takes over unseen.
 */
export const LAUNCH_BACKGROUND = { day: day.paper, night: '#241E26' } as const;

/** Baked from the art by `tools/launch` (`pnpm --filter @kithfield/launch bake -- --only icons`). */
const ICON_DIR = './assets/icon';
const SPLASH_DIR = './assets/splash';

/**
 * The launch screen is the first frame of the farm drawing in: one faint pencil horizon on the
 * paper, full screen (iOS), and on Android 12+ the icon's lit window on the same paper. The app
 * holds it until the farm's first frame has drawn (`SplashScreen.preventAutoHideAsync`).
 */
export const SPLASH_PLUGIN: [string, Record<string, unknown>] = [
  'expo-splash-screen',
  {
    backgroundColor: LAUNCH_BACKGROUND.day,
    ios: {
      // The horizon fills the screen, so it is the storyboard's full-screen image.
      enableFullScreenImage_legacy: true,
      resizeMode: 'cover',
      backgroundColor: LAUNCH_BACKGROUND.day,
      image: `${SPLASH_DIR}/horizon-day.png`,
      tabletImage: `${SPLASH_DIR}/horizon-day-tablet.png`,
      dark: {
        backgroundColor: LAUNCH_BACKGROUND.night,
        image: `${SPLASH_DIR}/horizon-night.png`,
        tabletImage: `${SPLASH_DIR}/horizon-night-tablet.png`,
      },
    },
    android: {
      resizeMode: 'contain',
      imageWidth: 200,
      backgroundColor: LAUNCH_BACKGROUND.day,
      image: `${SPLASH_DIR}/icon-window.png`,
      dark: {
        backgroundColor: LAUNCH_BACKGROUND.night,
        image: `${SPLASH_DIR}/icon-window.png`,
      },
    },
  },
];

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
/** The Apple developer team that signs the app and its extensions. */
export const APPLE_TEAM_ID = 'YFND2EEW8S';
const IOS_DEPLOYMENT_TARGET = '17.0';

/**
 * The theme's embedded fonts, by PostScript name; each is also its file name. Fraunces at three
 * optical sizes and Kithfield Hand set the app's text; Young Serif, Gaegu and Patrick Hand are the
 * art's, which it finds through the system's font manager. The extensions register their copy of
 * Kithfield Hand from the app's bundle.
 */
export const FONTS = [
  'Fraunces18ptSuperSoft-SemiBold',
  'Fraunces36ptSuperSoft-SemiBold',
  'Fraunces72ptSuperSoft-SemiBold',
  'KithfieldHand-Bold',
  'YoungSerif-Regular',
  'Gaegu-Bold',
  'PatrickHand-Regular',
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
  /** RevenueCat's public SDK key for this variant's App Store app (`REVENUECAT_IOS_KEY`). */
  revenueCatIosKey: string | undefined;
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
    // App Store processing requires this key whenever the binary references calendar APIs, even
    // though the app only ever asks for write-only access; it carries the same honest reason.
    NSCalendarsUsageDescription: copy['systemPermissions.calendar'],
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
  // Silent pushes (`SurfaceRefreshData`) wake the app to redraw its widgets and activities.
  [
    'expo-notifications',
    { enableRemoteNotifications: true, enableBackgroundRemoteNotifications: true },
  ],
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
      calendarPermission: USAGE.NSCalendarsUsageDescription,
      remindersPermission: false,
    },
  ],
  // The fire room's voices and lanterns. Android's audio type and permissions belong to the
  // Android build; on iOS the plugin only sets LiveKit up at launch.
  '@livekit/react-native-expo-plugin',
  [
    '@config-plugins/react-native-webrtc',
    {
      cameraPermission: USAGE.NSCameraUsageDescription,
      microphonePermission: USAGE.NSMicrophoneUsageDescription,
    },
  ],
];

/**
 * The app's background modes, all of them: the fire room keeps talking with the app in the
 * background (its Live Activity, picture in picture, AirPods routing), and silent pushes
 * (`SurfaceRefreshData`) wake it to redraw the widgets.
 */
export const BACKGROUND_MODES = ['audio', 'remote-notification'];

/**
 * Sets `UIBackgroundModes` to exactly these. Other plugins add or remove modes as a side effect
 * (`expo-video` drops `audio` when it has no background playback; `expo-task-manager` adds
 * `fetch`, which nothing here uses). Applied before the `plugins` list, so its change runs last.
 */
export const withBackgroundModes: ConfigPlugin<string[]> = (config, modes) =>
  withInfoPlist(config, (plist) => {
    plist.modResults['UIBackgroundModes'] = modes;
    return plist;
  });

/** The app's config for one variant. */
export function buildConfig(
  config: ConfigContext['config'],
  appVariant: AppVariant,
  { apiBase, revenueCatIosKey }: BuildEnv,
): ExpoConfig {
  const variant = VARIANTS[appVariant];
  const app: ExpoConfig = {
    ...config,
    name: variant.name,
    owner: 'kithfield',
    slug: 'kithfield',
    scheme: variant.scheme,
    version: '0.1.0',
    // The flat icon, for the web and Android's legacy launchers.
    icon: `${ICON_DIR}/app-icon.png`,
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    // A build only takes updates made from the same native code.
    runtimeVersion: { policy: 'fingerprint' },
    updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
    ios: {
      // iOS 26 layers from Icon Composer (sky, hill and cottage, glow, critter, with dark
      // overrides); Xcode renders the classic sizes for older iOS from the same document.
      icon: `${ICON_DIR}/Kithfield.icon`,
      bundleIdentifier: variant.bundleIdentifier,
      appleTeamId: APPLE_TEAM_ID,
      deploymentTarget: IOS_DEPLOYMENT_TARGET,
      supportsTablet: true,
      associatedDomains: [`applinks:${variant.host}`, `webcredentials:${variant.host}`],
      // Google's OAuth sheet returns here; iOS only, so links and routes keep `scheme`.
      scheme: googleRedirectScheme(variant.googleIosClientId),
      usesAppleSignIn: true,
      // The extensions in `targets/` (widgets, stickers, share, notifications) read and write it.
      entitlements: { 'com.apple.security.application-groups': [variant.appGroup] },
      config: { usesNonExemptEncryption: false },
      infoPlist: {
        CFBundleAllowMixedLocalizations: true,
        // The plan's day and the fire, on the Lock Screen and in the Dynamic Island.
        NSSupportsLiveActivities: true,
        // Sticker export checks that WhatsApp is there before handing it a pack.
        LSApplicationQueriesSchemes: ['whatsapp'],
      },
    },
    android: {
      package: variant.bundleIdentifier,
      // The composite's view is the launcher's middle 72 dp of the 108 dp canvas.
      adaptiveIcon: {
        foregroundImage: `${ICON_DIR}/android-foreground.png`,
        backgroundImage: `${ICON_DIR}/android-background.png`,
        monochromeImage: `${ICON_DIR}/android-monochrome.png`,
        backgroundColor: LAUNCH_BACKGROUND.day,
      },
    },
    locales: { vi: { ios: usageStrings(systemPermissionsVi) } },
    plugins: [
      'expo-router',
      // The phone's cache of each farm's log and the outbox, encrypted at rest.
      ['expo-sqlite', { useSQLCipher: true }],
      // Fonts are embedded natively so the first frame already has them.
      ['expo-font', { fonts: FONTS }],
      SPLASH_PLUGIN,
      ...PERMISSION_PLUGINS,
      // Links each folder in `targets/` as an extension, signed by the same team.
      '@bacons/apple-targets',
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
      // A public key, read at runtime; left out when unset (purchases are unavailable). Not null:
      // the dev manifest turns a null into `{}`.
      ...(isSet(revenueCatIosKey) ? { revenueCatIosKey } : {}),
      eas: { projectId: EAS_PROJECT_ID },
    },
  };
  return withBackgroundModes(app, BACKGROUND_MODES);
}

// React Native's globals type `process` loosely; this file runs in Node, where each value is a string.
const env = process.env as Partial<Record<string, string>>;

export default ({ config }: ConfigContext): ExpoConfig =>
  buildConfig(config, resolveVariant(env['APP_VARIANT']), {
    apiBase: env['API_BASE'],
    revenueCatIosKey: env['REVENUECAT_IOS_KEY'],
  });
