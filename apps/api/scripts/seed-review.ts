/**
 * Seeds App Review's farm on an environment (`review-seed.ts` says what it makes):
 *
 *   REVIEW_ACCOUNT='<the secret's JSON>' pnpm --filter @kithfield/api seed:review -- --api https://dev.kithfield.com
 *
 * `REVIEW_ACCOUNT` is the same JSON as the Worker secret, with its `companion` set. The secret's
 * value is never printed.
 */
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { readReviewAccount } from '../src/auth/review-account';
import { seedReviewFarm } from './review-seed';

/**
 * A plain request, as the phone sends one. Node's own `fetch` adds the browser's `Sec-Fetch-*`
 * headers, which Better Auth rightly treats as a page with no `Origin` and refuses.
 */
function appFetch(url: string, init: RequestInit): Promise<Response> {
  const target = new URL(url);
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const body = typeof init.body === 'string' ? init.body : undefined;
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  return new Promise((resolve, reject) => {
    const req = send(target, { method: init.method ?? 'GET', headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        text += chunk;
      });
      res.on('end', () => {
        const replied = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (typeof value === 'string') replied.set(name, value);
        }
        const status = res.statusCode ?? 0;
        // A body-less answer (204) can't carry even an empty one.
        const empty = status === 204 || status === 304;
        resolve(new Response(empty ? null : text, { status, headers: replied }));
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const at = process.argv.indexOf('--api');
const origin = (at === -1 ? undefined : process.argv[at + 1])?.replace(/\/+$/, '');
const raw = process.env['REVIEW_ACCOUNT'];
const account = readReviewAccount(raw);
let parsed: { email?: unknown; companion?: unknown } = {};
try {
  parsed = JSON.parse(raw ?? '{}') as typeof parsed;
} catch {
  // Reported below.
}

if (origin === undefined || !/^https?:\/\//.test(origin)) {
  console.error('Pass the API origin: --api https://dev.kithfield.com (or http://localhost:8787)');
  process.exit(2);
}
if (account === null || typeof parsed.email !== 'string' || typeof parsed.companion !== 'string') {
  console.error('Set REVIEW_ACCOUNT to the secret\'s JSON, with "email", "code" and "companion"');
  process.exit(2);
}

const result = await seedReviewFarm(
  { origin, fetch: appFetch },
  { email: parsed.email, code: account.code, companion: parsed.companion },
);
console.log(
  result.status === 'seeded'
    ? `Planted farm ${result.farm} with ${result.events} writes from the two review members.`
    : `The review account already has farm ${result.farm}; nothing was added.`,
);
