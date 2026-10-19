import { resolve } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { ANDROID_BLOCKED, APP_LINK_PATHS, googleServicesFile, stringsXml } from '../android-config';
import { buildConfig } from '../app.config';

const unset = { apiBase: undefined, revenueCatIosKey: undefined };

describe('the Android app', () => {
  it('opens the same web paths as iOS from its own host, verified as App Links', () => {
    for (const [variant, host] of [
      ['dev', 'dev.kithfield.com'],
      ['prd', 'kithfield.com'],
    ] as const) {
      const filters = buildConfig({}, variant, unset).android?.intentFilters ?? [];
      const links = filters.find((f) => f.autoVerify === true);
      expect(links?.data).toEqual(
        APP_LINK_PATHS.map((pathPrefix) => ({ scheme: 'https', host, pathPrefix })),
      );
    }
    expect(APP_LINK_PATHS).toEqual(['/i/', '/vi/i/', '/join/']);
  });

  it('takes text, links and photos from the share sheet', () => {
    const filters = buildConfig({}, 'dev', unset).android?.intentFilters ?? [];
    const shares = filters.filter((f) => f.action === 'SEND' || f.action === 'SEND_MULTIPLE');
    expect(shares.map((f) => [f.action, f.data])).toEqual([
      ['SEND', [{ mimeType: 'text/plain' }]],
      ['SEND', [{ mimeType: 'image/*' }]],
      ['SEND_MULTIPLE', [{ mimeType: 'image/*' }]],
    ]);
  });

  it('claims the Google redirect only once an Android client exists, and hands the app its id', () => {
    const none = buildConfig({}, 'dev', unset);
    expect(none.extra?.['googleAndroidClientId']).toBeUndefined();
    const schemes = (none.android?.intentFilters ?? []).flatMap((f) =>
      [f.data ?? []].flat().map((d) => d.scheme ?? ''),
    );
    expect(schemes).not.toContain('com.kithfield.app.dev');
    const id = '564934268570-android.apps.googleusercontent.com';
    const set = buildConfig({}, 'dev', { ...unset, googleAndroidClientId: id });
    expect(set.extra?.['googleAndroidClientId']).toBe(id);
    expect(set.android?.intentFilters).toContainEqual(
      expect.objectContaining({ data: [{ scheme: 'com.kithfield.app.dev' }] }),
    );
  });

  it('turns on the back preview, and asks for no badge counts, calendar reads or contact writes', () => {
    const android = buildConfig({}, 'prd', unset).android;
    expect(android?.predictiveBackGestureEnabled).toBe(true);
    expect(android?.blockedPermissions).toEqual(ANDROID_BLOCKED);
    expect(ANDROID_BLOCKED).toEqual(
      expect.arrayContaining([
        'android.permission.READ_CALENDAR',
        'android.permission.WRITE_CONTACTS',
        'me.everything.badger.permission.BADGE_COUNT_WRITE',
      ]),
    );
  });

  it('reads google-services.json from GOOGLE_SERVICES_JSON only when the file is there', () => {
    const root = resolve(__dirname, '..');
    expect(googleServicesFile(undefined, root)).toBeUndefined();
    expect(googleServicesFile('missing/google-services.json', root)).toBeUndefined();
    expect(googleServicesFile('package.json', root)).toBe(resolve(root, 'package.json'));
    const withFile = buildConfig({}, 'dev', { ...unset, googleServicesJson: '/x/g.json' });
    expect(withFile.android?.googleServicesFile).toBe('/x/g.json');
    expect(buildConfig({}, 'dev', unset).android).not.toHaveProperty('googleServicesFile');
  });

  it('hands the app RevenueCat’s Play key when REVENUECAT_ANDROID_KEY is set', () => {
    const set = buildConfig({}, 'prd', { ...unset, revenueCatAndroidKey: 'goog_abc' });
    expect(set.extra?.['revenueCatAndroidKey']).toBe('goog_abc');
    expect(buildConfig({}, 'prd', unset).extra).not.toHaveProperty('revenueCatAndroidKey');
  });

  it('writes resource strings Android can read', () => {
    expect(stringsXml({ widget_farm_label: "Bea’s & Pip's <farm>" })).toBe(
      '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n' +
        '  <string name="widget_farm_label">Bea’s &amp; Pip\\\'s &lt;farm></string>\n</resources>\n',
    );
  });
});
