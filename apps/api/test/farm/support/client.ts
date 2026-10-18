import { FarmServerFrame, PROTOCOL_VERSION } from '@kithfield/contracts';
import { exports } from 'cloudflare:workers';
import { expect } from 'vitest';

import { tokenFor } from './doubles';

type Frame = Exclude<FarmServerFrame, { type: 'unknown' }>;
type Of<T extends Frame['type']> = Extract<Frame, { type: T }>;

const pause = () => new Promise((resolve) => setTimeout(resolve, 5));

/**
 * A phone's farm socket through the Worker's real route. Every frame it receives must parse with
 * the contracts' `FarmServerFrame`; frames are read in order with `next`.
 */
export class TestSocket {
  readonly frames: Frame[] = [];
  readonly text: string[] = [];
  closed: { code: number; reason: string } | null = null;
  private read = 0;

  private constructor(readonly ws: WebSocket) {
    ws.addEventListener('message', (e) => {
      if (typeof e.data !== 'string') return;
      if (!e.data.startsWith('{')) {
        this.text.push(e.data);
        return;
      }
      const parsed = FarmServerFrame.safeParse(JSON.parse(e.data));
      expect(parsed.success, `frame fits the contract: ${e.data.slice(0, 200)}`).toBe(true);
      if (parsed.success && parsed.data.type !== 'unknown') this.frames.push(parsed.data);
    });
    ws.addEventListener('close', (e) => {
      this.closed = { code: e.code, reason: e.reason };
    });
  }

  static async open(farm: string): Promise<TestSocket> {
    const response = await exports.default.fetch(
      `https://dev.kithfield.com/api/v1/farms/${farm}/socket`,
      {
        headers: { Upgrade: 'websocket' },
      },
    );
    expect(response.status).toBe(101);
    const ws = response.webSocket;
    if (ws === null) throw new Error('No socket');
    ws.accept();
    return new TestSocket(ws);
  }

  send(frame: unknown): void {
    this.ws.send(typeof frame === 'string' ? frame : JSON.stringify(frame));
  }

  /** The next unread frame, optionally of one type (frames of other types are skipped). */
  async next<T extends Frame['type']>(type?: T, timeoutMs = 2000): Promise<Of<T>> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      while (this.read < this.frames.length) {
        const frame = this.frames[this.read++]!;
        if (type === undefined || frame.type === type) return frame as Of<T>;
      }
      if (Date.now() > until) throw new Error(`No ${type ?? 'frame'} within ${timeoutMs}ms`);
      await pause();
    }
  }

  /** Waits until nothing new arrives for a moment, then returns the unread frames. */
  async drain(quietMs = 60): Promise<Frame[]> {
    let seen = -1;
    while (seen !== this.frames.length) {
      seen = this.frames.length;
      const until = Date.now() + quietMs;
      while (Date.now() < until) await pause();
    }
    const unread = this.frames.slice(this.read);
    this.read = this.frames.length;
    return unread;
  }

  async waitClosed(timeoutMs = 2000): Promise<{ code: number; reason: string }> {
    const until = Date.now() + timeoutMs;
    while (this.closed === null) {
      if (Date.now() > until) throw new Error('Socket stayed open');
      await pause();
    }
    return this.closed;
  }

  /** Says hello and reads the catch-up: an optional snapshot, then event batches until `more` is false. */
  async hello(person: string, farm: string, lastSeq = 0, rulesVersion = 1) {
    this.send({
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      token: tokenFor(person, farm),
      lastSeq,
      rulesVersion,
    });
    const first = await this.next();
    if (first.type === 'error') return { error: first.code, snapshot: null, batches: [] };
    const snapshot = first.type === 'snapshot' ? first : null;
    const batches: Of<'events'>[] = [];
    let batch = first.type === 'events' ? first : await this.next('events');
    batches.push(batch);
    while (batch.more) {
      batch = await this.next('events');
      batches.push(batch);
    }
    return { error: null, snapshot, batches, events: batches.flatMap((b) => b.events) };
  }

  close(): void {
    try {
      this.ws.close(1000, 'done');
    } catch {
      // Already closed.
    }
  }
}

/** A valid UUIDv7 op id, distinct per `n` (and per `run`, so tests sharing a farm never collide). */
export const op = (n: number, run = 0): string =>
  `0192f0c0-${run.toString(16).padStart(4, '0')}-7000-8000-${n.toString(16).padStart(12, '0')}`;

/** A `cmd` frame carrying a message. */
export const messageFrame = (n: number, text = `hello ${n}`) => ({
  type: 'cmd',
  opId: op(n),
  kind: 'message',
  payload: { text },
});
