import type { Bindings } from './env';
import { clientKey } from './web/waitlist-store';

/**
 * Whether one more socket may open from this request's address. Sockets say who they are only in
 * their first frame, so before that each upgrade wakes (or makes) a farm or cottage object for
 * anyone who asks; this keeps that to what the phones behind one address (a carrier's NAT, a
 * campus) could need.
 */
export async function withinSocketLimit(env: Bindings, request: Request): Promise<boolean> {
  const address = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const { success } = await env.SOCKET_LIMIT.limit({ key: `socket:${clientKey(address)}` });
  return success;
}
