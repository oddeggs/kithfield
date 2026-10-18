import { describe, expect, it } from '@jest/globals';

import { deviceTimeZone, hemisphereOf } from './calendar';

describe('a new farm’s calendar', () => {
  it('takes the hemisphere from the region the device is set to', () => {
    expect(hemisphereOf('AU')).toBe('south');
    expect(hemisphereOf('nz')).toBe('south');
    expect(hemisphereOf('VN')).toBe('north');
    expect(hemisphereOf('GB')).toBe('north');
    expect(hemisphereOf(null)).toBe('north');
  });

  it('uses the device’s time zone', () => {
    expect(deviceTimeZone('Asia/Ho_Chi_Minh')).toBe('Asia/Ho_Chi_Minh');
    expect(deviceTimeZone(null)).toEqual(expect.any(String));
  });
});
