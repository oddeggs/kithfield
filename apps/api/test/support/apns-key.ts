/** A throwaway P-256 key in the `.p8` file's PEM form, and its public half to check signatures. */
export async function testApnsKey(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const base64 = btoa(String.fromCharCode(...der));
  const lines = base64.match(/.{1,64}/g) ?? [];
  return {
    pem: ['-----BEGIN PRIVATE KEY-----', ...lines, '-----END PRIVATE KEY-----'].join('\n'),
    publicKey: pair.publicKey,
  };
}

/** A request's URL and JSON body, as the doubles record them. */
export function readRequest(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const body: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : 'null');
  return { url, body };
}
