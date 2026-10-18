import type { OpId } from '@kithfield/contracts';

/** Random bytes from a secure source: expo-crypto on the phone. */
export type RandomBytes = (count: number) => Uint8Array;

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Makes lowercase UUIDv7 op ids (RFC 9562): 48 bits of milliseconds, then a 12-bit counter that
 * keeps ids made in the same millisecond in order, then 62 random bits. Ids from one maker always
 * sort in the order they were made, even if the clock steps back.
 */
export function createOpIdMaker(random: RandomBytes, now: () => number = Date.now) {
  let lastMs = -1;
  let counter = 0;
  return function nextOpId(): OpId {
    let ms = Math.max(now(), lastMs);
    if (ms === lastMs) {
      counter += 1;
      if (counter > 0xfff) {
        ms += 1;
        counter = 0;
      }
    } else {
      counter = (random(2)[0] ?? 0) & 0x3f;
    }
    lastMs = ms;

    const bytes = new Uint8Array(16);
    const tail = random(8);
    for (let i = 0; i < 6; i += 1) bytes[i] = Math.floor(ms / 2 ** (8 * (5 - i))) & 0xff;
    bytes[6] = 0x70 | ((counter >> 8) & 0x0f);
    bytes[7] = counter & 0xff;
    bytes.set(tail, 8);
    bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);

    const h = hex(bytes);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
}
