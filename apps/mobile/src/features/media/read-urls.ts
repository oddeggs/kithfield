import { isTransient } from '../../data/api-client';
import type { MediaApi } from './media-api';

/*
 * Signed read URLs, asked for together and kept while they last. A screen asks for each key it
 * shows; the asks of one moment go up as one `read-urls` call (50 keys at most each), and a URL is
 * reused until two minutes before it expires. A key the API leaves out (not on your farms, gone,
 * quarantined) reads as null.
 */

const BATCH_KEYS = 50;
const GATHER_MS = 16;
/** A URL is handed out only while it has this long left. */
const MARGIN_MS = 2 * 60_000;
/** After a failed ask, a key is asked again no sooner than this. */
const RETRY_MS = 10_000;

type Waiter = (url: string | null) => void;

export class ReadUrls {
  private readonly cache = new Map<string, { url: string; expiresAt: number }>();
  private readonly missing = new Map<string, number>();
  private readonly waiting = new Map<string, Waiter[]>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly api: Pick<MediaApi, 'readUrls'>,
    private readonly now: () => number = Date.now,
  ) {}

  /** A URL for the key while it is fresh, without asking. */
  peek(key: string): string | null {
    const hit = this.cache.get(key);
    return hit !== undefined && hit.expiresAt - MARGIN_MS > this.now() ? hit.url : null;
  }

  /** A signed URL for the key, or null when there is none to have. */
  get(key: string): Promise<string | null> {
    const hit = this.peek(key);
    if (hit !== null) return Promise.resolve(hit);
    const missedAt = this.missing.get(key);
    if (missedAt !== undefined && this.now() - missedAt < RETRY_MS) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.waiting.set(key, [...(this.waiting.get(key) ?? []), resolve]);
      this.timer ??= setTimeout(() => void this.flush(), GATHER_MS);
    });
  }

  private async flush(): Promise<void> {
    this.timer = null;
    const asked = new Map(this.waiting);
    this.waiting.clear();
    const keys = [...asked.keys()];
    for (let i = 0; i < keys.length; i += BATCH_KEYS) {
      const chunk = keys.slice(i, i + BATCH_KEYS);
      let found = new Map<string, string>();
      try {
        const { urls } = await this.api.readUrls(chunk);
        for (const { key, url, expiresAt } of urls) this.cache.set(key, { url, expiresAt });
        found = new Map(urls.map((u) => [u.key, u.url]));
      } catch (error) {
        if (!isTransient(error)) console.warn('read-urls refused', error);
      }
      for (const key of chunk) {
        const url = found.get(key) ?? null;
        if (url === null) this.missing.set(key, this.now());
        else this.missing.delete(key);
        for (const resolve of asked.get(key) ?? []) resolve(url);
      }
    }
  }
}
