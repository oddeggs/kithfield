import { PROTOCOL_VERSION } from '@kithfield/contracts';

import { rtTokenSession } from '../auth';
import { cottageAdapters } from './adapters';
import { chatList } from './chats';
import type { Intake } from './intake';
import { readProfile, updateProfile } from './profile';
import * as sockets from './socket';

/**
 * A frame on the cottage socket. Only `hello {protocol, token}` means anything: the token must be
 * this person's cottage token. Then the phone gets the whole chat list and any waiting safety
 * note, and the person counts as back on their own, so nudges start again from the first.
 */
export async function answerHello(
  ws: WebSocket,
  message: string | ArrayBuffer,
  cottage: Intake,
): Promise<void> {
  const hello = sockets.helloIn(message);
  if (hello === null) {
    if (sockets.stateOf(ws)?.authed !== true) sockets.refuse(ws, 'unauthorized');
    return;
  }
  if (hello.protocol !== PROTOCOL_VERSION) {
    sockets.refuse(ws, 'protocol_unsupported');
    return;
  }
  const scope = { cottage: cottage.person };
  const person = await cottageAdapters().verifyRtToken(cottage.env, hello.token, scope);
  if (person !== cottage.person) {
    sockets.refuse(ws, 'unauthorized');
    return;
  }
  ws.serializeAttachment({
    authed: true,
    session: rtTokenSession(hello.token),
  } satisfies sockets.SocketState);
  updateProfile(cottage.sql, (profile) => ({ ...profile, nudgesSinceBack: 0 }));
  sockets.send(ws, { type: 'chats', chats: chatList(cottage.sql, cottage.now) });
  if (readProfile(cottage.sql).safetyNote) sockets.send(ws, { type: 'safety_note' });
}
