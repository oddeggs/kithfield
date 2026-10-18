import {
  DesktopLinkPreview,
  DesktopLinkResponse,
  DesktopLinkSession,
  DeviceList,
  Me,
} from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { call, freshIp } from '../src/auth/testing/client';
import { api, cast, type Person } from './farm/support/doubles';

/* Signing in on a computer by scanning its QR code with a signed-in phone. */

const computer = 'June’s MacBook Air';

/** The computer, with no session, asks for a code. */
async function askForCode(ip = freshIp()) {
  const res = await call('/v1/desktop-link', {
    body: { name: computer, platform: 'macos' },
    ip,
  });
  expect(res.status).toBe(200);
  return DesktopLinkResponse.parse(await res.json());
}

/** The computer asks whether the phone answered. */
async function poll(code: string, secret: string) {
  const res = await call(`/v1/desktop-link/${code}/session`, { body: { secret } });
  const text = await res.text();
  return { status: res.status, body: text === '' ? null : (JSON.parse(text) as unknown) };
}

const lookUp = (phone: Person, code: string) => api(phone, 'GET', `/v1/desktop-link/${code}`);

describe('signing in on a computer', () => {
  it('shows the phone what is asking, and hands the computer its own session once approved', async () => {
    const { june } = await cast('june');
    const link = await askForCode();
    expect(link.expiresAt - Date.now()).toBeLessThanOrEqual(60_000);
    expect(DesktopLinkSession.parse((await poll(link.code, link.secret)).body)).toMatchObject({
      status: 'waiting',
    });

    const shown = await lookUp(june, link.code);
    expect(shown.status).toBe(200);
    expect(DesktopLinkPreview.parse(shown.body)).toEqual({
      name: computer,
      platform: 'macos',
      city: null,
    });
    expect((await api(june, 'POST', `/v1/desktop-link/${link.code}/approve`)).status).toBe(204);

    const collected = DesktopLinkSession.parse((await poll(link.code, link.secret)).body);
    if (collected.status !== 'approved') throw new Error('not approved');
    expect(collected.person).toBe(june.id);
    const desk: Person = { ...june, token: collected.token };
    expect(Me.parse((await api(desk, 'GET', '/v1/me')).body).person).toBe(june.id);
    // Listed among the person's devices, as the phone was shown it, and can be signed out there.
    const devices = DeviceList.parse((await api(june, 'GET', '/v1/devices')).body).devices;
    const listed = devices.find((d) => d.name === computer);
    expect(listed).toMatchObject({ platform: 'macos', current: false });
    // Single use: neither the computer nor anyone else collects it again, or answers it again.
    expect((await poll(link.code, link.secret)).status).toBe(404);
    expect((await api(june, 'POST', `/v1/desktop-link/${link.code}/approve`)).status).toBe(404);
    expect((await lookUp(june, link.code)).status).toBe(404);
    expect((await api(june, 'DELETE', `/v1/devices/${listed?.device}`)).status).toBe(204);
    expect((await api(desk, 'GET', '/v1/me')).status).toBe(401);
  });

  it('tells the computer when the phone said no, and never hands over a session', async () => {
    const { june } = await cast('june');
    const link = await askForCode();
    expect((await api(june, 'POST', `/v1/desktop-link/${link.code}/decline`)).status).toBe(204);
    expect((await poll(link.code, link.secret)).body).toEqual({ status: 'declined' });
    expect((await api(june, 'POST', `/v1/desktop-link/${link.code}/approve`)).status).toBe(404);
  });

  it('keeps the session from anyone without the computer’s secret, and from a code that expired', async () => {
    const { june } = await cast('june');
    const link = await askForCode();
    expect((await api(june, 'POST', `/v1/desktop-link/${link.code}/approve`)).status).toBe(204);
    // Someone who saw the QR has the code but not the secret.
    expect((await poll(link.code, 'x'.repeat(43))).status).toBe(404);

    const late = await askForCode();
    await env.DB.prepare('UPDATE desktop_links SET expires_at = ? WHERE expires_at = ?')
      .bind(Date.now() - 1, late.expiresAt)
      .run();
    expect((await lookUp(june, late.code)).status).toBe(404);
    expect((await api(june, 'POST', `/v1/desktop-link/${late.code}/approve`)).status).toBe(404);
    expect((await poll(late.code, late.secret)).status).toBe(404);
    // Only hashes are kept.
    const kept = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM desktop_links WHERE code_hash = ? OR secret_hash = ?',
    )
      .bind(link.code, link.secret)
      .first<{ n: number }>();
    expect(kept?.n).toBe(0);
  });

  it('needs a session on the phone, a name and platform from the computer, and limits asking', async () => {
    const link = await askForCode();
    expect((await call(`/v1/desktop-link/${link.code}`)).status).toBe(401);
    expect((await call(`/v1/desktop-link/${link.code}/approve`, { body: {} })).status).toBe(401);
    const bad = await call('/v1/desktop-link', { body: { name: '', platform: 'tv' } });
    expect(bad.status).toBe(400);
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push(
        (await call('/v1/desktop-link', { body: { name: computer, platform: 'macos' }, ip }))
          .status,
      );
    }
    expect(statuses).toContain(429);
  });
});
