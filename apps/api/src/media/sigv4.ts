/*
 * AWS Signature Version 4 query presigning (S3's "authenticating requests using query
 * parameters"), as R2's S3-compatible endpoint checks it. WebCrypto only, so the Worker needs no
 * SDK. The payload is never signed (`UNSIGNED-PAYLOAD`): the phone streams a file it has on disk.
 */

export interface S3Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** R2 takes `auto`. */
  readonly region: string;
}

export interface PresignInput {
  readonly method: 'GET' | 'PUT' | 'HEAD' | 'DELETE';
  /** The object's URL, with any operation parameters (`partNumber`, `uploadId`) in its query. */
  readonly url: URL;
  /** Headers the request must carry exactly, besides `host` (such as `content-length`). */
  readonly headers?: Readonly<Record<string, string>>;
  readonly credentials: S3Credentials;
  readonly at: Date;
  /** 1 second to 7 days. */
  readonly expiresSeconds: number;
}

const encoder = new TextEncoder();

const hex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

const sha256Hex = async (text: string) =>
  hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));

const hmac = async (key: ArrayBuffer | Uint8Array<ArrayBuffer>, text: string) => {
  const imported = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', imported, encoder.encode(text));
};

/** RFC 3986 encoding, as SigV4 wants it: everything but unreserved characters. */
export const uriEncode = (text: string): string =>
  encodeURIComponent(text).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** `20130524T000000Z` and `20130524`. */
const stamps = (at: Date) => {
  const iso = at
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  return { datetime: iso, date: iso.slice(0, 8) };
};

/** The presigned URL: the input URL with the `X-Amz-*` parameters and the signature. */
export async function presign(input: PresignInput): Promise<string> {
  const { credentials, url } = input;
  if (input.expiresSeconds < 1 || input.expiresSeconds > 7 * 24 * 3600) {
    throw new RangeError('A presigned URL lives between 1 second and 7 days');
  }
  const { datetime, date } = stamps(input.at);
  const scope = `${date}/${credentials.region}/s3/aws4_request`;

  const headers = new Map<string, string>([['host', url.host]]);
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    headers.set(name.toLowerCase(), value.trim().replace(/\s+/g, ' '));
  }
  const headerNames = [...headers.keys()].sort();
  const signedHeaders = headerNames.join(';');

  const params: [string, string][] = [...url.searchParams.entries()];
  params.push(
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${credentials.accessKeyId}/${scope}`],
    ['X-Amz-Date', datetime],
    ['X-Amz-Expires', String(input.expiresSeconds)],
    ['X-Amz-SignedHeaders', signedHeaders],
  );
  const query = params
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  // The path's segments as the client will send them, each encoded once.
  const path = url.pathname
    .split('/')
    .map((segment) => uriEncode(decodeURIComponent(segment)))
    .join('/');

  const canonicalHeaders = headerNames
    .map((name) => `${name}:${headers.get(name) ?? ''}\n`)
    .join('');
  const canonicalRequest = [
    input.method,
    path,
    query,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    datetime,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  let key = await hmac(encoder.encode(`AWS4${credentials.secretAccessKey}`), date);
  key = await hmac(key, credentials.region);
  key = await hmac(key, 's3');
  key = await hmac(key, 'aws4_request');
  const signature = hex(await hmac(key, stringToSign));

  return `${url.origin}${path}?${query}&X-Amz-Signature=${signature}`;
}
