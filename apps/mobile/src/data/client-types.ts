import type { OpId, PersonId } from '@kithfield/contracts';

import type { SqlDatabase } from '../db/sql';
import type { ApiClient } from './api-client';
import type { SyncReport } from './apply-events';
import type { BackoffOptions } from './backoff';
import type { FarmRules } from './farm-rules';
import type { RtTokens } from './rt-tokens';
import type { KeepAlive, OpenSocket } from './socket';

/** React Native's `AppState`, narrowed to what the client needs. */
export interface AppStateSource {
  readonly currentState: string | null | undefined;
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

/** The session as the data layer sees it. `sessionEnded`: sign in again. `banned`: stop. */
export interface DataStatus {
  readonly sessionEnded: boolean;
  readonly banned: boolean;
}

/**
 * What this person keeps on the phone outside the data layer's tables (the media upload queue):
 * counted with the unsent writes before signing out, and cleared when the tables are wiped.
 */
export interface HeldElsewhere {
  /** Writes not yet in the outbox, which signing out would lose. */
  readonly pendingCount: () => Promise<number>;
  readonly clear: () => Promise<void>;
}

export interface DataClientDeps<View> {
  readonly db: SqlDatabase;
  readonly rules: FarmRules<View>;
  readonly api: ApiClient;
  readonly tokens: RtTokens;
  /** The API base as a socket URL, such as `wss://dev.kithfield.com/api`. */
  readonly socketBase: string;
  readonly openSocket: OpenSocket;
  /** The signed-in person; writes and the cottage need one. */
  readonly me: () => PersonId | null;
  readonly appState: AppStateSource;
  readonly newOpId: () => OpId;
  readonly now?: () => number;
  readonly report?: (report: SyncReport) => void;
  readonly heldElsewhere?: HeldElsewhere;
  readonly tuning?: {
    readonly backoff?: BackoffOptions;
    readonly keepAlive?: KeepAlive;
    readonly httpFallbackAfter?: number;
    readonly random?: () => number;
  };
}
