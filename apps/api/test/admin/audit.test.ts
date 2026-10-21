import { AuditPage, ReportDetail, ReportResponse, ResponseTimes } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AUDIT_KEPT_MS,
  CHILD_SAFETY_KEPT_AFTER_CLOSE_MS,
  clearOldEvidence,
  CONTEXT_KEPT_AFTER_CLOSE_MS,
  keepModerationTidy,
} from '../../src/admin/retention';
import { ANA, desk, notesOf, report, type TestAccess, thursdayLot, useTestAccess } from './support';

const DAY = 24 * 60 * 60_000;

let access: TestAccess;
beforeEach(async () => {
  access = await useTestAccess();
});

async function handled(reason: 'unkind' | 'child_safety' = 'unkind') {
  const lot = await thursdayLot();
  const { report: id } = ReportResponse.parse(
    (
      await report(lot.june, {
        farm: lot.farm,
        about: { about: 'event', seq: lot.unkind },
        reason,
        note: 'third time this week',
        alsoBlock: false,
      })
    ).body,
  );
  await desk(access, ANA, 'GET', `/reports/${id}`);
  await desk(access, ANA, 'POST', `/reports/${id}/actions`, {
    action: 'remove_warn',
    rule: 3,
    note: 'Repeated put-downs of June, 2 reporters',
    tellReporters: true,
    tellMember: true,
  });
  return { lot, id };
}

describe('the audit log', () => {
  it('writes down every look and decision, newest first, with who and why', async () => {
    const { id } = await handled();
    const page = AuditPage.parse((await desk(access, ANA, 'GET', '/audit')).body);
    const mine = page.entries.filter((e) => e.item === id);
    expect(mine.map((e) => e.what)).toEqual(['remove_warn', 'claimed', 'opened_context']);
    expect(mine[0]).toMatchObject({
      by: 'ana',
      byName: 'ana',
      rule: 3,
      reason: 'Repeated put-downs of June, 2 reporters',
    });
  });

  it('pages with a cursor', async () => {
    await handled();
    await handled();
    const all = AuditPage.parse((await desk(access, ANA, 'GET', '/audit')).body).entries;
    const before = all[2]?.at ?? 0;
    const older = AuditPage.parse((await desk(access, ANA, 'GET', `/audit?before=${before}`)).body);
    expect(older.entries.every((e) => e.at < before)).toBe(true);
    expect((await desk(access, ANA, 'GET', '/audit?before=soon')).status).toBe(400);
  });

  it('can’t be changed or deleted', async () => {
    await handled();
    await expect(env.DB.prepare("UPDATE audit_log SET reason = 'edited'").run()).rejects.toThrow(
      /append-only/,
    );
    await expect(env.DB.prepare('DELETE FROM audit_log').run()).rejects.toThrow(/append-only/);
  });

  it('lets go of entries after two years', async () => {
    const { id } = await handled();
    const now = Date.now();
    const old = now - AUDIT_KEPT_MS - 24 * 60 * 60_000;
    await env.DB.prepare(
      "INSERT INTO audit_log (id, at, moderator_id, what, item) VALUES ('L-OLD', ?, 'ana', 'claimed', ?)",
    )
      .bind(old, id)
      .run();
    await keepModerationTidy(env.DB, now);
    const left = await env.DB.prepare('SELECT id FROM audit_log WHERE item = ?').bind(id).all();
    expect(left.results.map((r) => r['id'])).not.toContain('L-OLD');
    expect(left.results.length).toBeGreaterThan(0);
  });

  it('never lets a spreadsheet run a cell', async () => {
    const { lot } = await handled();
    const now = new Date();
    const quarter = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
    const notes = ['  =1+1', '|calc', '%0Acmd', '\t@SUM(A1)'];
    for (const note of notes) {
      const { report: id } = ReportResponse.parse(
        (
          await report(lot.pip, {
            farm: lot.farm,
            about: { about: 'person', person: lot.fig.id },
            reason: 'unkind',
            alsoBlock: false,
          })
        ).body,
      );
      await desk(access, ANA, 'POST', `/reports/${id}/actions`, {
        action: 'dismiss',
        rule: null,
        note,
        tellReporters: false,
        tellMember: false,
      });
    }
    const csv = (await desk(access, ANA, 'GET', `/audit.csv?quarter=${quarter}`)).text;
    for (const cell of [",'=1+1", ",'|calc", ",'%0Acmd", ",'@SUM(A1)"]) {
      expect(csv, cell).toContain(cell);
    }
  });

  it('exports a quarter as CSV', async () => {
    const { id } = await handled();
    const now = new Date();
    const quarter = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
    const csv = await desk(access, ANA, 'GET', `/audit.csv?quarter=${quarter}`);
    expect(csv.status).toBe(200);
    const lines = csv.text.trim().split('\n');
    expect(lines[0]).toBe('id,at,by,what,item,rule,reason');
    expect(
      lines.some((l) =>
        l.includes(`remove_warn,${id},3,"Repeated put-downs of June, 2 reporters"`),
      ),
    ).toBe(true);
    expect((await desk(access, ANA, 'GET', '/audit.csv?quarter=2026-Q9')).status).toBe(400);
  });
});

