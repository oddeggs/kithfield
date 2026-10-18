/**
 * The app's data layer: the phone's encrypted copy of each farm, the outbox, the sockets and the
 * session. Features read and write through the hooks; nothing here draws.
 *
 * Starting it (once, at app start, by the shell):
 *
 *   const { client, session, auth } = await startData(farmRules);
 *   <DataProvider client={client} rules={farmRules}>…</DataProvider>
 *
 * Reading:
 * - `useFarm(farm)`: the farm with this phone's pending writes drawn in (`state`), the confirmed
 *   farm, `lastSeq`, pending writes, presence and typing.
 * - `useFarmView(farm, now)`: the shared rules' view (sleepy, misty and the rest) at `now`.
 * - `useFarmEvents(farm, limit)`: the newest cached events, oldest first. Older history:
 *   `useDataClient().pageHistory(farm, beforeSeq)`.
 * - `useFarmLink(farm)`: connecting, catching up, live, offline, paused, or blocked with a code
 *   (`rules_outdated` and `protocol_unsupported` mean the app needs an update).
 * - `useCottage()`: the chat list, the cottage's link and whether a safety note waits.
 * - `useRejections()`: writes the farm refused, with their reason, until dismissed.
 *
 * Writing:
 * - `useSend(farm)(kind, payload)` queues a write and draws it at once. It answers `queued` with
 *   its op id, or `refused` with the reason when the shared rules already say no. A queued write
 *   is retried until the farm answers; a rejection is final and shows in `useRejections`.
 *
 * Sockets: `useOpenFarm(farm)` keeps a farm's socket open while a screen shows it (the last one
 * held wins). The cottage socket runs while the app is in the foreground.
 */
export { startData, type DataRuntime } from './native';
export type { DataClient } from './data-client';
export type { FarmRules } from './farm-rules';
export type { FarmLink, BlockedCode } from './farm-connection';
export type { CottageLink, CottageState } from './cottage-connection';
export type { EnqueueResult, FarmReplicaState, PendingWrite, SyncReport } from './farm-replica';
export type { StoredEvent, StoredRejection } from './sync-store';
export type { Session, SessionPerson } from './session';
export {
  DataProvider,
  useCottage,
  useDataClient,
  useFarm,
  useFarmEvents,
  useFarmLink,
  useFarmView,
  useOpenFarm,
  useRejections,
  useSend,
} from './react';
