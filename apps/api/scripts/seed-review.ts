/**
 * Seeds App Review's farm on an environment (`review-seed.ts` says what it makes):
 *
 *   REVIEW_ACCOUNT='<the secret's JSON>' pnpm --filter @kithfield/api seed:review -- --api https://dev.kithfield.com
 *
 * `REVIEW_ACCOUNT` is the same JSON as the Worker secret, with its `companion` set. The secret's
 * value is never printed.
 */
import { readReviewAccount } from '../src/auth/review-account';
import { seedReviewFarm } from './review-seed';

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
  { origin, fetch: (url, init) => fetch(url, init) },
  { email: parsed.email, code: account.code, companion: parsed.companion },
);
console.log(
  result.status === 'seeded'
    ? `Planted farm ${result.farm} with ${result.events} writes from the two review members.`
    : `The review account already has farm ${result.farm}; nothing was added.`,
);
