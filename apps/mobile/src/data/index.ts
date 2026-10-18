/**
 * The app's data layer: the phone's encrypted copy of each farm, the outbox, the sockets and the
 * session. Features read and write through the hooks; nothing here draws.
 *
 * Starting it (once, at app start, by the shell):
 *
 *   const { client, session, signIn } = await startData(farmRules, report);
 *   <DataProvider client={client} rules={farmRules}>…</DataProvider>
 *
 * Reading:
 * - `useFarm(farm)`: the farm with this phone's pending writes drawn in (`state`), the confirmed
 *   farm, `lastSeq` and the pending writes. `useFarmSelector(farm, selector, isEqual)` reads one
 *   piece and re-renders only when it changes.
 * - `usePresence(farm)`: who has the farm open and who is writing, apart from the farm.
 * - `useFarmView(farm, now)`: the shared rules' view (sleepy, misty and the rest) at `now`.
 * - `useFarmEvents(farm, limit)`: the newest cached events, oldest first. Older history:
 *   `useDataClient().pageHistory(farm, beforeSeq)`.
 * - `useFarmLink(farm)`: connecting, catching up, live, offline, paused, or blocked with a code
 *   (`rules_outdated` and `protocol_unsupported` mean the app needs an update).
 * - `useCottage()`: the chat list, the cottage's link and whether a safety note waits.
 * - `useRejections()`: writes the farm refused, with their reason, until dismissed.
 * - `useDataStatus()`: `sessionEnded` (offer sign-in) and `banned`.
 *
 * Writing:
 * - `useSend(farm)(kind, payload)` queues a write and draws it at once. It answers `queued` with
 *   its op id, or `refused` with the reason when the shared rules already say no. A queued write
 *   is retried until the farm answers; a rejection is final and shows in `useRejections`.
 *
 * The rest of the API (the profile, the farm list, planting a farm, invites, joining):
 * `useDataClient().api`.
 *
 * Sockets: `useOpenFarm(farm)` keeps a farm's socket open while a screen shows it (the last one
 * held wins). The cottage socket runs while the app is in the foreground and there is a person.
 *
 * Signing in and out: `signIn.withIdToken('apple' | 'google', openSheet)`, `signIn.sendEmailCode`
 * and `signIn.withEmailCode` upgrade the anonymous person (a merge reconnects as the kept one).
 * `client.signOut({force})` answers how many writes would be lost before it wipes anything; then
 * `session.signOut()` and start again with `startData`.
 */
export { startData, type DataRuntime } from './native';
export type { ApiClient } from './api-client';
export type { DataClient, DataStatus } from './data-client';
export type { FarmRules } from './farm-rules';
export type { FarmLink, BlockedCode } from './farm-connection';
export type { CottageLink, CottageState } from './cottage-connection';
export type { EnqueueResult, FarmReplicaState, PendingWrite, SyncReport } from './farm-replica';
export type { StoredEvent, StoredRejection } from './sync-store';
export { SessionEnded, AuthError, type Session, type SessionPerson } from './session';
export type { SignIn } from './sign-in';
export type { PresenceState } from './presence-store';
export {
  DataProvider,
  useCottage,
  useDataClient,
  useFarm,
  useFarmEvents,
  useDataStatus,
  useFarmLink,
  useFarmSelector,
  useFarmView,
  useOpenFarm,
  usePresence,
  useRejections,
  useSend,
} from './react';
