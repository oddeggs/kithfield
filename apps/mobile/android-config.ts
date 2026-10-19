import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import type { ExpoConfig } from 'expo/config';
import {
  AndroidConfig,
  type ConfigPlugin,
  withAndroidColors,
  withAndroidStyles,
  withDangerousMod,
} from 'expo/config-plugins';

// The catalogue files themselves: the config runs in Node, outside Metro, so the path names the file.
import { surfacesEn } from '../../packages/i18n/src/surfaces.en.ts';
import { surfacesVi } from '../../packages/i18n/src/surfaces.vi.ts';
import { androidEn } from '../../packages/i18n/src/android.en.ts';
import { androidVi } from '../../packages/i18n/src/android.vi.ts';
import { day } from '../../packages/theme/src/colour.ts';

/*
 * The Android app's native config: what the Play build asks for, the links it opens, its
 * notification look, and its home-screen widgets. iOS reads none of it.
 */

/**
 * Permissions the app's screens use. Libraries add more than these; `ANDROID_BLOCKED` takes out
 * what nothing uses, so the Play listing asks for no more than the app needs.
 */
export const ANDROID_PERMISSIONS = [
  'CAMERA',
  'RECORD_AUDIO',
  'READ_CONTACTS',
  'ACCESS_COARSE_LOCATION',
  'POST_NOTIFICATIONS',
  'USE_BIOMETRIC',
  'VIBRATE',
  'MODIFY_AUDIO_SETTINGS',
];

/**
 * Taken out of the merged manifest: calendar access (adding a plan opens the calendar app's own
 * screen), writing contacts, precise location (the lantern only needs the neighbourhood, and the
 * app never reads where the phone is), reading the photo library (photos come through the
 * system's photo picker, which needs no access, and saving needs none on Android 13+), music,
 * the old fingerprint API, and every launcher's badge counter (the house rules: no counts).
 */
export const ANDROID_BLOCKED = [
  'android.permission.READ_CALENDAR',
  'android.permission.WRITE_CALENDAR',
  'android.permission.WRITE_CONTACTS',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.USE_FINGERPRINT',
  'android.permission.READ_APP_BADGE',
  'com.anddoes.launcher.permission.UPDATE_COUNT',
  'com.htc.launcher.permission.READ_SETTINGS',
  'com.htc.launcher.permission.UPDATE_SHORTCUT',
  'com.huawei.android.launcher.permission.CHANGE_BADGE',
  'com.huawei.android.launcher.permission.READ_SETTINGS',
  'com.huawei.android.launcher.permission.WRITE_SETTINGS',
  'com.majeur.launcher.permission.UPDATE_BADGE',
  'com.oppo.launcher.permission.READ_SETTINGS',
  'com.oppo.launcher.permission.WRITE_SETTINGS',
  'com.sec.android.provider.badge.permission.READ',
  'com.sec.android.provider.badge.permission.WRITE',
  'com.sonyericsson.home.permission.BROADCAST_BADGE',
  'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
  'me.everything.badger.permission.BADGE_COUNT_READ',
  'me.everything.badger.permission.BADGE_COUNT_WRITE',
];

/** The web paths iOS opens as universal links (`apps/web/public/.well-known`). */
export const APP_LINK_PATHS = ['/i/', '/vi/i/', '/join/'];

type IntentFilter = NonNullable<NonNullable<ExpoConfig['android']>['intentFilters']>[number];

/**
 * App Links for the variant's host (verified against its `assetlinks.json`), the Google sign-in
 * redirect when the variant has an Android client, and the system share sheet: text, a link, or
 * photos.
 */
export function androidIntentFilters(host: string, googleScheme: string | null): IntentFilter[] {
  const filters: IntentFilter[] = [
    {
      action: 'VIEW',
      autoVerify: true,
      category: ['BROWSABLE', 'DEFAULT'],
      data: APP_LINK_PATHS.map((pathPrefix) => ({ scheme: 'https', host, pathPrefix })),
    },
    { action: 'SEND', category: ['DEFAULT'], data: [{ mimeType: 'text/plain' }] },
    { action: 'SEND', category: ['DEFAULT'], data: [{ mimeType: 'image/*' }] },
    { action: 'SEND_MULTIPLE', category: ['DEFAULT'], data: [{ mimeType: 'image/*' }] },
  ];
  if (googleScheme !== null) {
    filters.push({
      action: 'VIEW',
      category: ['BROWSABLE', 'DEFAULT'],
      data: [{ scheme: googleScheme }],
    });
  }
  return filters;
}

