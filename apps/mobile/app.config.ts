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

const IOS_DEPLOYMENT_TARGET = '17.0';

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
  if (raw === undefined || raw === '') return 'dev';
  if (raw === 'dev' || raw === 'prd') return raw;
  throw new Error(`APP_VARIANT must be dev or prd, not "${raw}"`);
}

/**
 * The app's config for one variant. The EAS project id comes from the environment until the
 * project exists; without it the build is not linked to EAS and takes no over-the-air updates.
 */
export function buildConfig(
  config: ConfigContext['config'],
  appVariant: AppVariant,
  easProjectId: string | undefined,
): ExpoConfig {
  const variant = VARIANTS[appVariant];
  const linked = easProjectId !== undefined && easProjectId !== '';
  return {
    ...config,
    name: variant.name,
    slug: 'kithfield',
    scheme: variant.scheme,
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    ...(linked
      ? {
          runtimeVersion: { policy: 'fingerprint' },
          updates: { url: `https://u.expo.dev/${easProjectId}` },
        }
      : { updates: { enabled: false, checkAutomatically: 'NEVER' } }),
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
    plugins: ['expo-router'],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      ...config.extra,
      appVariant,
      apiBase: `https://${variant.host}/api`,
      appGroup: variant.appGroup,
      ...(linked ? { eas: { projectId: easProjectId } } : {}),
    },
  };
}

// React Native's globals type `process` loosely; this file runs in Node, where each value is a string.
const env = process.env as Partial<Record<string, string>>;

export default ({ config }: ConfigContext): ExpoConfig =>
  buildConfig(config, resolveVariant(env['APP_VARIANT']), env['EAS_PROJECT_ID']);
