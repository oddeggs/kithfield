import { FarmEvent, QueuePage, ReportDetail, ReportResponse } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { api, cast } from '../farm/support/doubles';
import {
  ANA,
  desk,
  KOFI,
  plantThrough,
  report,
  say,
  type TestAccess,
  thursdayLot,
  useTestAccess,
} from './support';

let access: TestAccess;
beforeEach(async () => {
  access = await useTestAccess();
});

const queue = async (query = '') => {
  const out = await desk(access, ANA, 'GET', `/queue${query}`);
  expect(out.status).toBe(200);
  return QueuePage.parse(out.body);
};

describe('reporting from the app', () => {
  it('copies the reported message and the ones around it, and files it in the queue', async () => {
    const lot = await thursdayLot();
    for (let i = 0; i < 12; i += 1) await say(lot.fig, lot.farm, `later ${i}`);
    const sent = await report(lot.june, {
      farm: lot.farm,
      about: { about: 'event', seq: lot.unkind },
      reason: 'unkind',
      note: 'third time this week',
      alsoBlock: false,
    });
    expect(sent.status).toBe(201);
    const { report: id } = ReportResponse.parse(sent.body);

    const page = await queue();
    const row = page.rows.find((r) => r.report === id);
    expect(row).toMatchObject({
      category: 'harassment',
      urgent: false,
      kind: 'message',
      farm: lot.farm,
      farmName: 'The Thursday Lot',
      reporters: 1,
      source: 'member',
      claimedBy: null,
    });
    expect((row?.dueAt ?? 0) - (row?.receivedAt ?? 0)).toBe(24 * 60 * 60_000);

    const opened = await desk(access, ANA, 'GET', `/reports/${id}`);
    expect(opened.status).toBe(200);
    const detail = ReportDetail.parse(opened.body);
    expect(detail.reported).toEqual({ person: lot.bram.id, name: 'Bram' });
    expect(detail.reportedSeq).toBe(lot.unkind);
    expect(detail.reasons).toEqual(['unkind']);
    expect(detail.notes).toEqual(['third time this week']);
    const from = Math.max(1, lot.unkind - 10);
    expect(detail.context.map((e) => e.seq)).toEqual(
      Array.from({ length: lot.unkind + 10 - from + 1 }, (_, i) => from + i),
    );
    const reported = FarmEvent.parse(detail.context.find((e) => e.seq === lot.unkind));
    expect(reported.payload).toMatchObject({
      text: expect.stringContaining('nobody here') as string,
    });
    expect(detail.signals).toMatchObject({
      earlierReports: 0,
      accountAgeDays: 0,
      blockedBy: 0,
      suggestedRule: 3,
    });
  });

  it('keeps the evidence when the author unsends the message', async () => {
    const lot = await thursdayLot();
    const sent = ReportResponse.parse(
      (
        await report(lot.pip, {
          farm: lot.farm,
          about: { about: 'event', seq: lot.unkind },
          reason: 'unkind',
          alsoBlock: false,
        })
      ).body,
    );
    const unsend = await api(lot.bram, 'POST', `/v1/farms/${lot.farm}/cmd`, {
      opId: '0190f3a0-0000-7000-8000-ffff00000001',
      kind: 'unsend',
      payload: { target: lot.unkind },
    });
    expect(unsend.body).toMatchObject({ result: 'ack' });
    const detail = ReportDetail.parse(
      (await desk(access, ANA, 'GET', `/reports/${sent.report}`)).body,
    );
    const kept = FarmEvent.parse(detail.context.find((e) => e.seq === lot.unkind));
    expect(kept.payload).toMatchObject({ text: expect.stringContaining('nobody here') as string });
  });

  it('gathers everyone who reports the same message into one case', async () => {
    const lot = await thursdayLot();
    const body = (reason: 'unkind' | 'something_else') => ({
      farm: lot.farm,
      about: { about: 'event' as const, seq: lot.unkind },
      reason,
      alsoBlock: true,
    });
    const first = ReportResponse.parse((await report(lot.june, body('unkind'))).body);
    const second = ReportResponse.parse((await report(lot.pip, body('something_else'))).body);
    const again = ReportResponse.parse((await report(lot.pip, body('something_else'))).body);
    expect(second.report).toBe(first.report);
    expect(again.report).toBe(first.report);
    const row = (await queue()).rows.find((r) => r.report === first.report);
    expect(row?.reporters).toBe(2);
    const detail = ReportDetail.parse(
      (await desk(access, KOFI, 'GET', `/reports/${first.report}`)).body,
    );
    expect(detail.reasons).toEqual(['unkind', 'something_else']);
    expect(detail.signals.blockedBy).toBe(2);
  });

  it('puts urgent reports on top with a one-hour target, then the oldest first', async () => {
    const { ada, ben, cy } = await cast('ada', 'ben', 'cy');
    const farm = await plantThrough(ada, [ben, cy]);
    const spam = await say(ben, farm, 'claim your free gift card before midnight!!');
    const sad = await say(cy, farm, 'I don’t think I can keep doing this');
    const older = ReportResponse.parse(
      (
        await report(ada, {
          farm,
          about: { about: 'event', seq: spam },
          reason: 'spam',
          alsoBlock: false,
        })
      ).body,
    );
    const urgent = ReportResponse.parse(
      (
        await report(ada, {
          farm,
          about: { about: 'event', seq: sad },
          reason: 'something_else',
          note: 'worried about my friend',
          alsoBlock: false,
        })
      ).body,
    );
    const rows = (await queue()).rows;
    const top = rows[0];
    expect(top).toMatchObject({ report: urgent.report, category: 'self_harm', urgent: true });
    expect((top?.dueAt ?? 0) - (top?.receivedAt ?? 0)).toBe(60 * 60_000);
    const order = rows.map((r) => r.report);
    expect(order.indexOf(urgent.report)).toBeLessThan(order.indexOf(older.report));
    const urgentOnly = await queue('?category=self_harm');
    expect(urgentOnly.rows.map((r) => r.report)).toContain(urgent.report);
    expect(urgentOnly.rows.every((r) => r.category === 'self_harm')).toBe(true);
    expect((await desk(access, ANA, 'GET', '/queue?category=nonsense')).status).toBe(400);
  });

  it('reports a person from the members list with the farm’s latest events', async () => {
    const lot = await thursdayLot();
    const sent = await report(lot.june, {
      farm: lot.farm,
      about: { about: 'person', person: lot.bram.id },
      reason: 'unwanted_contact',
      alsoBlock: false,
    });
    expect(sent.status).toBe(201);
    const { report: id } = ReportResponse.parse(sent.body);
    const detail = ReportDetail.parse((await desk(access, ANA, 'GET', `/reports/${id}`)).body);
    expect(detail.reportedSeq).toBeNull();
    expect(detail.reported.person).toBe(lot.bram.id);
    // Only Bram's own words, and words aimed at him, are copied.
    expect(detail.context.length).toBeGreaterThan(0);
    for (const event of detail.context) {
      const aimed = JSON.stringify(event.payload).includes(lot.bram.id);
      expect(event.actor === lot.bram.id || aimed, `seq ${event.seq}`).toBe(true);
    }
  });

  it('refuses what a person can’t report', async () => {
    const lot = await thursdayLot();
    const { stranger } = await cast('stranger');
    const about = { about: 'event' as const, seq: lot.unkind };
    const base = { farm: lot.farm, reason: 'unkind' as const, alsoBlock: false };
    expect((await report(stranger, { ...base, about })).status).toBe(404);
    expect((await report(lot.bram, { ...base, about })).status).toBe(400);
    expect((await report(lot.june, { ...base, about: { about: 'event', seq: 1 } })).status).toBe(
      400,
    );
    expect((await report(lot.june, { ...base, about: { about: 'event', seq: 9999 } })).status).toBe(
      404,
    );
    expect(
      (await report(lot.june, { ...base, about: { about: 'person', person: stranger.id } })).status,
    ).toBe(404);
    expect((await api(lot.june, 'POST', '/v1/reports', { farm: lot.farm })).status).toBe(400);
    expect((await api(null, 'POST', '/v1/reports', { ...base, about })).status).toBe(401);
  });

  it('limits how many reports one person sends in a minute', async () => {
    const lot = await thursdayLot();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      statuses.push(
        (
          await report(lot.fig, {
            farm: lot.farm,
            about: { about: 'event', seq: lot.unkind },
            reason: 'unkind',
            alsoBlock: false,
          })
        ).status,
      );
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it('claims a report when it is opened, and logs every look', async () => {
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
    await desk(access, KOFI, 'GET', `/reports/${id}`);
    const row = (await queue()).rows.find((r) => r.report === id);
    expect(row?.claimedBy).toBe('ana');
    const { results } = await env.DB.prepare(
      'SELECT moderator_id, what FROM audit_log WHERE item = ? ORDER BY at, rowid',
    )
      .bind(id)
      .all();
    expect(results).toEqual([
      { moderator_id: 'ana', what: 'claimed' },
      { moderator_id: 'ana', what: 'opened_context' },
      { moderator_id: 'kofi', what: 'opened_context' },
    ]);
    expect((await desk(access, ANA, 'GET', '/reports/R-NOPE')).status).toBe(404);
  });
});
