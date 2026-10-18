import {
  ApprovalRequest,
  CreateFarmRequest,
  type CreateFarmResponse,
  CreateInviteRequest,
  type Invite,
  type InvitePreview,
  JoinRequest,
  type JoinResponse,
  LIMITS,
  OpenVisitRequest,
  type OpenVisitResponse,
  PersonId,
  type WaitingList,
} from '@kithfield/contracts';
import { Hono } from 'hono';

import type { AppEnv, Bindings } from '../env';
import {
  insertFarm,
  liveInvite,
  replaceInvite,
  takeWaiting,
  useInvite,
  visitBetween,
  waitingList,
} from './d1';
import { body, caller, type Ctx, fail, farmStub, inviteUrl, member } from './http';
import { newFarmId, newInviteCode, sha256Hex } from './ids';
import { farmPorts } from './wiring';

/* Planting farms, opening visits, invites, joining and the keeper's waiting list. */

/** Visits draw the porch scene instead of a farm's land. */
const VISIT_LAND = 'porch';

const newInvite = async (
  env: Bindings,
  farm: string,
  by: string,
  expiresAt: number | null,
): Promise<Invite> => {
  const code = newInviteCode();
  await replaceInvite(env.DB, { hash: await sha256Hex(code), farm, by, expiresAt });
  return { code, url: inviteUrl(env, code), expiresAt };
};

const profileOf = (c: Ctx, person: string) => farmPorts().identity.profile(c.env, person);

export const joiningRoutes = (): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();

  app.post('/farms', async (c) => {
    const person = await caller(c);
    if (person instanceof Response) return person;
    const req = await body(c, CreateFarmRequest);
    if (req instanceof Response) return req;
    const profile = await profileOf(c, person);
    if (profile === null) return fail(c, 403, 'forbidden');
    const farm = newFarmId();
    await farmStub(c.env, farm).create({
      farm,
      kind: 'farm',
      name: req.name,
      land: req.land,
      timeZone: req.timeZone,
      hemisphere: req.hemisphere,
      keeper: person,
      pair: null,
      members: [{ person, profile, via: 'created' }],
    });
    const invite = await newInvite(c.env, farm, person, null);
    return c.json({ farm, invite } satisfies CreateFarmResponse, 201);
  });

  app.post('/visits', async (c) => {
    const person = await caller(c);
    if (person instanceof Response) return person;
    const req = await body(c, OpenVisitRequest);
    if (req instanceof Response) return req;
    if (req.person === person) return fail(c, 400, 'bad_request', ['person']);
    const pair = [person, req.person].sort().join(':');
    const existing = await visitBetween(c.env.DB, pair);
    if (existing !== null) return c.json({ farm: existing.id } satisfies OpenVisitResponse);
    const [mine, theirs] = await Promise.all([profileOf(c, person), profileOf(c, req.person)]);
    if (mine === null) return fail(c, 403, 'forbidden');
    if (theirs === null) return fail(c, 404, 'not_found');
    const farm = newFarmId();
    // The pair is unique: when two opens race, the second finds the first one's visit.
    const row = {
      id: farm,
      kind: 'visit' as const,
      name: null,
      land: VISIT_LAND,
      keeper: null,
      pair,
      at: Date.now(),
    };
    if (!(await insertFarm(c.env.DB, row))) {
      const raced = await visitBetween(c.env.DB, pair);
      if (raced !== null) return c.json({ farm: raced.id } satisfies OpenVisitResponse);
    }
    await farmStub(c.env, farm).create({
      farm,
      kind: 'visit',
      name: null,
      land: VISIT_LAND,
      timeZone: req.timeZone,
      hemisphere: req.hemisphere,
      keeper: null,
      pair,
      members: [
        { person, profile: mine, via: 'visit' },
        { person: req.person, profile: theirs, via: 'visit' },
      ],
    });
    return c.json({ farm } satisfies OpenVisitResponse, 201);
  });

  app.post('/farms/:id/invites', async (c) => {
    const m = await member(c, ['keeper', 'helper']);
    if (m instanceof Response) return m;
    const req = await body(c, CreateInviteRequest);
    if (req instanceof Response) return req;
    const state = await farmStub(c.env, m.farm).state();
    if (state === null || state.kind === 'visit') return fail(c, 404, 'not_found');
    return c.json(await newInvite(c.env, m.farm, m.person, req.expiresAt), 201);
  });

  /** Public: the invite page shows this before anyone signs in. */
  app.get('/invites/:code', async (c) => {
    const invite = await liveInvite(c.env.DB, await sha256Hex(c.req.param('code')), Date.now());
    if (invite === null) return fail(c, 404, 'invite_invalid');
    const state = await farmStub(c.env, invite.farm_id).state();
    if (state === null || state.name === null) return fail(c, 404, 'invite_invalid');
    const preview: InvitePreview = {
      name: state.name,
      land: state.land,
      critters: state.members.map((m) => m.critter),
      full: state.members.length >= LIMITS.members,
      approval: state.approval,
    };
    return c.json(preview);
  });

  app.post('/invites/:code/join', async (c) => {
    const person = await caller(c);
    if (person instanceof Response) return person;
    const req = await body(c, JoinRequest);
    if (req instanceof Response) return req;
    const hash = await sha256Hex(c.req.param('code'));
    const invite = await liveInvite(c.env.DB, hash, Date.now());
    if (invite === null) return fail(c, 404, 'invite_invalid');
    const outcome = await farmStub(c.env, invite.farm_id).join(
      person,
      { name: req.name, critter: req.critter },
      false,
    );
    if ('error' in outcome) {
      if (outcome.error === 'farm_full') return fail(c, 409, 'farm_full');
      return outcome.error === 'not_found'
        ? fail(c, 404, 'invite_invalid')
        : fail(c, 403, 'forbidden');
    }
    if (outcome.status === 'joined') await useInvite(c.env.DB, hash);
    return c.json({ farm: invite.farm_id, status: outcome.status } satisfies JoinResponse);
  });

  app.get('/farms/:id/waiting', async (c) => {
    const m = await member(c, ['keeper']);
    if (m instanceof Response) return m;
    const waiting = await waitingList(c.env.DB, m.farm);
    return c.json({ waiting } satisfies WaitingList);
  });

  app.post('/farms/:id/waiting/:person', async (c) => {
    const m = await member(c, ['keeper']);
    if (m instanceof Response) return m;
    const req = await body(c, ApprovalRequest);
    if (req instanceof Response) return req;
    const person = PersonId.safeParse(c.req.param('person'));
    if (!person.success) return fail(c, 404, 'not_found');
    const waiting = await takeWaiting(c.env.DB, m.farm, person.data);
    if (waiting === null) return fail(c, 404, 'not_found');
    if (req.approve) {
      const { name, critter } = waiting;
      const outcome = await farmStub(c.env, m.farm).join(person.data, { name, critter }, true);
      if ('error' in outcome)
        return fail(
          c,
          outcome.error === 'farm_full' ? 409 : 403,
          outcome.error === 'farm_full' ? 'farm_full' : 'forbidden',
        );
    }
    return c.body(null, 204);
  });

  return app;
};
