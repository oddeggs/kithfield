import type { FarmId, OpId } from '@kithfield/contracts';

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** A lowercase UUIDv7, for the events the farm writes itself. */
export const mintOpId = (now: number): OpId => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let ms = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Random URL-safe characters from an unbiased alphabet. */
export const randomToken = (length: number): string => {
  const out: string[] = [];
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < 248 /* 4 × 62: unbiased */ && out.length < length)
        out.push(ALPHABET[b % ALPHABET.length] ?? '');
    }
  }
  return out.join('');
};

export const newFarmId = (): FarmId => randomToken(21);

/** An invite code: short enough to type, long enough not to guess. */
export const newInviteCode = (): string => randomToken(12);

export const sha256Hex = async (value: string): Promise<string> =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
