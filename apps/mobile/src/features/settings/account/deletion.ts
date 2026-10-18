/** Who deleted their account on this phone, in this run of the app. */
export interface Deleted {
  readonly name: string;
  readonly species: string;
  /** Never signed in with Apple, Google or email: they can't come back by signing in. */
  readonly anonymous: boolean;
}

let deleted: Deleted | null = null;

/** Set once the server has taken the deletion; only then does the goodbye show. */
export function markDeleted(who: Deleted): void {
  deleted = who;
}

/** The deletion this session made, or null: a goodbye opened any other way closes. */
export function deletedThisSession(): Deleted | null {
  return deleted;
}
