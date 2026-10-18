import {
  ActionResponse,
  AppealPage,
  AppealResponse,
  FarmEvent,
  isTombstone,
  ReportDetail,
  ReportResponse,
} from '@kithfield/contracts';
import { createMessageBatch } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { mergeModeration } from '../../src/admin';
import { consumeDeletion } from '../../src/deletion';
import { api, farmStub, newPerson, profile } from '../farm/support/doubles';
import {
  ANA,
  desk,
  KOFI,
  notesOf,
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

const reportUnkind = async (lot: Lot, by: Lot['june'], note?: string) =>
  ReportResponse.parse(
    (
      await report(by, {
        farm: lot.farm,
        about: { about: 'event', seq: lot.unkind },
        reason: 'unkind',
        ...(note === undefined ? {} : { note }),
        alsoBlock: false,
      })
    ).body,
  ).report;

const decide = async (id: string) =>
  ActionResponse.parse(
    (
      await desk(access, ANA, 'POST', `/reports/${id}/actions`, {
        action: 'remove_warn',
        rule: 3,
        note: 'Aimed at June',
        tellReporters: true,
        tellMember: true,
      })
    ).body,
  ).action;

/** Runs one message on the deletion queue, as its consumer would; fails if the job failed. */
async function runDeletionJob(body: unknown) {
  const batch = createMessageBatch('kithfield-deletion-dev', [
    { id: 'm1', timestamp: new Date(), attempts: 1, body },
  ]);
  const retried: unknown[] = [];
  for (const message of batch.messages) message.retry = (options) => retried.push(options);
  await consumeDeletion(batch, env);
  expect(retried).toEqual([]);
}

/** The account's 30 days run out and its purge runs: every part's steps, the desk's among them. */
async function purge(person: string) {
  const asked = Date.now() - 31 * 24 * 60 * 60_000;
  await env.DB.prepare('UPDATE people SET deleted_at = ? WHERE id = ?').bind(asked, person).run();
  await runDeletionJob({ kind: 'account_deleted', person, at: asked });
  const left = await env.DB.prepare('SELECT 1 FROM people WHERE id = ?').bind(person).first();
  expect(left).toBeNull();
}

const count = async (sql: string, ...binds: unknown[]) =>
  (
    await env.DB.prepare(sql)
      .bind(...binds)
      .first<{ n: number }>()
  )?.n ?? 0;

const detailOf = async (id: string) =>
  ReportDetail.parse((await desk(access, KOFI, 'GET', `/reports/${id}`)).body);

describe('an account purged', () => {
  it('takes their notes, appeal words and reports, and the evidence about them', async () => {
    const lot = await thursdayLot();
    const id = await reportUnkind(lot, lot.june, 'third time this week');
    const action = await decide(id);
    const { appeal } = AppealResponse.parse(
      (await api(lot.bram, 'POST', '/v1/appeals', { action, text: 'I was joking' })).body,
    );
    // Bram reports someone too, and Pip's words (near Bram's) are reported by Fig.
    const byBram = ReportResponse.parse(
      (
        await report(lot.bram, {
          farm: lot.farm,
          about: { about: 'person', person: lot.june.id },
          reason: 'unkind',
          note: 'she started it',
          alsoBlock: false,
        })
      ).body,
    ).report;
    const aboutPip = ReportResponse.parse(
      (
        await report(lot.fig, {
          farm: lot.farm,
          about: { about: 'event', seq: lot.unkind + 1 },
          reason: 'something_else',
          alsoBlock: false,
        })
      ).body,
    ).report;
    expect(await notesOf(lot.bram)).not.toEqual([]);

    // June's account goes first: her report of Bram goes, her words in its context are tombstoned.
    await purge(lot.june.id);
    const after = await detailOf(id);
    expect(after.reasons).toEqual([]);
    const juneWords = after.context.find((e) => e.actor === lot.june.id);
    expect(juneWords).toBeDefined();
    expect(isTombstone(FarmEvent.parse(juneWords).payload)).toBe(true);
    expect(after.context.some((e) => e.actor === lot.bram.id && !isTombstone(e.payload))).toBe(
      true,
    );

    await purge(lot.bram.id);
    expect(
      await count('SELECT COUNT(*) AS n FROM safety_notes WHERE person_id = ?', lot.bram.id),
    ).toBe(0);
    expect(
      await count('SELECT COUNT(*) AS n FROM report_filings WHERE reporter_id = ?', lot.bram.id),
    ).toBe(0);
    expect((await detailOf(byBram)).reasons).toEqual([]);
    // The evidence about Bram is cleared; his words in another report's context are tombstoned.
    expect((await detailOf(id)).context).toEqual([]);
    const bramWords = (await detailOf(aboutPip)).context.find((e) => e.actor === lot.bram.id);
    expect(isTombstone(FarmEvent.parse(bramWords).payload)).toBe(true);
    const row = AppealPage.parse((await desk(access, KOFI, 'GET', '/appeals')).body).rows.find(
      (r) => r.appeal === appeal,
    );
    expect(row?.text).not.toContain('joking');
    expect(
      await count("SELECT COUNT(*) AS n FROM appeals WHERE id = ? AND text = ''", appeal),
    ).toBe(1);
    // The decision and the audit log keep the ids.
    const kept = await env.DB.prepare('SELECT person_id FROM moderation_actions WHERE id = ?')
      .bind(action)
      .first<{ person_id: string }>();
    expect(kept?.person_id).toBe(lot.bram.id);
    expect(await count('SELECT COUNT(*) AS n FROM audit_log WHERE item = ?', id)).toBeGreaterThan(
      0,
    );
  });
});

describe('a person merged into another', () => {
  it('moves their reports, appeals and notes, joining open cases about the same item', async () => {
    const lot = await thursdayLot();
    const kept = await newPerson('bramkept');
    await farmStub(lot.farm).join(kept.id, profile(kept), true);
    const aboutPerson = (by: Lot['june'], person: string) =>
      report(by, {
        farm: lot.farm,
        about: { about: 'person', person },
        reason: 'unkind',
        alsoBlock: false,
      });
    const first = ReportResponse.parse((await aboutPerson(lot.pip, lot.bram.id)).body).report;
    const second = ReportResponse.parse((await aboutPerson(lot.fig, kept.id)).body).report;
    const byBram = ReportResponse.parse((await aboutPerson(lot.bram, lot.june.id)).body).report;

    await mergeModeration(env.DB, lot.bram.id, kept.id);
    const joined = await detailOf(second);
    expect(joined.reasons).toHaveLength(2);
    expect((await desk(access, KOFI, 'GET', `/reports/${first}`)).status).toBe(404);
    const filer = await env.DB.prepare('SELECT reporter_id FROM report_filings WHERE report_id = ?')
      .bind(byBram)
      .first<{ reporter_id: string }>();
    expect(filer?.reporter_id).toBe(kept.id);
  });
});
