const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Bytes as standard base64 (with padding), for the pasteboard and JSON. */
export function toBase64(bytes: Uint8Array): string {
  const out: string[] = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out.push(
      ALPHABET.charAt((n >> 18) & 63),
      ALPHABET.charAt((n >> 12) & 63),
      ALPHABET.charAt((n >> 6) & 63),
      ALPHABET.charAt(n & 63),
    );
  }
  const rest = bytes.length - i;
  if (rest > 0) {
    const n = ((bytes[i] ?? 0) << 16) | (rest > 1 ? (bytes[i + 1] ?? 0) << 8 : 0);
    out.push(ALPHABET.charAt((n >> 18) & 63), ALPHABET.charAt((n >> 12) & 63));
    out.push(rest > 1 ? ALPHABET.charAt((n >> 6) & 63) : '=', '=');
  }
  return out.join('');
}

/** Text as UTF-8 bytes. */
export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
