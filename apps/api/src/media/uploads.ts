import type { Bindings } from '../env';
import { MIN_SIGNING_KEY_LENGTH, signFields, verifyFields } from './signature';
import { presign } from './sigv4';

/*
 * Where the phone PUTs its bytes.
 *
 * Deployed, uploads go straight to R2: URLs presigned for R2's S3-compatible endpoint
 * (`<account>.r2.cloudflarestorage.com`) with the R2 API token, so no byte passes through a
 * Worker. A presigned PUT signs `content-length` (and a single PUT its `content-type`), so the
 * phone can only send the size and type it declared.
 *
 * `wrangler dev` simulates the R2 binding but has no S3 endpoint to presign for. In the `dev`
 * environment without the R2 token (a laptop, the Workers test pool) uploads go through the API's
 * own upload proxy instead: the same flow, URLs signed with `MEDIA_SIGNING_KEY` over the same
 * facts, written through the R2 binding into the same local bucket the media Worker reads. The
 * proxy is never served in `prd`, and not in `dev` once the token is set.
 */

/** What one presigned PUT may write. */
export interface PutTarget {
  readonly key: string;
  readonly bytes: number;
  readonly mime: string;
  /** A multipart upload's id and the 1-based part number; absent for a single PUT. */
  readonly part?: { readonly uploadId: string; readonly number: number };
  readonly expiresAt: number;
}

export interface UploadSigner {
  readonly mode: 'r2' | 'proxy';
  putUrl(target: PutTarget): Promise<string>;
}

const r2Credentials = (env: Bindings) => {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;
  return { account: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secret: R2_SECRET_ACCESS_KEY };
};

const signingKey = (env: Bindings): string | null => {
  const key = env.MEDIA_SIGNING_KEY;
  return key !== undefined && key.length >= MIN_SIGNING_KEY_LENGTH ? key : null;
};

/** Whether the upload proxy serves: development, without the R2 token, with a signing key. */
export const proxyEnabled = (env: Bindings): boolean =>
  env.ENVIRONMENT === 'dev' && r2Credentials(env) === null && signingKey(env) !== null;

/** The proxy's path under the API, after `/api/v1`. */
export const PROXY_PATH = '/media/upload-proxy';

/** The facts a proxy PUT's signature covers, in order. */
const proxyFields = (t: Omit<PutTarget, 'expiresAt'>, exp: string) => [
  t.key,
  String(t.bytes),
  t.mime,
  t.part?.uploadId ?? '',
  t.part === undefined ? '' : String(t.part.number),
  exp,
];

/**
 * The signer for this environment, or null when uploads can't be offered (`prd` without the R2
 * token). `apiOrigin` is the API's own origin, for proxy URLs.
 */
export function uploadSigner(env: Bindings, apiOrigin: string): UploadSigner | null {
  const r2 = r2Credentials(env);
  if (r2 !== null) {
    const base = `https://${r2.account}.r2.cloudflarestorage.com/${env.MEDIA_BUCKET_NAME}/`;
    return {
      mode: 'r2',
      putUrl: (t) => {
        const url = new URL(base + t.key);
        if (t.part !== undefined) {
          url.searchParams.set('partNumber', String(t.part.number));
          url.searchParams.set('uploadId', t.part.uploadId);
        }
        const now = Date.now();
        return presign({
          method: 'PUT',
          url,
          headers: {
            'content-length': String(t.bytes),
            ...(t.part === undefined ? { 'content-type': t.mime } : {}),
          },
          credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secret, region: 'auto' },
          at: new Date(now),
          expiresSeconds: Math.max(1, Math.round((t.expiresAt - now) / 1000)),
        });
      },
    };
  }
  const secret = signingKey(env);
  if (!proxyEnabled(env) || secret === null) return null;
  return {
    mode: 'proxy',
    putUrl: async (t) => {
      const exp = String(Math.floor(t.expiresAt / 1000));
      const sig = await signFields(secret, 'put', proxyFields(t, exp));
      const url = new URL(`${apiOrigin}/api/v1${PROXY_PATH}/${t.key}`);
      url.searchParams.set('bytes', String(t.bytes));
      url.searchParams.set('type', t.mime);
      if (t.part !== undefined) {
        url.searchParams.set('uploadId', t.part.uploadId);
        url.searchParams.set('part', String(t.part.number));
      }
      url.searchParams.set('exp', exp);
      url.searchParams.set('sig', sig);
      return url.toString();
    },
  };
}

/** A proxy PUT's target, when its URL is signed and unexpired; else null. */
export async function verifyProxyPut(
  env: Bindings,
  key: string,
  query: URLSearchParams,
  now: number,
): Promise<Omit<PutTarget, 'expiresAt'> | null> {
  const secret = signingKey(env);
  if (secret === null) return null;
  const bytes = Number(query.get('bytes'));
  const mime = query.get('type') ?? '';
  const exp = query.get('exp') ?? '';
  const uploadId = query.get('uploadId');
  const part = query.get('part');
  if (!Number.isSafeInteger(bytes) || bytes < 1 || !/^\d{1,12}$/.test(exp)) return null;
  if (Number(exp) * 1000 <= now) return null;
  const target: Omit<PutTarget, 'expiresAt'> = {
    key,
    bytes,
    mime,
    ...(uploadId !== null && part !== null ? { part: { uploadId, number: Number(part) } } : {}),
  };
  const ok = await verifyFields(secret, 'put', proxyFields(target, exp), query.get('sig') ?? '');
  return ok ? target : null;
}
