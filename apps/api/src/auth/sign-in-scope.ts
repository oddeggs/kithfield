import { AsyncLocalStorage } from 'node:async_hooks';

import type { Language } from '@kithfield/i18n';

/** What one auth request knows and has done so far, shared between Better Auth's hooks. */
interface SignInScope {
  /** The language the request asked for, for any letter it sends. */
  readonly language: Language;
  /** People Better Auth created during this request. */
  readonly created: Set<string>;
  /** Whether a letter failed to send; Better Auth only logs it, so the hooks answer for it. */
  letterFailed: boolean;
  /** Whether a sign-in code was waiting for the address this request tries one for. */
  codePending: boolean;
}

const storage = new AsyncLocalStorage<SignInScope>();

/** Runs one auth request with its own scope. */
export function withSignInScope<T>(language: Language, run: () => Promise<T>): Promise<T> {
  return storage.run(
    { language, created: new Set(), letterFailed: false, codePending: false },
    run,
  );
}

export function scopeLanguage(): Language {
  return storage.getStore()?.language ?? 'en';
}

export function markCreated(person: string): void {
  storage.getStore()?.created.add(person);
}

/**
 * Whether Better Auth created this person during the current request. A sign-in that created
 * someone new is an identity seen for the first time; one that found someone is a returning person.
 */
export function wasCreatedNow(person: string): boolean {
  return storage.getStore()?.created.has(person) ?? false;
}

export function markLetterFailed(): void {
  const scope = storage.getStore();
  if (scope) scope.letterFailed = true;
}

export function letterFailed(): boolean {
  return storage.getStore()?.letterFailed ?? false;
}

export function markCodePending(): void {
  const scope = storage.getStore();
  if (scope) scope.codePending = true;
}

export function codeWasPending(): boolean {
  return storage.getStore()?.codePending ?? false;
}
