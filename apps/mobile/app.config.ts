import type { ConfigContext, ExpoConfig } from 'expo/config';

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
  },
  prd: {
    name: 'Kithfield',
    bundleIdentifier: 'com.kithfield.app',
    appGroup: 'group.com.kithfield.app',
    scheme: 'kithfield',
    host: 'kithfield.com',
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
      config: { usesNonExemptEncryption: false },
      infoPlist: { CFBundleAllowMixedLocalizations: true },
    },
    android: {
      package: variant.bundleIdentifier,
    },
    plugins: [
      'expo-router',
      // The phone's cache of each farm's log and the outbox, encrypted at rest.
      ['expo-sqlite', { useSQLCipher: true }],
      // Fonts are embedded natively so the first frame already has them.
      ['expo-font', { fonts: FONTS }],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      ...config.extra,
      appVariant,
      apiBase: isSet(apiBase) ? apiBase : `https://${variant.host}/api`,
      appGroup: variant.appGroup,
      eas: { projectId: EAS_PROJECT_ID },
    },
  };
}

// React Native's globals type `process` loosely; this file runs in Node, where each value is a string.
const env = process.env as Partial<Record<string, string>>;

export default ({ config }: ConfigContext): ExpoConfig =>
  buildConfig(config, resolveVariant(env['APP_VARIANT']), { apiBase: env['API_BASE'] });
