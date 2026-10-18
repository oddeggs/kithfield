import {
  ErrorBody,
  InvitePreview,
  type AgeRequest,
  type ErrorCode,
  type TermsRequest,
} from '@kithfield/contracts';

/** An answer that wasn't a success, with the API's error code when it gave one. */
export class OnboardingApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'unknown',
  ) {
    super(`The API answered ${status} ${code}`);
    this.name = 'OnboardingApiError';
  }
}

export interface OnboardingApiDeps {
  /** Such as `https://dev.kithfield.com/api`. */
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  /** The session's bearer header. */
  readonly authHeaders: () => Promise<Record<string, string>>;
}

export type AgeAnswer = 'ok' | 'under_age';

/**
 * The way in's own calls that the data layer's API client doesn't make: the age check, the
 * Terms, and an invite's preview before joining. Every answer is checked against its contract.
 */
export function createOnboardingApi(deps: OnboardingApiDeps) {
  async function call(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    signedIn: boolean,
  ): Promise<{ status: number; data: unknown }> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(signedIn ? await deps.authHeaders() : {}),
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await deps.fetch(`${deps.baseUrl}${path}`, {
      method,
      headers,
      credentials: 'omit',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let data: unknown;
    try {
      data = text === '' ? null : (JSON.parse(text) as unknown);
    } catch {
      data = null;
    }
    if (!response.ok) {
      const error = ErrorBody.safeParse(data);
      throw new OnboardingApiError(
        response.status,
        error.success ? error.data.error.code : 'unknown',
      );
    }
    return { status: response.status, data };
  }

  return {
    /**
     * `POST /v1/me/age`: only the birth year and the phone's country go; the year is never kept.
     * Under the age for that country the server removes the person and answers `under_age`.
     */
    async age(request: AgeRequest): Promise<AgeAnswer> {
      try {
        await call('POST', '/v1/me/age', request, true);
        return 'ok';
      } catch (error) {
        if (error instanceof OnboardingApiError && error.code === 'under_age') return 'under_age';
        throw error;
      }
    },

    /** `POST /v1/me/terms`: the person accepts the Terms version in force. */
    async acceptTerms(request: TermsRequest): Promise<void> {
      await call('POST', '/v1/me/terms', request, true);
    },

    /** `GET /v1/invites/:code`: the farm an invite opens onto, or null for a link that's gone. */
    async invite(code: string): Promise<InvitePreview | null> {
      try {
        const { data } = await call(
          'GET',
          `/v1/invites/${encodeURIComponent(code)}`,
          undefined,
          false,
        );
        const parsed = InvitePreview.safeParse(data);
        if (!parsed.success) throw new OnboardingApiError(200, 'unknown');
        return parsed.data;
      } catch (error) {
        if (error instanceof OnboardingApiError && error.status === 404) return null;
        throw error;
      }
    },
  };
}

export type OnboardingApi = ReturnType<typeof createOnboardingApi>;
