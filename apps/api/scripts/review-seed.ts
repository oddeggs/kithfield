/**
 * Gives App Review's account a lived-in farm, through the API exactly as two phones would: each
 * review address signs in with its code (`REVIEW_ACCOUNT`), passes the age check and the Terms and
 * picks a name and critter; the reviewer plants a farm, the companion joins it by its invite, and
 * both write through the farm's command route (messages, a plan seed, an answer to it). Nothing is
 * written to D1 or a farm object by hand. Run again, it finds the farm and adds nothing.
 */
import { CURRENT_TERMS_VERSION } from '../src/auth/terms';

export interface ReviewIdentities {
  readonly email: string;
  readonly code: string;
  readonly companion: string;
}

/** The API's origin and a fetch to reach it (`https://dev.kithfield.com`, or `wrangler dev`). */
export interface SeedApi {
  readonly origin: string;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
}

export type SeedResult =
  | { readonly status: 'seeded'; readonly farm: string; readonly events: number }
  | { readonly status: 'already'; readonly farm: string };

interface Member {
  readonly id: string;
  readonly token: string;
}

const FARM = { name: 'The Orchard Gate', land: 'meadow', timeZone: 'America/Los_Angeles' };

const look = (species: string) => ({
  species,
  coat: 'amber',
  mark: null,
  accessory: null,
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
});

const REVIEWER = { name: 'Robin', critter: look('rabbit') };
const COMPANION = { name: 'Juniper', critter: look('otter') };

/** A UUIDv7, as the phones make op ids: the time first, so a farm's writes sort by when. */
export function opId(now = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  for (let i = 0; i < 6; i += 1) bytes[i] = Math.floor(now / 2 ** (8 * (5 - i))) & 0xff;
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The day `days` from now in the farm's time zone, `YYYY-MM-DD`. */
function dayAhead(days: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(Date.now() + days * 86_400_000);
}

export async function seedReviewFarm(api: SeedApi, who: ReviewIdentities): Promise<SeedResult> {
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    token?: string,
  ): Promise<{ status: number; json: unknown }> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token !== undefined) headers['authorization'] = `Bearer ${token}`;
    const response = await api.fetch(`${api.origin}/api${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, json: text === '' ? null : (JSON.parse(text) as unknown) };
  };
  const expectOk = async (
    step: string,
    result: Promise<{ status: number; json: unknown }>,
  ): Promise<unknown> => {
    const { status, json } = await result;
    // Only the step and the status: answers can hold tokens.
    if (status < 200 || status > 299) throw new Error(`${step} answered ${status}`);
    return json;
  };

  const signIn = async (email: string, as: typeof REVIEWER): Promise<Member> => {
    await expectOk(
      'asking for a code',
      call('POST', '/auth/email-otp/send-verification-otp', { email, type: 'sign-in' }),
    );
    const signedIn = (await expectOk(
      'signing in',
      call('POST', '/auth/sign-in/email-otp', { email, otp: who.code }),
    )) as { token: string; user: { id: string } };
    const { token } = signedIn;
    await expectOk(
      'the age check',
      call('POST', '/v1/me/age', { birthYear: 1990, country: 'US' }, token),
    );
    await expectOk(
      'the Terms',
      call('POST', '/v1/me/terms', { version: CURRENT_TERMS_VERSION }, token),
    );
    await expectOk('the profile', call('PATCH', '/v1/me/profile', as, token));
    return { id: signedIn.user.id, token };
  };

  const reviewer = await signIn(who.email, REVIEWER);
  const list = (await expectOk(
    'the farm list',
    call('GET', '/v1/farms', undefined, reviewer.token),
  )) as {
    farms: { farm: string; kind: string }[];
  };
  const existing = list.farms.find((f) => f.kind === 'farm');
  if (existing) return { status: 'already', farm: existing.farm };

  const planted = (await expectOk(
    'planting the farm',
    call('POST', '/v1/farms', { ...FARM, hemisphere: 'north' }, reviewer.token),
  )) as { farm: string; invite: { code: string } };
  const { farm } = planted;

  const companion = await signIn(who.companion, COMPANION);
  const joined = (await expectOk(
    'joining by the invite',
    call('POST', `/v1/invites/${planted.invite.code}/join`, COMPANION, companion.token),
  )) as { status: string };
  if (joined.status !== 'joined') {
    await expectOk(
      'letting the companion in',
      call('POST', `/v1/farms/${farm}/waiting/${companion.id}`, { approve: true }, reviewer.token),
    );
  }

  let events = 0;
  const write = async (by: Member, kind: string, payload: unknown): Promise<number> => {
    const answer = (await expectOk(
      `writing ${kind}`,
      call('POST', `/v1/farms/${farm}/cmd`, { opId: opId(), kind, payload }, by.token),
    )) as { result: string; seq?: number; reason?: string };
    if (answer.result !== 'ack' || answer.seq === undefined) {
      throw new Error(`${kind} was refused: ${answer.reason ?? 'unknown'}`);
    }
    events += 1;
    return answer.seq;
  };

  await write(reviewer, 'message', { text: 'Morning! The pear tree finally has buds.' });
  await write(companion, 'message', { text: 'Ooh, send a picture when they open 🌸' });
  await write(reviewer, 'wave', { to: companion.id });
  const seed = await write(reviewer, 'seed_planted', {
    title: 'Picnic by the pond',
    days: [{ date: dayAhead(3, FARM.timeZone), from: '12:00' }],
    place: { name: 'The pond' },
    yeses: 'couple',
    someday: false,
  });
  await write(companion, 'rsvp', { seed, answer: 'in' });
  await write(companion, 'message', { text: "I'll bring the lemonade." });
  await write(reviewer, 'dewdrop', { to: companion.id });
  return { status: 'seeded', farm, events };
}
