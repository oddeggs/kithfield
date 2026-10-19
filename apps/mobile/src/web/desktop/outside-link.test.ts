import { describe, expect, it } from '@jest/globals';

import { outsideLink } from './outside-link';

const PAGE = 'https://kithfield.com/app/farm/abc';
const out = (href: string) => outsideLink(href, PAGE, '/app');

describe('a link out of the desktop app', () => {
  it('goes to the system browser for http and https pages off the app', () => {
    expect(out('https://kithfield.com/privacy')).toBe('https://kithfield.com/privacy');
    expect(out('https://example.com/a?b=c')).toBe('https://example.com/a?b=c');
    expect(out('http://example.com/')).toBe('http://example.com/');
    expect(out('https://kithfield.com/apples')).toBe('https://kithfield.com/apples');
  });

  it('stays in the window for the app’s own pages', () => {
    expect(out('/app/farm/xyz')).toBeNull();
    expect(out('https://kithfield.com/app')).toBeNull();
    expect(out('settings')).toBeNull();
    expect(outsideLink('/farm/xyz', 'http://localhost:8190/farm/abc', '')).toBeNull();
  });

  it('never hands the system another scheme', () => {
    for (const href of [
      'mailto:hello@kithfield.com',
      'tel:+84000',
      'file:///etc/hosts',
      'blob:https://kithfield.com/1234',
      'data:text/html,hi',
      'javascript:alert(1)',
      'kithfield://farm/1',
    ]) {
      expect(out(href)).toBeNull();
    }
  });

  it('ignores what isn’t an address', () => {
    expect(out('http://')).toBeNull();
  });
});
