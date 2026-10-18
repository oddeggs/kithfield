import { AuditPage, ReportDetail, ReportResponse, ResponseTimes } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { clearOldEvidence, CONTEXT_KEPT_AFTER_CLOSE_MS } from '../../src/admin/retention';
import { ANA, desk, report, type TestAccess, thursdayLot, useTestAccess } from './support';

let access: TestAccess;
beforeEach(async () => {
  access = await useTestAccess();
});

async function handled() {
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
    expect(mine.map((e) => e.what)).toEqual(['remove_warn', 'opened_context', 'claimed']);
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
    const { id } = await handled();
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
    const kept = ReportDetail.parse((await desk(access, ANA, 'GET', `/reports/${stillOpen}`)).body);
    expect(kept.context.length).toBeGreaterThan(0);
  });
});