/**
 * The FCM config (`google-services.json`), from the path in `GOOGLE_SERVICES_JSON` so it is never
 * committed. Without it the app builds and runs, without push.
 */
export function googleServicesFile(raw: string | undefined, root: string): string | undefined {
  if (raw === undefined || raw === '') return undefined;
  const path = isAbsolute(raw) ? raw : resolve(root, raw);
  return existsSync(path) ? path : undefined;
}

/** The widgets on the home screen (`14 Platforms`), by the name the task handler draws. */
export const ANDROID_WIDGETS = [
  {
    name: 'Farm',
    label: '@string/widget_farm_label',
    description: surfacesEn['surfaces.native.widget.description'],
    minWidth: '250dp',
    minHeight: '110dp',
    targetCellWidth: 4,
    targetCellHeight: 2,
    maxResizeWidth: '400dp',
    maxResizeHeight: '220dp',
    resizeMode: 'horizontal|vertical',
  },
  {
    name: 'NextPlan',
    label: '@string/widget_nextplan_label',
    description: androidEn['android.widget.nextPlan.description'],
    minWidth: '110dp',
    minHeight: '110dp',
    targetCellWidth: 2,
    targetCellHeight: 2,
    resizeMode: 'none',
  },
  {
    name: 'Dewdrop',
    label: '@string/widget_dewdrop_label',
    description: androidEn['android.widget.dewdrop.description'],
    minWidth: '110dp',
    minHeight: '110dp',
    targetCellWidth: 2,
    targetCellHeight: 2,
    resizeMode: 'none',
  },
] as const;

const WIDGET_LABELS = {
  en: {
    farm: surfacesEn['surfaces.native.widget.name'],
    nextplan: androidEn['android.widget.nextPlan.name'],
    dewdrop: androidEn['android.widget.dewdrop.name'],
  },
  vi: {
    farm: surfacesVi['surfaces.native.widget.name'],
    nextplan: androidVi['android.widget.nextPlan.name'],
    dewdrop: androidVi['android.widget.dewdrop.name'],
  },
};

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, "\\'").replace(/"/g, '\\"');

/** A resource file of strings. */
export function stringsXml(strings: Readonly<Record<string, string>>): string {
  const items = Object.entries(strings)
    .map(([name, value]) => `  <string name="${name}">${escape(value)}</string>`)
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${items}\n</resources>\n`;
}

/** The widget picker's names, in English and Vietnamese, in their own resource files. */
export const withWidgetLabels: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    'android',
    (mod) => {
      const res = join(mod.modRequest.platformProjectRoot, 'app/src/main/res');
      for (const [folder, labels] of [
        ['values', WIDGET_LABELS.en],
        ['values-vi', WIDGET_LABELS.vi],
      ] as const) {
        const dir = join(res, folder);
        mkdirSync(dir, { recursive: true });
        const strings = Object.fromEntries(
          Object.entries(labels).map(([key, value]) => [`widget_${key}_label`, value]),
        );
        writeFileSync(join(dir, 'widget_strings.xml'), stringsXml(strings));
      }
      return mod;
    },
  ]);

/** The notification look: the critter's small white icon, tinted with the farm's moss. */
export const NOTIFICATION_ICON = './assets/icon/android-notification.png';

/**
 * The app theme's accent: the farm's moss on the system's own dialogs (their buttons), the text
 * cursor and selection handles, by day and night alike (`12 States` gives moss no night colour).
 */
export const ACCENT = day.moss;

export const withMossAccent: ConfigPlugin = (config) =>
  withAndroidStyles(
    withAndroidColors(config, (mod) => {
      mod.modResults = AndroidConfig.Colors.assignColorValue(mod.modResults, {
        name: 'colorAccent',
        value: ACCENT,
      });
      return mod;
    }),
    (mod) => {
      mod.modResults = AndroidConfig.Styles.assignStylesValue(mod.modResults, {
        add: true,
        parent: AndroidConfig.Styles.getAppThemeGroup(),
        name: 'colorAccent',
        value: '@color/colorAccent',
      });
      return mod;
    },
  );
