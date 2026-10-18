import type { InvitePreview } from '@kithfield/contracts';

export type InviteLoad =
  | { readonly kind: 'ready'; readonly preview: InvitePreview }
  /** Unknown, expired or taken back: the gate is closed. */
  | { readonly kind: 'closed' }
  /** Offline, timed out or the API is down: worth trying again. */
  | { readonly kind: 'error' };

const TIMEOUT_MS = 10_000;

/** The invite code from `/i/<code>` or `/vi/i/<code>`, or null on any other address. */
export function inviteCode(pathname: string): string | null {
  const match = /^\/(?:vi\/)?i\/([A-Za-z0-9_-]{1,64})\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

function looksLikePreview(value: unknown): value is InvitePreview {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === 'string' &&
    typeof v.land === 'string' &&
    Array.isArray(v.critters) &&
    typeof v.full === 'boolean' &&
    typeof v.approval === 'boolean'
  );
}

/** Reads the farm's preview (`GET /api/v1/invites/:code`). Never throws. */
export async function loadInvite(code: string): Promise<InviteLoad> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/invites/${encodeURIComponent(code)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { kind: 'error' };
  }
  // Only the API's own word closes the gate: a taken-back or expired link (`invite_invalid`, or
  // 410). Any other failure, a bare 404 included, may pass, so it offers a retry.
  if (response.status === 410) return { kind: 'closed' };
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
    return body?.error?.code === 'invite_invalid' ? { kind: 'closed' } : { kind: 'error' };
  }
  const body: unknown = await response.json().catch(() => null);
  return looksLikePreview(body) ? { kind: 'ready', preview: body } : { kind: 'error' };
}

/** Fills the invite page from the API and keeps its state (`data-state`) in step. */
export function showInvite(): void {
  const root = document.querySelector<HTMLElement>('[data-kf="invite"]');
  if (!root) return;
  const field = (name: string) => root.querySelector<HTMLElement>(`[data-field="${name}"]`);
  const mark = root.dataset.farmMark ?? '{farm}';
  const code = inviteCode(location.pathname);

  const render = (load: InviteLoad): void => {
    if (load.kind !== 'ready') {
      root.dataset.state = load.kind;
      return;
    }
    const { preview } = load;
    root.dataset.state = preview.full ? 'full' : 'ready';
    const headline = field('headline');
    if (headline)
      headline.textContent = (root.dataset.headline ?? '').replace(mark, () => preview.name);
    const full = field('full');
    if (full) full.textContent = (root.dataset.full ?? '').replace(mark, () => preview.name);
    const count = preview.critters.length;
    const members = field('members');
    if (members) {
      members.textContent =
        count === 1 && root.dataset.membersOne
          ? root.dataset.membersOne
          : (root.dataset.membersOther ?? '').replace(root.dataset.many ?? '', () => String(count));
    }
    const approval = field('approval');
    if (approval) approval.hidden = !preview.approval;
    const species = preview.critters[0]?.species;
    if (species) field('avatar')?.setAttribute('kind', species);
    const webJoin = root.dataset.webJoin;
    const browser = field('browser');
    if (webJoin && code && browser instanceof HTMLAnchorElement) {
      browser.href = `${webJoin}${encodeURIComponent(code)}`;
    }
  };

  const load = (): void => {
    if (!code) {
      render({ kind: 'closed' });
      return;
    }
    root.dataset.state = 'loading';
    void loadInvite(code).then(render);
  };
  field('retry')?.addEventListener('click', load);
  load();
}
