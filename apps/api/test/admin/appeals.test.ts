import {
  ActionResponse,
  AppealDetail,
  AppealPage,
  AppealResponse,
  EventsPage,
  FarmEvent,
  isTombstone,
  ReportResponse,
} from '@kithfield/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { api, farmStub } from '../farm/support/doubles';
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

/** Ana opens and decides the report; Bram asks for another look. */
async function decided(
  action: 'remove_warn' | 'pause_7d' | 'dismiss' | 'remove_from_farm' = 'remove_warn',
) {
  const lot = await thursdayLot();
  const { report: id } = ReportResponse.parse(
    (
      await report(lot.june, {
        farm: lot.farm,
        about: { about: 'event', seq: lot.unkind },
        reason: 'unkind',
        alsoBlock: false,
      })
    ).body,
  );
  await desk(access, ANA, 'GET', `/reports/${id}`);
  const out = await desk(access, ANA, 'POST', `/reports/${id}/actions`, {
    action,
    rule: action === 'dismiss' ? null : 3,
    note: 'Message aimed at one member',
    tellReporters: true,
    tellMember: true,
  });
  const { action: actionId } = ActionResponse.parse(out.body);
  return { lot, report: id, action: actionId };
}

const appeal = (person: Parameters<typeof api>[0], action: string, text = 'I was joking') =>
  api(person, 'POST', '/v1/appeals', { action, text });

