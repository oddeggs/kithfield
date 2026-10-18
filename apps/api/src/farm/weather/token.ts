/*
 * WeatherKit's REST API takes a short-lived JWT signed (ES256) with a WeatherKit key from the
 * Apple Developer account: header `{alg, kid, id: "<team>.<service>"}`, claims `{iss, iat, exp,
 * sub}`. The key is the `.p8` file's PKCS#8 PEM, kept as a secret.
 */

export type WeatherKitConfig = {
  /** The `.p8` key's contents: PEM with real newlines or literal `\n` sequences. */
  key: string;
  teamId: string;
  keyId: string;
  serviceId: string;
};

/** A token lives an hour and is used until ten minutes before it ends. */
const TOKEN_LIFETIME_S = 60 * 60;
const RENEW_BEFORE_S = 10 * 60;

const encoder = new TextEncoder();

const base64url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

const jsonPart = (value: object): string => base64url(encoder.encode(JSON.stringify(value)));

/** The DER bytes of a PKCS#8 PEM, with real or escaped newlines. */
export const pemBytes = (pem: string): Uint8Array<ArrayBuffer> => {
  const body = pem
    .replaceAll('\\n', '\n')
    .replace(/-----(BEGIN|END) [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const importKey = (pem: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('pkcs8', pemBytes(pem), { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);

/** A signed token for `config` at `nowS` (epoch seconds). */
export const signWeatherKitToken = async (
  config: WeatherKitConfig,
  nowS: number,
  key?: CryptoKey,
): Promise<string> => {
  const header = jsonPart({
    alg: 'ES256',
    kid: config.keyId,
    id: `${config.teamId}.${config.serviceId}`,
  });
  const claims = jsonPart({
    iss: config.teamId,
    iat: nowS,
    exp: nowS + TOKEN_LIFETIME_S,
    sub: config.serviceId,
  });
  const signingKey = key ?? (await importKey(config.key));
  // WebCrypto's ECDSA signature is already JWS's raw r‖s form.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    encoder.encode(`${header}.${claims}`),
  );
  return `${header}.${claims}.${base64url(new Uint8Array(signature))}`;
};

type Held = { pem: string; key: CryptoKey; token: string; expS: number; id: string };

/** One token per isolate, reused while it has time left. */
let held: Held | null = null;

/** A token for `config`, from this isolate's last one when it is still good. */
export const weatherKitToken = async (config: WeatherKitConfig, nowS: number): Promise<string> => {
  const id = `${config.teamId}.${config.serviceId}.${config.keyId}`;
  if (held !== null && held.id === id && held.pem === config.key) {
    if (held.expS - RENEW_BEFORE_S > nowS) return held.token;
  }
  const key = held?.pem === config.key ? held.key : await importKey(config.key);
  const token = await signWeatherKitToken(config, nowS, key);
  held = { pem: config.key, key, token, expS: nowS + TOKEN_LIFETIME_S, id };
  return token;
};
