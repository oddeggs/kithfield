import { z } from 'zod';

/** Error codes for every HTTP endpoint. The app maps each to a plain line from the i18n catalogue. */
export const ErrorCode = z.enum([
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'too_large',
  'under_age',
  'banned',
  'farm_full',
  'invite_invalid',
  'unavailable',
  'server_error',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Every non-2xx response body. `message` is for logs, never shown to people. */
export const ErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string().max(500).optional(),
    /** Which fields failed, for `bad_request`. */
    fields: z.array(z.string().max(200)).max(50).optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;
