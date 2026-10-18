import { describe, expect, it } from '@jest/globals';

import { concat, crc32, fourcc, fourccAt, putU24le, putU32be, u24le, u32be } from './bytes';

describe('bytes', () => {
  it('computes the standard CRC-32 check value', () => {
    const ascii = Uint8Array.from('123456789', (c) => c.charCodeAt(0));
    expect(crc32(ascii)).toBe(0xcbf43926);
    expect(crc32(ascii.subarray(0, 4), ascii.subarray(4))).toBe(0xcbf43926);
  });

  it('round-trips integers and four-letter names', () => {
    const out = new Uint8Array(8);
    putU32be(out, 0, 0xdeadbeef);
    putU24le(out, 4, 0x123456);
    expect(u32be(out, 0)).toBe(0xdeadbeef);
    expect(u24le(out, 4)).toBe(0x123456);
    expect(fourccAt(concat([fourcc('acTL')]), 0)).toBe('acTL');
  });

  it('refuses to read past the end', () => {
    expect(() => u32be(new Uint8Array(3), 0)).toThrow(RangeError);
  });
});