describe('appeals', () => {
  it('goes to someone who wasn’t part of the first decision, who can keep it', async () => {
    // Kofi has been at the desk before, so the appeal can be given to him.
    await desk(access, KOFI, 'GET', '/me');
    const { lot, report: id, action } = await decided();
    const sent = await appeal(
      lot.bram,
      action,
      'I didn’t mean it like that. I’ve said sorry to June.',
    );
    expect(sent.status).toBe(201);
    const { appeal: appealId } = AppealResponse.parse(sent.body);

    const page = AppealPage.parse((await desk(access, KOFI, 'GET', '/appeals')).body);
    const row = page.rows.find((r) => r.appeal === appealId);
    expect(row).toMatchObject({
      person: lot.bram.id,
      name: 'Bram',
      action,
      decision: 'remove_warn',
      category: 'harassment',
      report: id,
      status: 'open',
      reviewer: 'kofi',
    });

    expect((await desk(access, ANA, 'GET', `/appeals/${appealId}`)).status).toBe(403);
    const detail = AppealDetail.parse(
      (await desk(access, KOFI, 'GET', `/appeals/${appealId}`)).body,
    );
    expect(detail).toMatchObject({
      decidedBy: 'ana',
      decidedByName: 'ana',
      rule: 3,
      excerpt: expect.stringContaining('nobody here') as string,
    });

    const reply = 'Thanks for explaining. It still broke house rule 3, so it stays down.';
    expect(
      (await desk(access, ANA, 'POST', `/appeals/${appealId}/decision`, { outcome: 'undo', reply }))
        .status,
    ).toBe(403);
    const kept = await desk(access, KOFI, 'POST', `/appeals/${appealId}/decision`, {
      outcome: 'keep',
      reply,
    });
    expect(kept.status).toBe(204);
    const [note] = await notesOf(lot.bram);
    expect(note).toMatchObject({
      note: 'appeal_answered',
      appeal: appealId,
      outcome: 'kept',
      reply,
    });
    const after = AppealPage.parse((await desk(access, KOFI, 'GET', '/appeals?status=kept')).body);
    expect(after.rows.find((r) => r.appeal === appealId)?.status).toBe('kept');
    expect(
      (
        await desk(access, KOFI, 'POST', `/appeals/${appealId}/decision`, {
          outcome: 'undo',
          reply,
        })
      ).status,
    ).toBe(409);
  });

  it('undoing a removal puts the message back on the farm', async () => {
    const { lot, action } = await decided();
    const { appeal: appealId } = AppealResponse.parse((await appeal(lot.bram, action)).body);
    const undone = await desk(access, KOFI, 'POST', `/appeals/${appealId}/decision`, {
      outcome: 'undo',
      reply: 'We looked again and we got it wrong. Sorry.',
    });
    expect(undone.status).toBe(204);
    const events = EventsPage.parse(
      (await api(lot.pip, 'GET', `/v1/farms/${lot.farm}/events?limit=5`)).body,
    ).events.map((e) => FarmEvent.parse(e));
    expect(events.at(-1)).toMatchObject({
      kind: 'restored',
      actor: null,
      payload: { target: lot.unkind },
    });
    const back = EventsPage.parse(
      (await api(lot.pip, 'GET', `/v1/farms/${lot.farm}/events?after=${lot.unkind - 1}&limit=1`))
        .body,
    ).events[0];
    expect(isTombstone(back?.payload)).toBe(false);
    expect((await notesOf(lot.bram))[0]).toMatchObject({ outcome: 'undone' });
  });

  it('undoing a pause ends it on every farm', async () => {
    const { lot, action } = await decided('pause_7d');
    const { appeal: appealId } = AppealResponse.parse((await appeal(lot.bram, action)).body);
    await desk(access, KOFI, 'POST', `/appeals/${appealId}/decision`, {
      outcome: 'undo',
      reply: 'Your pause is lifted.',
    });
    const record = (await desk(access, KOFI, 'GET', `/members/${lot.bram.id}`)).body as {
      pausedUntil: number | null;
      history: { what: string }[];
    };
    expect(record.pausedUntil).toBeNull();
    expect(record.history.map((h) => h.what)).toContain('appealed');
    const events = EventsPage.parse(
      (await api(lot.pip, 'GET', `/v1/farms/${lot.farm}/events?limit=3`)).body,
    ).events.map((e) => FarmEvent.parse(e));
    expect(events.findLast((e) => e.kind === 'settings_changed')?.payload).toEqual({
      setting: 'paused',
      person: lot.bram.id,
      until: null,
    });
  });

  it('is only for the person the decision was about, once, and not for a dismissal', async () => {
    const { lot, action } = await decided();
    expect((await appeal(lot.june, action)).status).toBe(404);
    expect((await appeal(lot.bram, 'A-NOPE')).status).toBe(404);
    expect((await appeal(lot.bram, action)).status).toBe(201);
    expect((await appeal(lot.bram, action)).status).toBe(409);
    expect((await api(lot.bram, 'POST', '/v1/appeals', { action })).status).toBe(400);
    const dismissed = await decided('dismiss');
    expect((await appeal(dismissed.lot.bram, dismissed.action)).status).toBe(404);
  });

  it('counts only making or agreeing to a decision as being part of it, not opening the report', async () => {
    await desk(access, KOFI, 'GET', '/me');
    const lot = await thursdayLot();
    const { report: id } = ReportResponse.parse(
      (
        await report(lot.june, {
          farm: lot.farm,
          about: { about: 'event', seq: lot.unkind },
          reason: 'unkind',
          alsoBlock: false,
        })
      ).body,
    );
    await desk(access, KOFI, 'GET', `/reports/${id}`);
    const out = await desk(access, ANA, 'POST', `/reports/${id}/actions`, {
      action: 'remove_warn',
      rule: 3,
      note: 'Aimed at June',
      tellReporters: true,
      tellMember: true,
    });
    const { action } = ActionResponse.parse(out.body);
    const { appeal: appealId } = AppealResponse.parse((await appeal(lot.bram, action)).body);
    expect((await desk(access, KOFI, 'GET', `/appeals/${appealId}`)).status).toBe(200);
  });

  it('goes to a senior who didn’t make the decision when everyone had a hand in the report', async () => {
    const { lot, report: id, action } = await decided();
    await desk(access, SAM, 'POST', `/reports/${id}/actions`, {
      action: 'escalate_urgent',
      rule: null,
      note: 'A second pair of eyes',
      tellReporters: false,
      tellMember: false,
    });
    await desk(access, KOFI, 'POST', `/reports/${id}/actions`, {
      action: 'freeze_farm',
      rule: 3,
      note: 'Cooling off',
      tellReporters: false,
      tellMember: false,
    });
    const { appeal: appealId } = AppealResponse.parse((await appeal(lot.bram, action)).body);
    const row = AppealPage.parse((await desk(access, KOFI, 'GET', '/appeals')).body).rows.find(
      (r) => r.appeal === appealId,
    );
    expect(row?.reviewer).toBeNull();
    expect((await desk(access, ANA, 'GET', `/appeals/${appealId}`)).status).toBe(403);
    expect((await desk(access, SAM, 'GET', `/appeals/${appealId}`)).status).toBe(403);
    expect((await desk(access, KOFI, 'GET', `/appeals/${appealId}`)).status).toBe(200);
  });

  it('answers one of two decisions on the same appeal, and tells the person once', async () => {
    const { lot, action } = await decided();
    const { appeal: appealId } = AppealResponse.parse((await appeal(lot.bram, action)).body);
    const both = await Promise.all([
      desk(access, KOFI, 'POST', `/appeals/${appealId}/decision`, {
        outcome: 'undo',
        reply: 'Put back.',
      }),
      desk(access, KOFI, 'POST', `/appeals/${appealId}/decision`, {
        outcome: 'keep',
        reply: 'Stays.',
      }),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([204, 409]);
    const answered = (await notesOf(lot.bram)).filter((n) => n.note === 'appeal_answered');
    expect(answered).toHaveLength(1);
  });

  it('can’t undo when nothing is held to put back, and leaves the appeal open', async () => {
    const { lot, action } = await decided();
    await farmStub(lot.farm).restoreEvent(lot.unkind);
    const { appeal: appealId } = AppealResponse.parse((await appeal(lot.bram, action)).body);
    const out = await desk(access, KOFI, 'POST', `/appeals/${appealId}/decision`, {
      outcome: 'undo',
      reply: 'Put back.',
    });
    expect(out.status).toBe(404);
    const detail = AppealDetail.parse(
      (await desk(access, KOFI, 'GET', `/appeals/${appealId}`)).body,
    );
    expect(detail.status).toBe('open');
    expect((await notesOf(lot.bram)).some((n) => n.note === 'appeal_answered')).toBe(false);
  });

  it('can’t undo a removal from a farm from the desk yet', async () => {
    const { lot, action } = await decided('remove_from_farm');
    const { appeal: appealId } = AppealResponse.parse((await appeal(lot.bram, action)).body);
    const undo = await desk(access, KOFI, 'POST', `/appeals/${appealId}/decision`, {
      outcome: 'undo',
      reply: 'Come back.',
    });
    expect(undo.status).toBe(409);
    expect((await notesOf(lot.bram)).some((n) => n.note === 'appeal_answered')).toBe(false);
    const keep = await desk(access, KOFI, 'POST', `/appeals/${appealId}/decision`, {
      outcome: 'keep',
      reply: 'It stays.',
    });
    expect(keep.status).toBe(204);
  });
});
