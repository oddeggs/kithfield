import {
  ActionResponse,
  EventsPage,
  FarmEvent,
  MemberRecord,
  QueuePage,
  ReportDetail,
  ReportResponse,
  isTombstone,
} from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { isBanned } from '../../src/auth';
import { TestSocket } from '../farm/support/client';
import { api, farmStub, newPerson, type Person } from '../farm/support/doubles';
import {
  ANA,
  desk,
  KOFI,
  notesOf,
  SAM,
  report,
  type TestAccess,
  thursdayLot,
  useTestAccess,
} from './support';

let access: TestAccess;
beforeEach(async () => {
  access = await useTestAccess();
});

type Lot = Awaited<ReturnType<typeof thursdayLot>>;

const fileReport = async (lot: Lot, by: Person = lot.june) =>
  ReportResponse.parse(
    (
      await report(by, {
        farm: lot.farm,
        about: { about: 'event', seq: lot.unkind },
        reason: 'unkind',
        note: 'third time this week',
        alsoBlock: false,
      })
    ).body,
  ).report;

const act = (id: string, body: Record<string, unknown>, who = ANA) =>
  desk(access, who, 'POST', `/reports/${id}/actions`, {
    rule: 3,
    note: 'Repeated put-downs of June',
    tellReporters: true,
    tellMember: true,
    ...body,
  });

const eventOnFarm = async (lot: Lot, seq: number) => {
  const page = EventsPage.parse(
    (await api(lot.pip, 'GET', `/v1/farms/${lot.farm}/events?after=${seq - 1}&limit=1`)).body,
  );
  return page.events[0];
};

const latest = async (lot: Lot, count: number) =>
  EventsPage.parse((await api(lot.pip, 'GET', `/v1/farms/${lot.farm}/events?limit=${count}`)).body)
    .events;

