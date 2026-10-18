import {
  CommandResult,
  CompleteUploadResponse,
  CopyMediaResponse,
  CreateFarmResponse,
  ErrorBody,
  FarmList,
  Invite,
  InvitePreview,
  JoinResponse,
  LIMITS,
  Me,
  OpenVisitResponse,
  QuickTendList,
  ReadUrlsResponse,
  RememberResponse,
  RtTokenResponse,
  SignInNonceResponse,
  UploadUrlResponse,
  type AbortUploadRequest,
  type AgeRequest,
  type CompleteUploadRequest,
  type CopyMediaRequest,
  type CreateFarmRequest,
  type CreateInviteRequest,
  type ErrorCode,
  type FarmId,
  type JoinRequest,
  type MeProfileUpdate,
  type OpenVisitRequest,
  type ReadUrlsRequest,
  type RememberRequest,
  type TermsRequest,
  type UploadUrlRequest,
} from '@kithfield/contracts';
import { z } from 'zod';

/** An answer from the API that wasn't a usable success. No answer at all is a plain fetch error. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'unknown',
  ) {
    super(`The API answered ${status} ${code}`);
    this.name = 'ApiError';
  }
}

/** Worth trying again later: no network, a timeout, rate limiting or a server failure. */
export const isTransient = (error: unknown) =>
  !(error instanceof ApiError) || error.status === 429 || error.status >= 500;

/** How long one request may take before it counts as failed. */
export const REQUEST_TIMEOUT_MS = 15_000;