describe('response times', () => {
  it('counts targets met out of those due, and the median first action', async () => {
    await handled();
    const out = await desk(access, ANA, 'GET', '/response-times?days=30');
    expect(out.status).toBe(200);
    const times = ResponseTimes.parse(out.body);
    expect(times.days).toBe(30);
    expect(times.medianFirstActionMs).not.toBeNull();
    expect(times.standardWithinDay.met).toBeGreaterThanOrEqual(1);
    expect(times.standardWithinDay.met).toBe(times.standardWithinDay.due);
    expect((await desk(access, ANA, 'GET', '/response-times?days=0')).status).toBe(400);
  });
});

describe('report retention', () => {
  it('deletes the copied context 90 days after the report closes', async () => {
    const { id, lot } = await handled();
    const open = await thursdayLot();
    const { report: stillOpen } = ReportResponse.parse(
      (
        await report(open.june, {
          farm: open.farm,
          about: { about: 'event', seq: open.unkind },
          reason: 'unkind',
          alsoBlock: false,
        })
      ).body,
    );
    const now = Date.now();
    expect(await clearOldEvidence(env.DB, now)).toBe(0);
    await clearOldEvidence(env.DB, now + CONTEXT_KEPT_AFTER_CLOSE_MS + 1000);
    const closed = ReportDetail.parse((await desk(access, ANA, 'GET', `/reports/${id}`)).body);
    expect(closed.context).toEqual([]);
    expect(closed.notes).toEqual([]);
    const [removal] = await notesOf(lot.bram);
    expect(removal).toMatchObject({ note: 'content_removed', excerpt: null });
    const kept = ReportDetail.parse((await desk(access, ANA, 'GET', `/reports/${stillOpen}`)).body);
    expect(kept.context.length).toBeGreaterThan(0);
  });

  it('keeps a child-safety case’s evidence a year after it closes, then clears it', async () => {
    const { id } = await handled('child_safety');
    const ordinary = await handled();
    const detail = async (report: string) =>
      ReportDetail.parse((await desk(access, ANA, 'GET', `/reports/${report}`)).body);
    const now = Date.now();

    await clearOldEvidence(env.DB, now + CONTEXT_KEPT_AFTER_CLOSE_MS + 1000);
    const held = await detail(id);
    expect(held.category).toBe('child_safety');
    expect(held.context.length).toBeGreaterThan(0);
    expect(held.notes).toEqual(['third time this week']);
    expect((await detail(ordinary.id)).context).toEqual([]);

    await clearOldEvidence(env.DB, now + CHILD_SAFETY_KEPT_AFTER_CLOSE_MS - DAY);
    expect((await detail(id)).context.length).toBeGreaterThan(0);
    await clearOldEvidence(env.DB, now + CHILD_SAFETY_KEPT_AFTER_CLOSE_MS + 1000);
    const cleared = await detail(id);
    expect(cleared.context).toEqual([]);
    expect(cleared.notes).toEqual([]);
  });
});
