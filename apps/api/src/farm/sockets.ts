import type {
  EventEnvelope,
  FarmEvent,
  FarmServerFrame,
  PersonId,
  SocketErrorCode,
} from '@kithfield/contracts';

/*
 * The farm's sockets. They hibernate, so everything about one lives in its attachment: who said
 * hello on it, whether their farm is open in front of them, and whether they are writing. None of
 * it is stored anywhere else.
 */

/** `farm` is the farm the socket was opened for, from its URL; `person` is set by hello. */
export type Attachment = {
  farm: string;
  person: PersonId | null;
  /** The sign-in session its token was minted under; ending that session closes it. */
  session?: string | null;
  here: boolean;
  typing: boolean;
  /** When the socket opened, for the hello deadline. */
  openedAt: number;
};

export const fresh = (farm: string, openedAt: number): Attachment => ({
  farm,
  person: null,
  here: false,
  typing: false,
  openedAt,
});

export const attachmentOf = (ws: WebSocket): Attachment =>
  (ws.deserializeAttachment() as Attachment | null) ?? fresh('', 0);

export const attach = (ws: WebSocket, attachment: Attachment): void =>
  ws.serializeAttachment(attachment);

type Frame = Exclude<FarmServerFrame, { type: 'unknown' }>;

export const send = (ws: WebSocket, frame: Frame): void => {
  try {
    ws.send(JSON.stringify(frame));
  } catch {
    // The socket is already closing; its close handler tidies up.
  }
};

/** Says why, then closes. */
export const refuse = (ws: WebSocket, code: SocketErrorCode): void => {
  send(ws, { type: 'error', code });
  try {
    ws.close(1008, code);
  } catch {
    // Already closed.
  }
};

export const envelope = (event: FarmEvent): EventEnvelope => ({ ...event, payload: event.payload });

/** Sockets that said hello, apart from one that is closing. */
export const joined = (sockets: readonly WebSocket[], closing?: WebSocket): WebSocket[] =>
  sockets.filter((ws) => ws !== closing && attachmentOf(ws).person !== null);

/** The people with the farm open (`here`) or writing (`typing`), each once. */
export const who = (sockets: readonly WebSocket[], flag: 'here' | 'typing'): PersonId[] => {
  const people = new Set<PersonId>();
  for (const ws of sockets) {
    const a = attachmentOf(ws);
    if (a.person !== null && a[flag]) people.add(a.person);
  }
  return [...people].sort();
};

/** People with a socket open to the farm: their cottages hear `connected`. */
export const connected = (sockets: readonly WebSocket[]): Set<PersonId> =>
  new Set(sockets.map((ws) => attachmentOf(ws).person).filter((p): p is PersonId => p !== null));
