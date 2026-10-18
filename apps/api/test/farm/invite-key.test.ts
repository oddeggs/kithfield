import { CreateFarmResponse } from '@kithfield/contracts';
import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import type { Bindings } from '../../src/env';
import { cast, type Person, useTestPorts } from './support/doubles';

beforeEach(() => {
  useTestPorts();
});

/** The API with a given invite key, as a deployment with that secret set would run. */
const withKey =
  (key: string) => async (person: Person, method: string, path: string, body?: unknown) => {
    const bindings: Bindings = { ...env, INVITE_CODE_KEY: key };
    const response = await createApp().fetch(
      new Request(`https://dev.kithfield.com/api${path}`, {
        method,
        headers: {
          authorization: `Bearer ${person.token}`,
          'content-type': 'application/json',
          'cf-connecting-ip': '10.66.0.1',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      bindings,
      createExecutionContext(),
    );
    return { status: response.status, body: await response.json() };
  };

describe('the invite code key', () => {
  it('is unavailable shorter than 32 characters, and seals nothing with it', async () => {
    const { pip } = await cast('pip');
    const short = withKey('short');
    const created = await short(pip, 'POST', '/v1/farms', {
      name: 'The Thursday Lot',
      land: 'meadow',
      timeZone: 'Europe/London',
      hemisphere: 'north',
    });
    expect(created.status).toBe(201);
    const { farm } = CreateFarmResponse.parse(created.body);
    expect((await short(pip, 'GET', `/v1/farms/${farm}/invite`)).status).toBe(503);
    const row = await env.DB.prepare('SELECT code_sealed FROM invites WHERE farm_id = ?')
      .bind(farm)
      .first<{ code_sealed: string | null }>();
    expect(row?.code_sealed).toBeNull();
  });
});
