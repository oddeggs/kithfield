/*
 * Multipart parts through the development upload proxy. R2's S3 endpoint answers each part with
 * its MD5 as the ETag, and the phone sends those back to `complete`. The binding's simulated
 * parts carry longer ETags than the contract allows, so the proxy answers the part's MD5 as S3
 * would and keeps the binding's ETag beside it in the bucket (`proxy-parts/…`), and `complete`
 * maps one to the other. Development only; nothing here runs where uploads are presigned.
 */

const sidecar = (uploadId: string, part: number) => `proxy-parts/${uploadId}/${part}`;

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/** Writes one part; answers its MD5, the ETag S3 would give. */
export async function putProxyPart(
  bucket: R2Bucket,
  key: string,
  uploadId: string,
  part: number,
  bytes: ArrayBuffer,
): Promise<string> {
  const uploaded = await bucket.resumeMultipartUpload(key, uploadId).uploadPart(part, bytes);
  const md5 = hex(await crypto.subtle.digest('MD5', bytes));
  await bucket.put(sidecar(uploadId, part), JSON.stringify({ md5, etag: uploaded.etag }));
  return md5;
}

/** The binding's ETag for each part whose MD5 the phone sent back; others pass through as sent. */
export async function bindingEtags(
  bucket: R2Bucket,
  uploadId: string,
  parts: readonly { partNumber: number; etag: string }[],
): Promise<{ partNumber: number; etag: string }[]> {
  return Promise.all(
    parts.map(async ({ partNumber, etag }) => {
      const stored = await bucket.get(sidecar(uploadId, partNumber));
      const kept = stored === null ? null : await stored.json<{ md5: string; etag: string }>();
      return { partNumber, etag: kept !== null && kept.md5 === etag ? kept.etag : etag };
    }),
  );
}

/** Forgets the sidecars once the upload is complete. */
export const dropProxyParts = (bucket: R2Bucket, uploadId: string, count: number) =>
  bucket.delete(Array.from({ length: count }, (_, i) => sidecar(uploadId, i + 1)));
