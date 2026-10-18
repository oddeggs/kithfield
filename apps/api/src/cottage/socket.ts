import {
  CottageClientFrame,
  type CottageServerFrame,
  type SocketErrorCode,
} from '@kithfield/contracts';

/** A socket that hasn't said a valid `hello` by then is closed. */
export const HELLO_DEADLINE_MS = 30_000;

/** What the cottage remembers about each socket across hibernation. */
export type SocketState =
  { readonly authed: true } | { readonly authed: false; readonly deadline: number };

export function stateOf(ws: WebSocket): SocketState | null {
  return ws.deserializeAttachment() as SocketState | null;
}

/** Sends a frame; a socket that closed in between catches up with `chats` on its next hello. */
export function send(ws: WebSocket, frame: CottageServerFrame): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
}

/** Tells the phone why, then closes. */
export function refuse(ws: WebSocket, code: SocketErrorCode): void {
  send(ws, { type: 'error', code });
  if (ws.readyState === WebSocket.OPEN) ws.close(1008, code);
}

/** Sends a frame to every socket that said hello. */
export function broadcast(sockets: readonly WebSocket[], frame: CottageServerFrame): void {
  for (const ws of sockets) if (stateOf(ws)?.authed === true) send(ws, frame);
}

/** Closes the sockets that missed their hello deadline. */
export function closeLate(sockets: readonly WebSocket[], now: number): void {
  for (const ws of sockets) {
    const state = stateOf(ws);
    if (state?.authed === false && state.deadline <= now) refuse(ws, 'unauthorized');
  }
}

/** The earliest hello deadline still open, for the alarm. */
export function nextDeadline(sockets: readonly WebSocket[]): number | null {
  const deadlines = sockets.flatMap((ws) => {
    const state = stateOf(ws);
    return state?.authed === false && ws.readyState === WebSocket.OPEN ? [state.deadline] : [];
  });
  return deadlines.length === 0 ? null : Math.min(...deadlines);
}

/** The `hello` a message carries, or null for anything else (a frame this app ignores). */
export function helloIn(message: string | ArrayBuffer): { protocol: number; token: string } | null {
  let raw: unknown = null;
  if (typeof message === 'string') {
    try {
      raw = JSON.parse(message);
    } catch {
      return null;
    }
  }
  const frame = CottageClientFrame.safeParse(raw);
  return frame.success && frame.data.type === 'hello' ? frame.data : null;
}