export interface ApiClientDeps {
  /** Such as `https://dev.kithfield.com/api`. */
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  /** The session's bearer header. */
  readonly authHeaders: () => Promise<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface EventsRange {
  readonly after?: number;
  readonly before?: number;
  readonly limit?: number;
}

/** How the age check went: `under_age` means the server removed the person. */
export type AgeAnswer = 'ok' | 'under_age';

/** A write as the outbox holds it: sent as it was made, whatever this app version thinks of it. */
export interface RawCommand {
  readonly opId: string;
  readonly kind: string;
  readonly payload: unknown;
}

/**
 * A history page with its events unchecked: each is sorted on its own (`parseEvent`), so one
 * broken envelope never loses the page.
 */
const LoosePage = z.object({
  events: z.array(z.unknown()).max(LIMITS.eventsBatch),
  more: z.boolean(),
});

const parseJson = (text: string): unknown => {
  try {
    return text === '' ? null : (JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
};

/** An answer with no body (204). */
const NoContent = z.null();

/** The HTTP endpoints the data layer uses. Every answer is checked against its contract. */
export function createApiClient(deps: ApiClientDeps) {
  async function request<S extends z.ZodType>(
    schema: S,
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
    signedIn = true,
  ): Promise<z.infer<S>> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(signedIn ? await deps.authHeaders() : {}),
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), deps.timeoutMs ?? REQUEST_TIMEOUT_MS);
    try {
      const response = await deps.fetch(`${deps.baseUrl}${path}`, {
        method,
        headers,
        credentials: 'omit',
        signal: abort.signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = parseJson(await response.text());
      if (!response.ok) {
        const error = ErrorBody.safeParse(data);
        throw new ApiError(response.status, error.success ? error.data.error.code : 'unknown');
      }
      const parsed = schema.safeParse(data);
      // A success that isn't what the contract says (a proxy's page, a newer shape) is a failure.
      if (!parsed.success) throw new ApiError(response.status, 'unknown');
      return parsed.data;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** A 5-minute socket token: for a farm's socket, or without a farm for the cottage's. */
    rtToken: (farm?: FarmId) =>
      request(RtTokenResponse, 'POST', '/v1/rt-token', farm === undefined ? {} : { farm }),

    /** The HTTP form of a socket `cmd`, with the same idempotency. */
    command: (farm: FarmId, cmd: RawCommand) =>
      request(CommandResult, 'POST', `/v1/farms/${encodeURIComponent(farm)}/cmd`, {
        opId: cmd.opId,
        kind: cmd.kind,
        payload: cmd.payload,
      }),

    /** A page of the farm's log, oldest first. */
    events: (farm: FarmId, range: EventsRange) => {
      const query = new URLSearchParams();
      if (range.after !== undefined) query.set('after', String(range.after));
      if (range.before !== undefined) query.set('before', String(range.before));
      if (range.limit !== undefined) query.set('limit', String(range.limit));
      const qs = query.toString();
      return request(
        LoosePage,
        'GET',
        `/v1/farms/${encodeURIComponent(farm)}/events${qs ? `?${qs}` : ''}`,
      );
    },

    /** A single-use nonce for an Apple or Google sign-in; needs no session. */
    signInNonce: () => request(SignInNonceResponse, 'POST', '/v1/sign-in-nonce', {}, false),

    /** The signed-in person: profile, sign-in methods, age and Terms records, settings. */
    me: () => request(Me, 'GET', '/v1/me'),

    /** Sets the person's name, critter or birthday; every farm they live on hears of it. */
    updateProfile: (update: MeProfileUpdate) => request(Me, 'PATCH', '/v1/me/profile', update),

    /** Every farm and visit the person lives on. */
    farms: () => request(FarmList, 'GET', '/v1/farms'),

    /** Plants a farm with this person as its keeper, with its first invite. */
    createFarm: (farm: CreateFarmRequest) => request(CreateFarmResponse, 'POST', '/v1/farms', farm),

    /** A new invite to a farm, replacing the one before. Keepers and helpers. */
    createInvite: (farm: FarmId, invite: CreateInviteRequest) =>
      request(Invite, 'POST', `/v1/farms/${encodeURIComponent(farm)}/invites`, invite),

    /** Moves in with an invite's code, or waits for the keeper when the farm asks first. */
    join: (code: string, join: JoinRequest) =>
      request(JoinResponse, 'POST', `/v1/invites/${encodeURIComponent(code)}/join`, join),

    /** The farm an invite opens onto, or null for a link that's gone; needs no session. */
    invite: async (code: string): Promise<InvitePreview | null> => {
      try {
        return await request(
          InvitePreview,
          'GET',
          `/v1/invites/${encodeURIComponent(code)}`,
          undefined,
          false,
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },

    /**
     * The age check: only the birth year and the phone's country go, and the year is never kept.
     * Under the age for that country the server removes the person and this answers `under_age`.
     */
    age: async (age: AgeRequest): Promise<AgeAnswer> => {
      try {
        await request(NoContent, 'POST', '/v1/me/age', age);
        return 'ok';
      } catch (error) {
        if (error instanceof ApiError && error.code === 'under_age') return 'under_age';
        throw error;
      }
    },

    /** The person accepts the Terms version in force. */
    acceptTerms: async (terms: TermsRequest): Promise<void> => {
      await request(NoContent, 'POST', '/v1/me/terms', terms);
    },

    /** Opens (or reopens) the one-to-one visit with a person. */
    openVisit: (visit: OpenVisitRequest) => request(OpenVisitResponse, 'POST', '/v1/visits', visit),

    /** What waits for the person across their farms and visits, newest first. */
    quickTend: () => request(QuickTendList, 'GET', '/v1/quick-tend'),

    /** Plants a remember-me seed, kept by the person's cottage. */
    remember: (seed: RememberRequest) => request(RememberResponse, 'POST', '/v1/remember', seed),

    /** Somewhere to upload one file: a presigned PUT, or presigned parts above 50 MB. */
    uploadUrl: (upload: UploadUrlRequest) =>
      request(UploadUrlResponse, 'POST', '/v1/media/upload-url', upload),

    /** Finishes a multipart upload with each part's ETag. */
    complete: (upload: CompleteUploadRequest) =>
      request(CompleteUploadResponse, 'POST', '/v1/media/complete', upload),

    /** Short-lived signed reads; keys the person can't see are left out. */
    readUrls: (read: ReadUrlsRequest) =>
      request(ReadUrlsResponse, 'POST', '/v1/media/read-urls', read),

    /** Copies finished media into another farm, for forwarding: each original with its copy. */
    copyMedia: (copy: CopyMediaRequest) =>
      request(CopyMediaResponse, 'POST', '/v1/media/copy', copy),

    /** Gives up on an upload nothing points at yet: its parts or its object go. */
    abortUpload: (upload: AbortUploadRequest) =>
      request(NoContent, 'POST', '/v1/media/abort', upload),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
