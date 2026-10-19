import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildAuthOptions } from './options';

afterEach(() => {
  vi.restoreAllMocks();
});

const options = buildAuthOptions({
  db: {} as D1Database,
  secret: 'x'.repeat(32),
  baseURL: 'https://dev.kithfield.com',
  trustedOrigins: ['kithfield-dev://'],
  appleBundleIds: ['com.kithfield.app.dev'],
  googleClientIds: ['web'],
  sendCode: () => Promise.resolve(),
});

describe("Better Auth's logging", () => {
  it('keeps the message and drops whatever was logged with it', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    options.logger?.log?.('error', 'Failed to send the letter', {
      to: 'someone@example.com',
      cause: new Error('mailbox someone@example.com refused'),
    });
    expect(error).toHaveBeenCalledWith('auth: Failed to send the letter');
    expect(JSON.stringify(error.mock.calls)).not.toContain('someone@example.com');
  });
});
