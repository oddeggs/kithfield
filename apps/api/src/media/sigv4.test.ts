import { describe, expect, it } from 'vitest';

import { presign, uriEncode } from './sigv4';

// Amazon's published example for query presigning ("Authenticating Requests: Using Query
// Parameters", S3 API reference): the same inputs must give the same signature.
const example = {
  credentials: {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
  },
  at: new Date(Date.UTC(2013, 4, 24, 0, 0, 0)),
};

describe('SigV4 query presigning', () => {
  it('matches the published S3 example signature', async () => {
    const url = await presign({
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      expiresSeconds: 86400,
      ...example,
    });
    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('signs the headers a PUT must carry and keeps operation parameters in the query', async () => {
    const url = new URL(
      'https://acct.r2.cloudflarestorage.com/kithfield-media/farm/f1/0b9f2c1e-0000-4000-8000-000000000000',
    );
    url.searchParams.set('partNumber', '2');
    url.searchParams.set('uploadId', 'abc/def+=');
    const signed = new URL(
      await presign({
        method: 'PUT',
        url,
        headers: { 'Content-Length': '1048576' },
        expiresSeconds: 3600,
        credentials: { ...example.credentials, region: 'auto' },
        at: example.at,
      }),
    );
    expect(signed.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;host');
    expect(signed.searchParams.get('partNumber')).toBe('2');
    expect(signed.searchParams.get('uploadId')).toBe('abc/def+=');
    expect(signed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a lifetime S3 would refuse', async () => {
    await expect(
      presign({
        method: 'GET',
        url: new URL('https://x.example/b/k'),
        expiresSeconds: 8 * 24 * 3600,
        ...example,
      }),
    ).rejects.toThrow(RangeError);
  });

  it('encodes as RFC 3986 asks', () => {
    expect(uriEncode("a b/c!'()*~")).toBe('a%20b%2Fc%21%27%28%29%2A~');
  });
});
