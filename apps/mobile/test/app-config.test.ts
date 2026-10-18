import { describe, expect, it } from '@jest/globals';

import { buildConfig, resolveVariant } from '../app.config';

const unset = { easProjectId: undefined, apiBase: undefined };

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

  it('turns updates off and leaves EAS unlinked until a project id is given', () => {
    const unlinked = buildConfig({}, 'prd', unset);
    expect(unlinked.updates?.enabled).toBe(false);
    expect(unlinked.extra?.['eas']).toBeUndefined();

    const id = '00000000-0000-4000-8000-000000000000';
    const linked = buildConfig({}, 'prd', { ...unset, easProjectId: id });
    expect(linked.updates?.url).toBe(`https://u.expo.dev/${id}`);
    expect(linked.extra?.['eas']).toEqual({ projectId: id });
  });

  it('points at another API when API_BASE is set, and at the variant host when it is empty', () => {
    const local = buildConfig({}, 'dev', { ...unset, apiBase: 'http://127.0.0.1:8787/api' });
    expect(local.extra?.['apiBase']).toBe('http://127.0.0.1:8787/api');
    const empty = buildConfig({}, 'dev', { ...unset, apiBase: '' });
    expect(empty.extra?.['apiBase']).toBe('https://dev.kithfield.com/api');
  });
});
