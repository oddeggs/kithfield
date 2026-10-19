/**
 * The app's data layer: the phone's encrypted copy of each farm, the outbox, the sockets and the
 * session. Features read and write through the hooks; nothing here draws.
 *
 * Starting it (once, at app start, by the shell; `startAppData` shares one start across remounts
 * and `forgetAppData()` lets the next call start again):
 *
 *   const { client, session, signIn, network } = await startAppData(kithfieldRules, report, {
 *     heldElsewhere, // what the person keeps outside the data layer (the media queue)
 *   });
 *   <DataProvider client={client} rules={kithfieldRules} network={network}>…</DataProvider>
 *
 * `network` is a switch that cuts the data layer's network (development builds only; null in
 * release), read with `useNetworkSwitch()`.
 *
 * Reading:
 * - `useFarm(farm)`: the farm with this phone's pending writes drawn in (`state`), the confirmed
 *   farm, `lastSeq` and the pending writes. `useFarmSelector(farm, selector, isEqual)` reads one
 *   piece and re-renders only when it changes.
 * - `usePresence(farm)`: who has the farm open and who is writing, apart from the farm.
 * - `useFarmView(farm, now)`: the shared rules' view (sleepy, misty and the rest) at `now`.
 * - `useFarmEvents(farm, limit)`: the newest cached events, oldest first. Older history:
 *   `useDataClient().pageHistory(farm, beforeSeq)`.
 * - `useDataClient().catchUp(farm)`: brings a farm whose socket isn't open up to date over HTTP,
 *   or answers `needs_socket` when only a snapshot can (nothing held, or too far behind).
 * - `useFarmLink(farm)`: connecting, catching up, live, offline, paused, or blocked with a code
 *   (`rules_outdated` and `protocol_unsupported` mean the app needs an update).
 * - `useCottage()`: the chat list, the cottage's link and whether a safety note waits.
 * - `useRejections()`: writes the farm refused, with their reason, until dismissed.
 * - `useDataStatus()`: `sessionEnded` (offer sign-in) and `banned`.
 *
 * Writing:
 * - `useCanWrite(farm)(actor, write)` dry-runs a write by the same rules, queuing nothing, so a
 *   screen offers only what the farm would take.
 * - `useSend(farm)(kind, payload)` queues a write and draws it at once. It answers `queued` with
 *   its op id, or `refused` with the reason when the shared rules already say no. A queued write
 *   is retried until the farm answers; a rejection is final and shows in `useRejections`.
 *
 * The rest of the API: `useDataClient().api`. The profile, the farm list, planting a farm,
 * invites (`invite(code)` previews one without a session; null for a link that's gone), joining,
 * the age check (`age`: `ok` or `under_age`), the Terms, opening a visit, Quick Tend, remember-me
 * seeds, blocks, and media uploads, read URLs and copies. Anything else signed in:
 * `api.request(schema, method, path, body?)`. Each answer is checked against its contract; a
 * failure is an `ApiError` with the status and the API's code.
 *
 * A call's 401 asks for one re-check of the session (a burst of 401s shares it) and, if the
 * session is still live, tries the call once more. A session confirmed gone (the re-check, the
 * launch check, or a socket's `session_ended`) stops the sockets, counts the writes still waiting
 * (`unsent_at_session_end`) and wipes this person's data as signing out does, the media queue
 * included, then sets `useDataStatus().sessionEnded`. That count (and a forced sign-out's) is kept
 * in the Keychain: the sign-in screen reads it once with `takeUnsentNotice()` (null when nothing
 * was lost) to tell the person what didn't send.
 *
 * Sockets: `useOpenFarm(farm)` keeps a farm's socket open while a screen shows it (the last one
 * held wins). `useDataClient().reconnect(farm)` opens the held farm again at once (Try again).
 * The cottage socket runs while the app is in the foreground and there is a person.
 *
 * Signing in and out: `signIn.withIdToken('apple' | 'google', openSheet)`, `signIn.sendEmailCode`
 * and `signIn.withEmailCode` upgrade the anonymous person (a merge reconnects as the kept one).
 * `client.signOut({force})` answers how many writes would be lost (messages still uploading
 * included) before it wipes anything, the media queue with the tables; then
 * `session.signOut()` and start again with `startAppData` after `forgetAppData()`.
 */
export {
  forgetAppData,
  startAppData,
  startData,
  takeUnsentNotice,
  type DataRuntime,
  type StartOptions,
} from './native';
export type { UnsentNotice, UnsentReason } from './unsent-notice';
export { kithfieldRules } from './farm-rules';
export type { NetworkSwitch } from './dev-network';
export {
  ApiError,
  type AgeAnswer,
  type ApiClient,
  type ApiRequest,
  type HttpMethod,
} from './api-client';
export type { CatchUp, DataClient, DataStatus, HeldElsewhere } from './data-client';
export type { CommandCheck, FarmRules } from './farm-rules';
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
  useNetworkSwitch,
  useOpenFarm,
  usePresence,
  useRejections,
  useSend,
  useCanWrite,
} from './react';
