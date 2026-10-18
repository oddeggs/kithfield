import type { WebSocketLike } from '../socket';

/*
 * An in-process stand-in for the network between a phone and the test server: each socket is a
 * pair of ends, and every message, open and close is delivered on a later tick, in order, the way
 * a real socket delivers them.
 */

const later = (task: () => void) => setTimeout(task, 0);

/** The server's end of one socket. */
export interface ServerEnd {
  readonly url: string;
  send(text: string): void;
  /** Closes from the server side; the phone hears `onclose`. */
  close(): void;
  readonly closed: boolean;
}

export interface SocketHandlers {
  onMessage(end: ServerEnd, text: string): void;
  onClose(end: ServerEnd): void;
}

/** The phone's end: what `openSocket` hands the client. */
class PhoneEnd implements WebSocketLike {
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  closed = false;
  /** Every text the phone sent, in order. */
  readonly sent: string[] = [];

  constructor(
    private readonly toServer: (text: string) => void,
    private readonly hangUp: () => void,
  ) {}

  send(data: string): void {
    if (this.closed) throw new Error('INVALID_STATE_ERR: the socket is closed');
    this.sent.push(data);
    later(() => this.toServer(data));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    later(() => {
      this.hangUp();
      this.onclose?.({ code: 1000 });
    });
  }

  /** The other side went away; what it sent before arrives first. */
  lost(): void {
    later(() => {
      if (this.closed) return;
      this.closed = true;
      this.onclose?.({ code: 1006 });
    });
  }
}

/** Connects a phone to `handlers`, or fails the way an unreachable host does. */
export function connectPair(
  url: string,
  handlers: SocketHandlers,
  reachable: boolean,
): { phone: PhoneEnd; server: ServerEnd } {
  let serverClosed = false;
  // eslint-disable-next-line prefer-const -- the two ends refer to each other
  let phone: PhoneEnd;
  const server: ServerEnd = {
    url,
    send(text) {
      if (serverClosed) return;
      later(() => {
        if (!phone.closed) phone.onmessage?.({ data: text });
      });
    },
    close() {
      if (serverClosed) return;
      serverClosed = true;
      phone.lost();
    },
    get closed() {
      return serverClosed;
    },
  };
  phone = new PhoneEnd(
    (text) => {
      if (!serverClosed) handlers.onMessage(server, text);
    },
    () => {
      if (serverClosed) return;
      serverClosed = true;
      handlers.onClose(server);
    },
  );
  later(() => {
    if (!reachable) {
      phone.onerror?.({ message: 'unreachable' });
      phone.lost();
      return;
    }
    if (!phone.closed) phone.onopen?.({});
  });
  return { phone, server };
}
