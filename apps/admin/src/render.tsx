import { AppealPage, ModeratorSelf, QueuePage } from '@kithfield/contracts';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Child } from 'hono/jsx';

import { type ApiResult, read } from './api';
import { tr } from './copy';
import type { AdminEnv } from './env';
import { zoneOrUtc } from './time';
import { ErrorPage } from './ui/audit';
import { type DeskCounts, type Section, Shell } from './ui/shell';

/* Every page: the moderator, the sidebar's counts, the time zone, and the error pages. */

export type Ctx = Context<AdminEnv>;

export interface PageBase {
  readonly zone: string;
  readonly now: number;
}

export const base = (c: Ctx): PageBase => ({
  zone: zoneOrUtc(getCookie(c, 'tz')),
  now: Date.now(),
});

async function sidebar(
  c: Ctx,
): Promise<{ me: ModeratorSelf | null; counts: DeskCounts | null; status: number }> {
  const [me, queue, appeals] = await Promise.all([
    read(c, '/me', ModeratorSelf),
    read(c, '/queue', QueuePage),
    read(c, '/appeals?status=open', AppealPage),
  ]);
  if (!me.ok) return { me: null, counts: null, status: me.status };
  const counts: DeskCounts | null =
    queue.ok && appeals.ok
      ? {
          queue: `${queue.data.rows.length}${queue.data.cursor === null ? '' : '+'}`,
          urgent: queue.data.rows.filter((r) => r.urgent).length,
          appeals: appeals.data.rows.length,
        }
      : null;
  return { me: me.data, counts, status: 200 };
}

const messageFor = (status: number, code: string) => {
  if (status === 401) return tr('moderation.error.signIn');
  if (status === 404) return tr('moderation.error.notFound');
  if (status === 409) return tr('moderation.error.conflict');
  if (status === 403)
    return code === 'forbidden' ? tr('moderation.error.forbidden') : tr('moderation.error.signIn');
  if (status === 400) return tr('moderation.error.badRequest');
  return tr('moderation.error.other');
};

/** Renders a page inside the desk's shell; a moderator Access didn't let in sees why instead. */
export async function page(
  c: Ctx,
  section: Section | null,
  title: string,
  body: Child,
): Promise<Response> {
  const { zone, now } = base(c);
  const { me, counts, status } = await sidebar(c);
  if (me === null) {
    return c.html(
      <Shell
        title={tr('moderation.error.title')}
        section={null}
        me={null}
        counts={null}
        zone={zone}
        now={now}
      >
        <ErrorPage message={messageFor(status, 'unauthorized')} />
      </Shell>,
      status === 401 || status === 403 ? status : 503,
    );
  }
  return c.html(
    <Shell title={title} section={section} me={me} counts={counts} zone={zone} now={now}>
      {body}
    </Shell>,
  );
}

/** An API failure as a page with the matching status. */
export function failure(
  c: Ctx,
  result: Extract<ApiResult<unknown>, { ok: false }>,
): Promise<Response> {
  return page(
    c,
    null,
    tr('moderation.error.title'),
    <ErrorPage message={messageFor(result.status, result.code)} />,
  ).then(
    (response) =>
      new Response(response.body, {
        status: result.status >= 400 ? result.status : 502,
        headers: response.headers,
      }),
  );
}
