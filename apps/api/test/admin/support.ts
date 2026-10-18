import {
  CreateFarmResponse,
  type FarmCommand,
  type ReportRequest,
  SafetyNoteList,
} from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { expect } from 'vitest';

import { call } from '../../src/auth/testing/client';
import { accessCerts, forgetAccessCerts } from '../../src/admin/access';
import { api, cast, type Person, profile } from '../farm/support/doubles';

/*
 * The safety desk's tests run on the real API, farms, cottages and D1. Only Cloudflare Access's
 * certs endpoint is a stand-in: it publishes a key the test holds, so the desk can be signed in to.
 */

const TEAM = 'https://winstonb.cloudflareaccess.com';
const CERTS = `${TEAM}/cdn-cgi/access/certs`;

export const ANA = 'ana@example.com';
export const KOFI = 'kofi@example.com';
/** A moderator who isn't senior. */
export const SAM = 'sam@example.com';

const b64url = (bytes: Uint8Array | ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const b64json = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

export interface TestAccess {
  readonly kid: string;
  /** Signs a token as Access would, with any claims the test changes. */
  token(
    email: string,
    claims?: Record<string, unknown>,
    header?: Record<string, unknown>,
  ): Promise<string>;
  /** Requests to the certs endpoint so far. */
  readonly fetched: string[];
  /** Publishes a new key under a new id (a rotation). */
  rotate(): Promise<void>;
}

const newKey = () =>
  crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );

/** Stands up a fake Access certs endpoint for this test. */
export async function useTestAccess(): Promise<TestAccess> {
  forgetAccessCerts();
  let pair = await newKey();
  let kid = 'kid-1';
  const fetched: string[] = [];
  accessCerts.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    fetched.push(url);
    if (url !== CERTS) return new Response('not found', { status: 404 });
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    return Response.json({
      keys: [{ kid, kty: 'RSA', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }],
    });
  };
  const access: TestAccess = {
    get kid() {
      return kid;
    },
    fetched,
    async token(email, claims = {}, header = {}) {
      const now = Math.floor(Date.now() / 1000);
      const head = b64json({ alg: 'RS256', kid, typ: 'JWT', ...header });
      const body = b64json({
        aud: [env.ACCESS_AUD],
        email,
        exp: now + 3600,
        iat: now,
        nbf: now,
        iss: TEAM,
        sub: `sub-${email}`,
        type: 'app',
        ...claims,
      });
      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        pair.privateKey,
        new TextEncoder().encode(`${head}.${body}`),
      );
      return `${head}.${body}.${b64url(signature)}`;
    },
    async rotate() {
      pair = await newKey();
      kid = `${kid}-next`;
    },
  };
  return access;
}

/** A request to the safety desk's API as a moderator. */
export async function desk(
  access: TestAccess,
  email: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown; text: string }> {
  const token = await access.token(email);
  const response = await call(`/admin/v1${path}`, {
    method,
    headers: { 'Cf-Access-Jwt-Assertion': token },
    ...(body === undefined ? {} : { body }),
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text === '' ? null : JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed, text };
}

let ops = 0;
/** A fresh UUIDv7-shaped op id. */
export const nextOp = () => {
  ops += 1;
  const tail = ops.toString(16).padStart(12, '0');
  return `0190f3a0-0000-7000-8000-${tail}`;
};

/** A farm planted and joined through the app's routes: the keeper first, then the rest. */
export async function plantThrough(keeper: Person, others: readonly Person[]): Promise<string> {
  const created = await api(keeper, 'POST', '/v1/farms', {
    name: 'The Thursday Lot',
    land: 'meadow',
    timeZone: 'Europe/London',
    hemisphere: 'north',
  });
  expect(created.status).toBe(201);
  const { farm, invite } = CreateFarmResponse.parse(created.body);
  for (const person of others) {
    const joined = await api(person, 'POST', `/v1/invites/${invite.code}/join`, profile(person));
    expect(joined.status).toBe(200);
  }
  return farm;
}

/** Sends a farm command through the app's HTTP route; returns the seq it got. */
export async function send(
  person: Person,
  farm: string,
  cmd: Omit<FarmCommand, 'opId'>,
): Promise<number> {
  const out = await api(person, 'POST', `/v1/farms/${farm}/cmd`, { opId: nextOp(), ...cmd });
  expect(out.status).toBe(200);
  const result = out.body as { result: string; seq?: number };
  expect(result.result).toBe('ack');
  return result.seq ?? 0;
}

export const say = (person: Person, farm: string, text: string) =>
  send(person, farm, { kind: 'message', payload: { text } });

/** The app reporting something. */
export const report = (person: Person, body: ReportRequest) =>
  api(person, 'POST', '/v1/reports', body);

/** The notes a person reads in the app. */
export async function notesOf(person: Person) {
  const out = await api(person, 'GET', '/v1/me/safety-notes');
  expect(out.status).toBe(200);
  return SafetyNoteList.parse(out.body).notes;
}

/** The Thursday Lot: Bram says something unkind to June, with friends around. */
export async function thursdayLot() {
  const people = await cast('june', 'bram', 'pip', 'fig');
  const farm = await plantThrough(people.june, [people.bram, people.pip, people.fig]);
  await say(people.fig, farm, 'ok who is actually coming saturday');
  await say(people.june, farm, 'me!! bringing the good blanket');
  const unkind = await say(
    people.bram,
    farm,
    'honestly nobody here even wants you around anymore so maybe just stay home',
  );
  await say(people.pip, farm, 'hey. not cool.');
  return { ...people, farm, unkind };
}
