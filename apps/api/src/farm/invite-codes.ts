/*
 * Invite codes kept readable to the farm's keepers and helpers: sealed with AES-GCM under the
 * `INVITE_CODE_KEY` secret, with the farm id as associated data, so a sealed code opens only for
 * its own farm. Joining still finds a code by its SHA-256 hash.
 */

const encoder = new TextEncoder();

/** The sealing key, or null while it is unset or shorter than 32 characters. */
export const inviteKey = (env: { readonly INVITE_CODE_KEY?: string }): string | null => {
  const key = env.INVITE_CODE_KEY;
  return key !== undefined && key.length >= 32 ? key : null;
};
const keys = new Map<string, Promise<CryptoKey>>();

/** The AES-256 key for a secret: the SHA-256 of it, so any long random secret will do. */
const keyFor = (secret: string): Promise<CryptoKey> => {
  let key = keys.get(secret);
  if (key === undefined) {
    key = crypto.subtle
      .digest('SHA-256', encoder.encode(secret))
      .then((raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
    keys.set(secret, key);
  }
  return key;
};

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string): Uint8Array | null => {
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};

/** The code sealed for this farm: a fresh 12-byte nonce, then the ciphertext, base64url. */
export const sealInviteCode = async (
  secret: string,
  farm: string,
  code: string,
): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(farm) },
    await keyFor(secret),
    encoder.encode(code),
  );
  const out = new Uint8Array(iv.length + sealed.byteLength);
  out.set(iv);
  out.set(new Uint8Array(sealed), iv.length);
  return toBase64Url(out);
};

/** The code again, or null when the seal is damaged, made for another farm or under another key. */
export const openInviteCode = async (
  secret: string,
  farm: string,
  sealed: string,
): Promise<string | null> => {
  const bytes = fromBase64Url(sealed);
  if (bytes === null || bytes.length <= 12) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode(farm) },
      await keyFor(secret),
      bytes.slice(12),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
};
