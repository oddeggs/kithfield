import type { SyncReport } from './apply-events';

/*
 * Writes that never left the phone before its data was wiped: counted when the session ends from
 * elsewhere (or a sign-out is forced past the warning) and told to the person once, at the next
 * sign-in. The count lives in the Keychain, outside the tables the wipe empties; it never holds
 * what the writes said.
 */

/** Why the writes were lost: the session ended from another device, or the person signed out. */
export type UnsentReason = 'session_end' | 'sign_out';

export interface UnsentNotice {
  /** Writes (and messages still uploading) that were lost. */
  readonly count: number;
  readonly reason: UnsentReason;
}

/** The part of the Keychain the notice needs. */
export interface NoticeStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const UNSENT_NOTICE_KEY = 'kithfield.unsent-notice';

const parse = (raw: string | null): UnsentNotice | null => {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<UnsentNotice>;
    const reason = value.reason === 'sign_out' ? 'sign_out' : 'session_end';
    return typeof value.count === 'number' && value.count > 0
      ? { count: Math.floor(value.count), reason }
      : null;
  } catch {
    return null;
  }
};

export interface UnsentNotices {
  /** Keeps the count a data-layer report carries; other reports pass by. */
  remember(report: SyncReport): Promise<void>;
  /** The notice waiting for the sign-in screen, gone once read: null when nothing was lost. */
  take(): Promise<UnsentNotice | null>;
}

export function createUnsentNotices(storage: NoticeStorage): UnsentNotices {
  // One write at a time, so a burst of reports can't lose a count between read and write.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };
  return {
    remember(report) {
      if (report.type !== 'unsent_at_session_end' && report.type !== 'unsent_at_sign_out') {
        return Promise.resolve();
      }
      if (report.count <= 0) return Promise.resolve();
      const reason: UnsentReason =
        report.type === 'unsent_at_sign_out' ? 'sign_out' : 'session_end';
      return serial(async () => {
        // Two ends before anyone signs in add up; the latest says why.
        const earlier = parse(await storage.getItemAsync(UNSENT_NOTICE_KEY));
        const notice: UnsentNotice = { count: (earlier?.count ?? 0) + report.count, reason };
        await storage.setItemAsync(UNSENT_NOTICE_KEY, JSON.stringify(notice));
      });
    },
    take() {
      return serial(async () => {
        const notice = parse(await storage.getItemAsync(UNSENT_NOTICE_KEY));
        await storage.deleteItemAsync(UNSENT_NOTICE_KEY);
        return notice;
      });
    },
  };
}
