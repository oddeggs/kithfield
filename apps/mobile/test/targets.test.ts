import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from '@jest/globals';
import { APP_GROUP_PATHS } from '@kithfield/contracts';
import { roles } from '@kithfield/theme';

import { buildConfig } from '../app.config';

const root = resolve(__dirname, '..');
const targets = join(root, 'targets');
const unset = { apiBase: undefined, revenueCatIosKey: undefined };

interface TargetConfig {
  type: string;
  bundleIdentifier: string;
  entitlements: Record<string, unknown>;
}

const targetNames = readdirSync(targets, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name);

const targetConfig = (name: string, variant: 'dev' | 'prd'): TargetConfig => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the plugin's config format is CommonJS
  const loaded: unknown = require(join(targets, name, 'expo-target.config.js'));
  return (loaded as (c: unknown) => TargetConfig)(buildConfig({}, variant, unset));
};

describe('the app extensions', () => {
  it('are the widgets, stickers, share and notification extensions', () => {
    expect(targetNames.sort()).toEqual(['notifications', 'share', 'stickers', 'widgets']);
  });

  it('take bundle ids under the app’s and share its App Group, in each variant', () => {
    for (const variant of ['dev', 'prd'] as const) {
      const group: unknown = buildConfig({}, variant, unset).ios?.entitlements?.[
        'com.apple.security.application-groups'
      ];
      for (const name of targetNames) {
        const config = targetConfig(name, variant);
        expect(config.bundleIdentifier).toBe(`.${name}`);
        expect(config.entitlements).toEqual({ 'com.apple.security.application-groups': group });
      }
    }
  });

  it('colour the widgets with the theme’s background, day and night, in sRGB', () => {
    const set = JSON.parse(
      readFileSync(
        join(targets, 'widgets/Assets.xcassets/background.colorset/Contents.json'),
        'utf8',
      ),
    ) as {
      colors: {
        appearances?: unknown[];
        color: { 'color-space': string; components: Record<string, string> };
      }[];
    };
    const hex = ({ red, green, blue }: Record<string, string>) =>
      `#${[red, green, blue].map((c) => (c ?? '').replace(/^0x/, '')).join('')}`.toUpperCase();
    const [day, night] = set.colors;
    expect(day?.color['color-space']).toBe('srgb');
    expect(day && hex(day.color.components)).toBe(roles.background.day);
    expect(night?.appearances).toEqual([{ appearance: 'luminosity', value: 'dark' }]);
    expect(night && hex(night.color.components)).toBe(roles.background.night);
  });

  it('give the Live Activity one type in the app and the widget extension', () => {
    const inApp = readFileSync(join(root, 'modules/surfaces/ios/SurfaceAttributes.swift'), 'utf8');
    const inWidget = readFileSync(join(targets, 'widgets/SurfaceAttributes.swift'), 'utf8');
    expect(inWidget).toBe(inApp);
  });

  it('read the App Group files where the app writes them', () => {
    const swift = readFileSync(join(targets, '_shared/GroupFiles.swift'), 'utf8');
    const path = (name: string) => new RegExp(`static let ${name} = "([^"]+)"`).exec(swift)?.[1];
    expect(path('data')).toBe(APP_GROUP_PATHS.data);
    expect(path('images')).toBe(APP_GROUP_PATHS.images);
    expect(path('shareOutbox')).toBe(APP_GROUP_PATHS.shareOutbox);
  });
});