describe('decisions on a report', () => {
  it('removes the message from the farm, warns, and tells both sides quietly', async () => {
    const lot = await thursdayLot();
    const id = await fileReport(lot);
    await fileReport(lot, lot.pip);
    const out = await act(id, { action: 'remove_warn' });
    expect(out.status).toBe(200);
    const { action, status } = ActionResponse.parse(out.body);
    expect(status).toBe('applied');

    const removed = await eventOnFarm(lot, lot.unkind);
    expect(removed?.kind).toBe('message');
    expect(isTombstone(removed?.payload)).toBe(true);
    const unsend = (await latest(lot, 3))
      .map((e) => FarmEvent.parse(e))
      .find((e) => e.kind === 'unsend');
    expect(unsend).toMatchObject({ actor: null, payload: { target: lot.unkind, by: 'safety' } });

    for (const reporter of [lot.june, lot.pip]) {
      const [note] = await notesOf(reporter);
      expect(note).toMatchObject({
        note: 'report_answered',
        report: id,
        farm: lot.farm,
        farmName: 'The Thursday Lot',
        about: lot.bram.id,
        kind: 'message',
        outcome: 'removed',
      });
    }
    const [toBram] = await notesOf(lot.bram);
    expect(toBram).toMatchObject({
      note: 'content_removed',
      action,
      rule: 3,
      account: 'warned',
      pausedUntil: null,
      appealable: true,
      excerpt: expect.stringContaining('nobody here') as string,
    });
    // Nobody else hears anything.
    expect(await notesOf(lot.fig)).toEqual([]);
    // The item has its verdict; only an account decision can follow.
    expect((await act(id, { action: 'remove_warn' })).status).toBe(409);

    const queue = QueuePage.parse((await desk(access, ANA, 'GET', '/queue')).body);
    expect(queue.rows.map((r) => r.report)).not.toContain(id);
    const record = MemberRecord.parse(
      (await desk(access, KOFI, 'GET', `/members/${lot.bram.id}`)).body,
    );
    expect(record).toMatchObject({ name: 'Bram', warnings: 1, pausedUntil: null, openAppeals: 0 });
    expect(record.history.map((h) => h.what)).toEqual(['actioned', 'reported', 'joined']);
    expect(record.farms).toEqual([{ farm: lot.farm, name: 'The Thursday Lot' }]);
  });

  it('dismisses without touching the farm, and thanks the reporter', async () => {
    const lot = await thursdayLot();
    const id = await fileReport(lot);
    const out = await act(id, { action: 'dismiss', rule: null, tellMember: false });
    expect(ActionResponse.parse(out.body).status).toBe('applied');
    const kept = FarmEvent.parse(await eventOnFarm(lot, lot.unkind));
    expect(isTombstone(kept.payload)).toBe(false);
    expect((await notesOf(lot.june))[0]).toMatchObject({
      note: 'report_answered',
      outcome: 'kept',
    });
    expect(await notesOf(lot.bram)).toEqual([]);
    expect((await act(id, { action: 'dismiss', rule: null })).status).toBe(409);
  });

  it('pauses a person on their farms for 7 days', async () => {
    const lot = await thursdayLot();
    const id = await fileReport(lot);
    const out = await act(id, { action: 'pause_7d' });
    expect(out.status).toBe(200);
    const pausedEvent = (await latest(lot, 5))
      .map((e) => FarmEvent.parse(e))
      .find((e) => e.kind === 'settings_changed');
    expect(pausedEvent).toMatchObject({
      actor: null,
      payload: { setting: 'paused', person: lot.bram.id },
    });
    const [note] = await notesOf(lot.bram);
    expect(note).toMatchObject({ note: 'content_removed', account: 'paused' });
    const record = MemberRecord.parse(
      (await desk(access, ANA, 'GET', `/members/${lot.bram.id}`)).body,
    );
    expect(record.pausedUntil).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60_000);
  });

  it('removes a member from the one farm', async () => {
    const lot = await thursdayLot();
    const id = await fileReport(lot);
    expect((await act(id, { action: 'remove_from_farm' })).status).toBe(200);
    const removed = (await latest(lot, 5))
      .map((e) => FarmEvent.parse(e))
      .find((e) => e.kind === 'removed');
    expect(removed).toMatchObject({ actor: null, payload: { person: lot.bram.id, by: 'safety' } });
    const membership = await env.DB.prepare(
      'SELECT left_at FROM memberships WHERE farm_id = ? AND person_id = ?',
    )
      .bind(lot.farm, lot.bram.id)
      .first<{ left_at: number | null }>();
    expect(membership?.left_at).not.toBeNull();
  });

  it('removes someone from Kithfield only when a second senior moderator agrees, and closes their sockets', async () => {
    const lot = await thursdayLot();
    const id = await fileReport(lot);
    const socket = await TestSocket.open(lot.farm);
    expect((await socket.hello(lot.bram, lot.farm)).error).toBeNull();

    const asked = ActionResponse.parse((await act(id, { action: 'remove_from_kithfield' })).body);
    expect(asked.status).toBe('awaiting_second');
    expect(await isBanned(env.DB, lot.bram.id, Date.now())).toBe(false);
    expect(isTombstone((await eventOnFarm(lot, lot.unkind))?.payload)).toBe(false);

    const self = await desk(access, ANA, 'POST', `/actions/${asked.action}/approve`, {});
    expect(self.status).toBe(403);
    const agreed = await desk(access, KOFI, 'POST', `/actions/${asked.action}/approve`, {});
    expect(agreed.status).toBe(200);
    expect(ActionResponse.parse(agreed.body)).toEqual({ action: asked.action, status: 'applied' });

    expect(await isBanned(env.DB, lot.bram.id, Date.now())).toBe(true);
    expect((await socket.waitClosed()).reason).toBe('banned');
    expect((await api(lot.bram, 'GET', '/v1/me')).status).toBe(401);
    expect(isTombstone((await eventOnFarm(lot, lot.unkind))?.payload)).toBe(true);
    expect((await desk(access, KOFI, 'POST', `/actions/${asked.action}/approve`, {})).status).toBe(
      409,
    );
    expect((await notesOf(lot.june))[0]).toMatchObject({ outcome: 'removed' });
  });

  it('escalates to urgent, keeping the report in the queue for a senior', async () => {
    const lot = await thursdayLot();
    const id = await fileReport(lot);
    await desk(access, ANA, 'GET', `/reports/${id}`);
    const out = await act(id, {
      action: 'escalate_urgent',
      rule: null,
      note: 'Sounds like a threat',
    });
    expect(out.status).toBe(200);
    const row = QueuePage.parse((await desk(access, ANA, 'GET', '/queue')).body).rows.find(
      (r) => r.report === id,
    );
    expect(row).toMatchObject({ urgent: true, claimedBy: null });
    expect(await notesOf(lot.june)).toEqual([]);
  });

  it('freezes and unfreezes a farm', async () => {
    const lot = await thursdayLot();
    const id = await fileReport(lot);
    expect((await act(id, { action: 'freeze_farm', rule: 6 })).status).toBe(200);
    expect((await act(id, { action: 'unfreeze_farm', rule: null })).status).toBe(200);
    const frozen = (await latest(lot, 4))
      .map((e) => FarmEvent.parse(e))
      .filter((e) => e.kind === 'settings_changed')
      .map((e) => e.payload);
    expect(frozen).toEqual([
      { setting: 'frozen', on: true },
      { setting: 'frozen', on: false },
    ]);
  });

  it('needs a rule and a reason, and a message to remove', async () => {
    const lot = await thursdayLot();
    const id = await fileReport(lot);
    expect((await act(id, { action: 'remove', rule: null })).status).toBe(400);
    expect((await act(id, { action: 'remove', note: ' ' })).status).toBe(400);
    expect((await act('R-NOPE', { action: 'remove' })).status).toBe(404);
    const about = ReportResponse.parse(
      (
        await report(lot.june, {
          farm: lot.farm,
          about: { about: 'person', person: lot.bram.id },
          reason: 'unkind',
          alsoBlock: false,
        })
      ).body,
    ).report;
    expect((await act(about, { action: 'remove' })).status).toBe(409);
  });

  it('reports and bans the person a merged-away author became', async () => {
    const lot = await thursdayLot();
    const kept = await newPerson('bramkept');
    const stub = farmStub(lot.farm);
    await stub.mergePerson(lot.bram.id, kept.id);
    expect((await stub.state())?.aliases).toEqual({ [lot.bram.id]: kept.id });
    const id = await fileReport(lot);
    const detail = ReportDetail.parse((await desk(access, ANA, 'GET', `/reports/${id}`)).body);
    expect(detail.reported.person).toBe(kept.id);
    // The kept person can't report their own pre-merge words.
    const own = await report(kept, {
      farm: lot.farm,
      about: { about: 'event', seq: lot.unkind },
      reason: 'unkind',
      alsoBlock: false,
    });
    expect(own.status).toBe(400);
    const asked = ActionResponse.parse((await act(id, { action: 'remove_from_kithfield' })).body);
    expect((await desk(access, KOFI, 'POST', `/actions/${asked.action}/approve`, {})).status).toBe(
      200,
    );
    expect(await isBanned(env.DB, kept.id, Date.now())).toBe(true);
    expect(await isBanned(env.DB, lot.bram.id, Date.now())).toBe(false);
  });

  it('lets only one of two verdicts at the same moment through', async () => {
    const lot = await thursdayLot();
    const id = await fileReport(lot);
    const both = await Promise.all([
      act(id, { action: 'remove_warn' }),
      act(id, { action: 'dismiss', rule: null }, KOFI),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    const verdicts = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM moderation_actions WHERE report_id = ? AND status = 'applied'",
    )
      .bind(id)
      .first<{ n: number }>();
    expect(verdicts?.n).toBe(1);
  });

  it('refuses a dismissal while a removal from Kithfield waits, and an agreement after one', async () => {
    const lot = await thursdayLot();
    const id = await fileReport(lot);
    const asked = ActionResponse.parse((await act(id, { action: 'remove_from_kithfield' })).body);
    expect((await act(id, { action: 'dismiss', rule: null }, KOFI)).status).toBe(409);
    const raced = await Promise.all([
      act(id, { action: 'dismiss', rule: null }, KOFI),
      desk(access, KOFI, 'POST', `/actions/${asked.action}/approve`, {}),
    ]);
    expect(raced.map((r) => r.status)).toEqual([409, 200]);

    const other = await thursdayLot();
    const dismissed = await fileReport(other);
    expect((await act(dismissed, { action: 'dismiss', rule: null })).status).toBe(200);
    const late = ActionResponse.parse(
      (await act(dismissed, { action: 'remove_from_kithfield' })).body,
    );
    expect((await desk(access, KOFI, 'POST', `/actions/${late.action}/approve`, {})).status).toBe(
      409,
    );
    expect(await isBanned(env.DB, other.bram.id, Date.now())).toBe(false);
  });

  it('carries out a removal once when two moderators agree at the same moment', async () => {
    const lot = await thursdayLot();
    const id = await fileReport(lot);
    const asked = ActionResponse.parse((await act(id, { action: 'remove_from_kithfield' })).body);
    const both = await Promise.all([
      desk(access, KOFI, 'POST', `/actions/${asked.action}/approve`, {}),
      desk(access, KOFI, 'POST', `/actions/${asked.action}/approve`, {}),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    const agreed = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM audit_log WHERE item = ? AND what = 'remove_from_kithfield'",
    )
      .bind(id)
      .first<{ n: number }>();
    expect(agreed?.n).toBe(2);
  });

  it('leaves removals from Kithfield and legal escalations to senior moderators', async () => {
    const lot = await thursdayLot();
    const id = await fileReport(lot);
    expect((await act(id, { action: 'remove_from_kithfield' }, SAM)).status).toBe(403);
    expect((await act(id, { action: 'escalate_legal', rule: null }, SAM)).status).toBe(403);
    const asked = ActionResponse.parse((await act(id, { action: 'remove_from_kithfield' })).body);
    expect((await desk(access, SAM, 'POST', `/actions/${asked.action}/approve`, {})).status).toBe(
      403,
    );
    expect((await act(id, { action: 'escalate_urgent', rule: null }, SAM)).status).toBe(200);
  });
});
