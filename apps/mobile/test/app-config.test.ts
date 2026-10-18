import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from '@jest/globals';
import { fontFaces } from '@kithfield/theme';
import type { ExportedConfig, ExportedConfigWithProps, InfoPlist } from 'expo/config-plugins';

import { systemPermissionsEn } from '../../../packages/i18n/src/system-permissions.en';
import {
  APPLE_TEAM_ID,
  BACKGROUND_MODES,
  EAS_PROJECT_ID,
  FONTS,
  USAGE,
  buildConfig,
  googleRedirectScheme,
  resolveVariant,
} from '../app.config';

const unset = { apiBase: undefined, revenueCatIosKey: undefined };

describe('app variants', () => {
  it('defaults to dev when APP_VARIANT is unset or empty', () => {
    expect(resolveVariant(undefined)).toBe('dev');
    expect(resolveVariant('')).toBe('dev');
  });

  it('rejects an unknown variant', () => {
    expect(() => resolveVariant('staging')).toThrow('APP_VARIANT');
  });

  it('installs dev and prd side by side under their own bundle ids and hosts', () => {
    const dev = buildConfig({}, 'dev', unset);
    const prd = buildConfig({}, 'prd', unset);
    expect(dev.ios?.bundleIdentifier).toBe('com.kithfield.app.dev');
    expect(prd.ios?.bundleIdentifier).toBe('com.kithfield.app');
    expect(dev.android?.package).toBe('com.kithfield.app.dev');
    expect(dev.scheme).not.toBe(prd.scheme);
    expect(dev.extra?.['apiBase']).toBe('https://dev.kithfield.com/api');
    expect(prd.extra?.['apiBase']).toBe('https://kithfield.com/api');
  });

  it('links every variant to the EAS project and its update channel', () => {
    for (const variant of ['dev', 'prd'] as const) {
      const config = buildConfig({}, variant, unset);
      expect(config.owner).toBe('kithfield');
      expect(config.slug).toBe('kithfield');
      expect(config.extra?.['eas']).toEqual({ projectId: EAS_PROJECT_ID });
      expect(config.updates?.url).toBe(`https://u.expo.dev/${EAS_PROJECT_ID}`);
    }
  });

  it('points at another API when API_BASE is set, and at the variant host when it is empty', () => {
    const local = buildConfig({}, 'dev', { ...unset, apiBase: 'http://127.0.0.1:8787/api' });
    expect(local.extra?.['apiBase']).toBe('http://127.0.0.1:8787/api');
    const empty = buildConfig({}, 'dev', { ...unset, apiBase: '' });
    expect(empty.extra?.['apiBase']).toBe('https://dev.kithfield.com/api');
  });

  it('embeds every theme font natively in both variants', () => {
    const projectRoot = resolve(__dirname, '..');
    expect(FONTS).toEqual(fontFaces.map((f) => `../../packages/theme/fonts/${f.file}`));
    for (const font of FONTS) expect(existsSync(resolve(projectRoot, font))).toBe(true);
    for (const variant of ['dev', 'prd'] as const) {
      expect(buildConfig({}, variant, unset).plugins).toContainEqual([
        'expo-font',
        { fonts: FONTS },
      ]);
    }
  });

  it('claims each variant’s Google redirect scheme on iOS and hands the app its client id', () => {
    const dev = buildConfig({}, 'dev', unset);
    const prd = buildConfig({}, 'prd', unset);
    expect(googleRedirectScheme('123-abc.apps.googleusercontent.com')).toBe(
      'com.googleusercontent.apps.123-abc',
    );
    expect(dev.ios?.scheme).toBe(
      'com.googleusercontent.apps.564934268570-n2lmcq3r3vc060p5hsankdnisfnalk0v',
    );
    expect(prd.ios?.scheme).toBe(
      'com.googleusercontent.apps.564934268570-jr7d94ci3jtb88sm4uqio1pjoatb3l31',
    );
    expect(dev.extra?.['googleIosClientId']).toBe(
      '564934268570-n2lmcq3r3vc060p5hsankdnisfnalk0v.apps.googleusercontent.com',
    );
    expect(prd.extra?.['googleIosClientId']).toBe(
      '564934268570-jr7d94ci3jtb88sm4uqio1pjoatb3l31.apps.googleusercontent.com',
    );
    // Links and routes keep the app's own scheme.
    expect(dev.scheme).toBe('kithfield-dev');
  });

  it('turns on Sign in with Apple, push and silent push in both variants', () => {
    for (const variant of ['dev', 'prd'] as const) {
      const config = buildConfig({}, variant, unset);
      expect(config.ios?.usesAppleSignIn).toBe(true);
      expect(config.plugins).toContainEqual([
        'expo-notifications',
        { enableRemoteNotifications: true, enableBackgroundRemoteNotifications: true },
      ]);
    }
  });

  it('shares each variant’s own App Group with its extensions, signed by one team', () => {
    const dev = buildConfig({}, 'dev', unset);
    const prd = buildConfig({}, 'prd', unset);
    expect(dev.ios?.entitlements).toEqual({
      'com.apple.security.application-groups': ['group.com.kithfield.app.dev'],
    });
    expect(prd.ios?.entitlements).toEqual({
      'com.apple.security.application-groups': ['group.com.kithfield.app'],
    });
    expect(dev.extra?.['appGroup']).toBe('group.com.kithfield.app.dev');
    for (const config of [dev, prd]) {
      expect(config.ios?.appleTeamId).toBe(APPLE_TEAM_ID);
      expect(config.plugins).toContain('@bacons/apple-targets');
    }
  });

  it('keeps the fire room talking in the background, wakes for silent pushes, and allows Live Activities', async () => {
    const config = buildConfig({}, 'dev', unset);
    expect(BACKGROUND_MODES).toEqual(['audio', 'remote-notification']);
    // Whatever modes other plugins leave behind, the app ends up with exactly these.
    const setModes = (config as ExportedConfig).mods?.ios?.infoPlist;
    if (setModes === undefined) throw new Error('No Info.plist change');
    const input = { ios: {}, modResults: { UIBackgroundModes: ['fetch'] }, modRequest: {} };
    const out = await setModes(input as unknown as ExportedConfigWithProps<InfoPlist>);
    expect(out.modResults['UIBackgroundModes']).toEqual(BACKGROUND_MODES);
    expect(config.ios?.infoPlist?.['NSSupportsLiveActivities']).toBe(true);
  });

  it('hands the app RevenueCat’s public key when REVENUECAT_IOS_KEY is set, and null otherwise', () => {
    const keyed = buildConfig({}, 'prd', { ...unset, revenueCatIosKey: 'appl_public' });
    expect(keyed.extra?.['revenueCatIosKey']).toBe('appl_public');
    expect(buildConfig({}, 'prd', unset).extra?.['revenueCatIosKey']).toBeNull();
    expect(
      buildConfig({}, 'dev', { ...unset, revenueCatIosKey: '' }).extra?.['revenueCatIosKey'],
    ).toBeNull();
  });

  it('takes every permission reason from the copy catalogue, in English and Vietnamese', () => {
    const english = Object.values(systemPermissionsEn);
    expect(Object.values(USAGE).sort()).toEqual([...english].sort());
    const config = buildConfig({}, 'dev', unset);
    const vi = (config.locales?.['vi'] as { ios: Record<string, string> }).ios;
    expect(Object.keys(vi).sort()).toEqual(Object.keys(USAGE).sort());
    for (const [key, text] of Object.entries(vi)) {
      expect(text).not.toBe(USAGE[key as keyof typeof USAGE]);
    }
  });

  it('gives every plugin that writes a permission the same reason', () => {
    const plugins = buildConfig({}, 'dev', unset).plugins ?? [];
    const options = (name: string) => {
      const entry = plugins.find((p) => Array.isArray(p) && p[0] === name);
      expect(entry).toBeDefined();
      return (entry as [string, Record<string, unknown>])[1];
    };
    expect(options('expo-camera')).toMatchObject({
      cameraPermission: USAGE.NSCameraUsageDescription,
      microphonePermission: USAGE.NSMicrophoneUsageDescription,
    });
    expect(options('expo-image-picker')).toMatchObject({
      photosPermission: USAGE.NSPhotoLibraryUsageDescription,
      cameraPermission: USAGE.NSCameraUsageDescription,
      microphonePermission: USAGE.NSMicrophoneUsageDescription,
    });
    expect(options('expo-media-library')).toMatchObject({
      photosPermission: USAGE.NSPhotoLibraryUsageDescription,
      savePhotosPermission: USAGE.NSPhotoLibraryAddUsageDescription,
    });
    expect(options('expo-audio')).toMatchObject({
      microphonePermission: USAGE.NSMicrophoneUsageDescription,
    });
    expect(options('expo-local-authentication')).toEqual({
      faceIDPermission: USAGE.NSFaceIDUsageDescription,
    });
    expect(options('expo-contacts')).toEqual({
      contactsPermission: USAGE.NSContactsUsageDescription,
    });
    expect(options('expo-video')).toBeDefined();
    expect(options('@config-plugins/react-native-webrtc')).toEqual({
      cameraPermission: USAGE.NSCameraUsageDescription,
      microphonePermission: USAGE.NSMicrophoneUsageDescription,
    });
  });

  it('asks for location only while in use, and for the calendar only to write', () => {
    const plugins = buildConfig({}, 'dev', unset).plugins ?? [];
    expect(plugins).toContainEqual([
      'expo-location',
      expect.objectContaining({
        locationWhenInUsePermission: USAGE.NSLocationWhenInUseUsageDescription,
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        isIosBackgroundLocationEnabled: false,
      }),
    ]);
    expect(plugins).toContainEqual([
      'expo-calendar',
      expect.objectContaining({
        writeOnlyAccess: true,
        writeOnlyCalendarPermission: USAGE.NSCalendarsWriteOnlyAccessUsageDescription,
        calendarPermission: false,
        remindersPermission: false,
      }),
    ]);
  });
});
