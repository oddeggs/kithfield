# Kithfield: backend

Decided 18 Oct 2026. Builds on `docs/tech-decisions.md` §3–4 and `docs/farm-model.md`.

## 1. Pieces

| Piece | Kind | Owns |
|---|---|---|
| `api` | Hono Worker | Auth, farm list, invites, media upload URLs, LiveKit tokens, purchases webhook, reports, admin API, and routing sockets and commands to the objects below |
| `FarmDO` | Durable Object, one per farm or visit | The event log, derived farm tables (`farm-model.md`), search, presence, typing, alarms |
| `CottageDO` | Durable Object, one per person | The chat list (latest event and preview per farm), waiting counts for Quick Tend, the push budget and quiet hours, device push tokens, remember-me seeds |
| D1 `kithfield` | SQLite | People, sessions, memberships, invites, entitlements, reports, bans, the waitlist, the push ledger |
| R2 `kithfield-media` | Object store | Photos, video, voice notes, files, export bundles |
| Queues | `push`, `media`, `ai`, `deletion` | Work done after a write commits |
| `media` Worker | Worker | Signed reads from R2 |
| `admin` Worker | Worker + Cloudflare Access | Serves the moderation console (`design/19`) and proxies to the admin API |

A phone holds at most two sockets: one to its `CottageDO` (home screen, badges, chat list) and one to the `FarmDO` it has open.

## 2. Auth and devices

- Better Auth on D1, anonymous-first: a new install gets an anonymous person. Signing in with Apple, Google or an email code upgrades the same person (CritterPass's merge rules). Email codes go out through Cloudflare Email Sending (the `EMAIL` binding). Phone sign-in is deferred (founder decision, 18 Oct 2026).
- Before each Apple or Google sign-in sheet the app calls `POST /v1/sign-in-nonce` (no body, no session), which answers `{nonce, expiresAt}`. Apple's request takes the SHA-256 of the nonce in hex, Google's the raw nonce. The server requires the nonce in the identity token and consumes it once; an identity token can't be reused. The nonce endpoint is rate-limited per client address.
- Email codes: a wrong code counts against the address only while a code is pending for it, so guesses at an address with nothing sent can't lock it.
- Upgrading ends the anonymous session. A ban revokes the person's sessions.
- `CURRENT_TERMS_VERSION` (in the api) is the Terms version the app must have accepted. `GET /v1/me` carries it as `currentTermsVersion` next to the accepted `termsVersion`; when they differ the app shows the Terms once and posts `POST /v1/me/terms {version}`.
- When an anonymous person signs in to an account that already has a person, the two merge. The merge is one D1 batch that checks again, inside the batch, that `from` is still anonymous, so of two sign-ins racing for one person exactly one merges. After it commits, the server puts `PersonMergedJob {kind: person_merged, from, into, at}` on the `deletion` queue; each farm and cottage moves what it keys by person (memberships, snapshot members, chat rows, devices, remember-me seeds) from `from` to `into`. Past events are not rewritten: their actor stays `from`, and readers map it to `into`. The move changes a farm's state outside its log, so the farm marks the seq it had reached, and a phone that says `hello` below that point gets a snapshot. That snapshot carries `aliases` (merged-away id → kept id): phones draw pre-merge events as the kept person, and the reducer maps actors through it.
- A person's name, critter and birthday (day and month, opt-in) are set with `PATCH /v1/me/profile {name?, critter?, birthday?}`, at least one, answering `Me`. Creating or joining a farm needs a name and a critter. The server stores them on the person, then writes `critter_changed` on the person's behalf on every farm they live on, carrying exactly the keys that changed (`name`, `critter`, `birthday`, the same names and types), so each farm's state matches. Nothing is written when nothing changed.
- The mobile app keeps a bearer session in the Keychain. Sockets authenticate with a 5-minute token from `POST /v1/rt-token {farm?}` (with a farm, for that farm's socket; without, for the cottage's), sent in the first frame, never in the URL.
- The app makes its device id on first launch (a UUID kept in the Keychain) and registers with `PUT /v1/devices/:deviceId {platform, name, pushToken, appVersion}`; the person's `CottageDO` keeps the push token. Desktop sign-in by QR (11-13, 14-16) creates a session for the new device linked from the phone (below).
- Registering also ties the session that registered to that device id (`session_devices`), so one id names both: `GET /v1/devices` lists each device with a live session (its name and platform, a city at most, the day it was last active, and `current` for the one asking), and `DELETE /v1/devices/:deviceId` signs it out. Its sessions end, its push token and action key go, and every farm and cottage socket opened under those sessions closes with `error {session_ended}`; the app then wipes what it holds, as signing out does. Socket tokens carry the session they were minted under, so one minted before the sign-out opens nothing after it.
- **Desktop sign-in by QR**: the computer, with no session, sends `POST /v1/desktop-link {name, platform}` and gets `{code, secret, expiresAt}`. It shows the code as a QR that lives 60 seconds, then asks again for a fresh one. The signed-in phone scans it, reads `GET /v1/desktop-link/:code` (the computer's name, platform and a city at most) and, after Face ID, sends `POST …/approve` (or `…/decline`). Meanwhile the computer asks `POST /v1/desktop-link/:code/session {secret}`: `waiting`, `declined`, or once `approved`, a new session token of its own, handed over once and within five minutes. That session is listed among the person's devices and can be signed out there. Codes are single-use and kept only as hashes; the secret never leaves the computer, so someone who sees the QR can't collect the session. Asking for codes is rate-limited per address (`DESKTOP_LINK_LIMIT`), and looking codes up or answering them per person. The desktop app itself comes with the web and desktop work; the server half is in place. Moving keys over an end-to-end channel is not built: there is no end-to-end encryption in v1 (§8).
- Registering answers with the device's action key. The share extension and notification reply actions send it in the `Kithfield-Action-Key` header to the HTTP command endpoint (CritterPass pattern). Registering again rotates it.
- Age check (03-14) and the Terms acceptance (03-15) are recorded on the person. Accounts under the minimum age are not created.
- **Contact matching is deferred with phone sign-in**: nobody has a verified number yet, so `POST /v1/contacts/match` isn't served and `discoverableByPhone` stays false. The design for when it returns: the phone sends SHA-256 hashes of E.164 numbers over TLS; the server stores and compares only `HMAC(server pepper, hash)` and rate-limits matching, so a leaked database can't be brute-forced back to numbers.
- **Invites**: `GET /v1/invites/:code` is public and answers the `InvitePreview` (the farm's name, land, critters, who made the link, whether it is full and whether keepers approve), also when the farm is full. A link that is unknown, taken back, expired or used up, or whose farm is gone, answers 404 `invite_invalid`, never 410. Joining (`POST /v1/invites/:code/join`) answers 404 `invite_invalid` the same way and 409 `farm_full`. Keepers and helpers read the current link with `GET /v1/farms/:id/invite` (so the server keeps the code readable to them, not only its hash) and replace it with `POST /v1/farms/:id/invites`.

## 3. Farm protocol

JSON frames over the farm socket (`GET /v1/farms/:id/socket`, upgraded and forwarded to the `FarmDO`). The schemas are in `packages/contracts`.

| From | Frame | Meaning |
|---|---|---|
| phone | `hello {protocol, token, lastSeq, rulesVersion}` | Join. The farm checks membership. `lastSeq: 0` means the phone holds nothing; `rulesVersion` is the highest farm rules version the app's reducer implements |
| farm | `snapshot {seq, state}` | Sent only when the phone holds nothing or is more than 500 events behind |
| farm | `events {events, more}` | Everything after `lastSeq` (or after the snapshot), oldest first, at most 200 a batch. `more` is false on the last batch |
| phone | `cmd {opId, kind, payload}` | A write. Applied once per `opId` |
| farm | `event {event}` | A new event from anyone, the writer's own included |
| farm | `ack {opId, seq}` / `rejected {opId, reason}` | The outcome. A rejection is final; the outbox drops it and the UI explains |
| both | `presence`, `typing` | Never stored. The phone sends `{here}` or `{on}`; the farm sends who is here or writing, and with `presence` who is by the fire (`fire`, from LiveKit's webhook, §10; never how long anyone stayed). Presence drives `farm_opened` at most hourly |
| farm | `error {code}` | The socket closes: `unauthorized` (get a new token and say hello again), `not_member`, `banned`, `protocol_unsupported`, `rules_outdated`, `farm_gone` |

- **Order**: after committing a write the farm broadcasts the new `event` to every socket, the writer's included, then sends the writer its `ack`. A rejected write gets only `rejected`.
- **Idempotency**: a duplicate `opId` gets its original outcome. An applied write is acked again with its original seq; a rejected one is rejected again with its original reason, so the farm stores rejected op ids too, for 30 days: an outbox retries within minutes, never a month later.
- **Versions**: `hello` carries `PROTOCOL_VERSION` (1) on both sockets; the server answers `protocol_unsupported` when it can't serve it. Below the farm's rules version the farm answers `rules_outdated`. Either way the app needs an update and its outbox keeps its writes. Otherwise the phone catches up by events, and a `rules_changed` event switches rules. When the rules version must go up is in `farm-model.md` §7.
- **Parsing**: events travel as envelopes whose payload isn't checked, so one unknown kind never fails a batch. Phones sort each event three ways:
  - known: apply it.
  - unknown kind: store the envelope, move `lastSeq` past it, skip it in the reducer.
  - invalid (a known kind that fails its schema): store it raw, move `lastSeq` past it, report its kind, seq and the failing paths (never content), then send `hello` again with `lastSeq: 0` to take the snapshot.

  The farm checks its own writes strictly. A frame type an app doesn't know is ignored, and unknown keys are dropped, so an older app reads a newer server.
- **Keep-alive**: the phone sends the text message `ping`; the farm's hibernation auto-response answers `pong` without waking the object. These are never JSON.
- **HTTP equivalents**: `POST /v1/farms/:id/cmd` takes the same `{opId, kind, payload}` with the same idempotency, and answers `{result: 'ack', opId, seq}` or `{result: 'rejected', opId, reason}`. `GET /v1/farms/:id/events?after=&before=&limit=&kinds=` pages history: with `after` a page starts just after it, with `before` it ends just before it, with neither it is the newest page. Events are oldest first within a page, at most 200.
- **Search**: `GET /v1/farms/:id/search?q=` runs FTS5 inside the farm object.
- **The cottage**: the farm object calls each member's `CottageDO` by RPC:
  - `deliver(CottageDelivery)` for each commit: `{farm, seq, kind, actor, at, preview, forYou, connected}`. Only the farm knows `connected` (whether that member has the farm open). The cottage updates the chat list and decides whether to push (§6). `connected` is never shown in the chat list. The deliveries are owed in the same commit as the event and sent after the farm has answered the writer, so no write waits on a cottage. A delivery that fails is tried again after 1, 5 and 30 minutes, then hourly, and dropped a day after it was owed.
  - `upsertFarm(CottageFarm)` with `{farm, farmKind, name, with}` on `joined`, on a rename and when a visit's peer changes (their name or critter).
  - `leaveFarm(farm)` on `left` and `removed`, for the person who went.
  - `closeSockets(code)` closes the person's cottage sockets with `error {code}`, as when the person is merged away.

  Deliveries may arrive late or out of order: the cottage keeps the newest row per farm, and only a seq it has seen before is a repeat. A delivery for a farm the cottage was never told about (a missed `upsertFarm`) is filled in from D1's `farms` and `people`.
- **The cottage socket**: `GET /v1/cottage/:person/socket`, with the token only in the first frame, never in the URL. The phone says `hello {protocol, token}`; the cottage sends the whole chat list (`chats`), then one changed row at a time (`chat`), and `safety_note` when a note from the safety team is waiting (fetched from `GET /v1/me/safety-notes`; the frame carries no content).
- The socket hibernates when idle, so an open but quiet farm costs almost nothing.

**What the farm object decides.**

- **Times.** The weather is fetched at 05:00 farm time (`farm-model.md` §6). A slow post arrives at 07:00 the next morning, or at 09:00 on the coming Saturday, in the recipient's time zone once their app has sent it (`PATCH /v1/me/settings`), else in the farm's.
- **Edits.** Only messages can be edited. Unsending a message tombstones its edits too.
- **Hibernating.** Someone who joins a farm while hibernating gets `hibernate {on: true}` right after their `joined`.
- **Visits** open only between two people who share a farm now (a farm, not another visit).
- **The gate** is open only to friends of friends: people who share a farm (not a visit) with one of its members. Never to someone removed from that farm. A visitor leaves at most one gesture per farm per farm day, and gate gestures are rate-limited per person (`GATE_LIMIT`, 10 a minute). Visitors never read the chat.
- **Trades.** Two farms trade at most once in a rolling 90 days, and only a visitor the gate would let in can trade. `traded` is written on both farms; the visited farm writes first and owes the other half until it lands.
- **Blocks** apply to visits, the gate and trades: between two people where either blocked the other no visit opens, no gate gesture or trade from one reaches the other, and the gate doesn't show one to the other.
- **Blocks inside a shared farm**: a gesture addressed to one person (firefly, gift, slow post, knock, hug, wave) between two people where either blocked the other is rejected `unavailable` (design 11-12); the rest of the chat is unchanged.
- **Blocks and the fire room**: blocks cover gestures addressed to one person only. Who sits by the fire is room presence, shared with everyone on the farm, blocked or not; leaving the farm, removal, a ban or deleting the account takes a person out of the room at once.

**Wire conventions.** JSON with camelCase keys. Ids are named by their noun: `farm`, `person`, `device`, `report`, never `farmId`. Ids are made by the server, except device ids, which the app makes. Times are epoch milliseconds (integers, UTC), never ISO strings. Calendar days are `YYYY-MM-DD` in the farm's time zone, birthdays `MM-DD`, wall-clock times `HH:MM`.

## 4. D1 schema (outline)

```
people(id, created_at, display_name, critter, age_ok, terms_version, deleted_at)
accounts, sessions, verifications           -- Better Auth tables
memberships(person_id, farm_id, role, joined_at, left_at, muted_until, PRIMARY KEY(person_id, farm_id))
farms(id, kind, name, keeper_id, created_at, size_cap)   -- kind: farm | visit; size_cap 24 (11-05)
invites(code_hash, farm_id, created_by, expires_at, uses_left)
entitlements(person_id, product, source, expires_at)       -- from RevenueCat
gifts(id, from_id, to_id, product, farm_id, created_at, opened_at)
chip_ins, pledges, wishlists, farm_themes, book_orders     -- the shop (§10)
consents(person_id, feature, allowed, text_version, at)    -- AI consent (11-18 to 11-20)
together_consents(subject_id, asker_id, ok, at)             -- together stickers leaving the app
reports(id, reporter_id, farm_id, seq, reason, context_json, status, created_at)
moderation_actions(id, report_id, admin_id, action, note, created_at)
bans(person_id, scope, until, reason)
appeals(id, person_id, action_id, status, created_at)
push_ledger(id, person_id, kind, farm_id, sent_at, collapsed)
waitlist(email_hash, email, lang, created_at, confirm_hash, confirmed_at, notified_at)
```

`memberships` and `farms` mirror each farm's members, roles, keeper and name. The mirror is written from the farm's state as it is after the commit, never from the event's payload, and a write that fails is retried, so a late retry can't bring back a membership that has ended. It serves the farm list, push fan-out and the gate's friends-of-friends check. `farm_visitors` records the farms a person left something at or traded with without living there, so account deletion reaches them; `farm_merges` lists the farms a merged-away person lived on until the `person_merged` job is done with them.

The waitlist is double opt-in. A daily job deletes rows nobody confirmed within 7 days, and the raw email is deleted once the one launch letter has gone (`notified_at`); the keyed hash stays. `POST /v1/waitlist {email, lang, platform?}` answers 200 with a fresh `pick` token every time, listed address or not, so the answer tells nothing. The thank-you page saves a critter with `PUT /v1/waitlist/pick {pick, species}` (204, or 410 for an unknown or expired pick); the pick binds to that request's pending confirmation and takes effect only when the address confirms (`POST /v1/waitlist/confirm {token}`: 204, or 410), never for an address already confirmed before the request.

Farm content never lives in D1. A report copies its context (the reported event and up to 20 events around it) into `reports.context_json`, so evidence survives an unsend; it is deleted when the report closes, plus 90 days.

## 5. Media

- `POST /v1/media/upload-url {farm, kind, bytes, mime}` (kind: photo, video, voice or file; up to 100 MB) returns a presigned R2 PUT, or presigned parts above 50 MB, finished with `POST /v1/media/complete {key, uploadId, parts}`. Keys are `farm/<farm>/<uuid>`.
- The phone resizes photos (long side 2048 px) and compresses video before upload; voice notes are AAC. No server transcoding in v1.
- Reads go through the `media` Worker with signed, short-lived URLs from `POST /v1/media/read-urls {keys}`, checked against membership.
- Cloudflare CSAM scanning runs on the media domain. A match quarantines the object, opens an urgent report and follows the legal reporting duty.

## 6. Push

- Expo's push service sends to APNs and FCM. A direct APNs path is added later for Live Activity updates (the fire room, the day of a plan).
- The app sends `PATCH /v1/me/settings {timeZone, quietHours}` on first launch and whenever the device's time zone changes; the cottage keeps them. Whatever quiet hours say, the house floor holds: no push between 10pm and 8am in the person's time zone. Until the app has sent `timeZone`, the floor holds 22:00–08:00 UTC.
- Each member's `CottageDO` decides from the farm's `CottageDelivery`, in order: muted or hibernating → skip; connected to that farm → skip; quiet hours → hold; budget → collapse into one quiet "a few things" push. Mentions over the budget fold into that quiet push too (this file wins over `design/10`). A push goes on the `push` queue as a `PushJob {person, farm, kind, seq, collapseKey, copy: {key, params}, forYou, at}`: a copy key from the notification catalogue (`design/10`) and its parameters, never rendered text.
- Budgets, per local day: one doorstep push a person, then one quiet "A few things are on your step"; per farm, three mentions and one other push, then one quiet "A few things on the farm"; after that, pushes fold in silently. The budget is spent when the cottage queues the push.
- Anything that wants to push calls `cottage.push(PushJob)`, never the queue directly, so every push passes the budget. A push the queue refuses waits in the cottage and is retried a minute later.
- The `push` queue consumer checks again just before sending: hibernating, a muted farm, a farm the person has left, a knock's age and quiet hours. Then it renders the copy in the person's language and sends. Jobs with the same `collapseKey` fold into one push. Every send is in `push_ledger`.
- A push's `data` is `PushData {farm, seq, kind, push}` (contracts): `push` is the cottage's id for it, which the app sends back with `POST /v1/push/opened` (`PushOpenedRequest {id}`) when the push is opened. When three of a kind from a farm go unopened in a row, that kind rests on the farm.
- Nudges: `few` is two a week, `some` four. They back off after two go ignored: one last "I'll stop knocking", then nothing until the person comes back (`design/10`).
- A knock to call (an invite to sit together) is pushed at most once an hour per porch and is never collapsed. It expires after 60 seconds and never becomes a missed-call push.

## 7. Deletion and moderation

- **Unsend** replaces the event's payload with a tombstone and deletes its media; every phone deletes its copy on the next sync. The tombstone keeps the facts the reducer reads (`TOMBSTONE_KEEPS`, `farm-model.md` §2), never content.
- **Account deletion** (11-03): in the app, `POST /v1/me/delete` (signed in, after Face ID or the passcode; no body) answers 202 `{purgeAt}` and ends every session on every device. From the website (17-11), `POST /v1/deletion-requests {email, lang}` always answers 202 and, when the address signs in to an account, emails a 6-digit code (10 minutes, 5 tries); `POST /v1/deletion-requests/confirm {email, code}` answers 202 `{purgeAt}` the same way, or 400 `code_invalid` whether or not the address has an account. Either way 30 days follow in which signing in cancels the deletion; there is no cancel endpoint. Before deleting, `POST /v1/me/export` prepares the keepsakes zip (`ExportStatus`; `GET /v1/me/export` reads it). Then the `deletion` queue walks the person's memberships and tells each `FarmDO` to write `left {how: account_deleted}`, tombstone everything they wrote and delete their media. On farms they only visited, it tombstones their `gate` and `traded` events and then writes `left {how: account_deleted}` with them as actor, so phones there tombstone what they hold too. Friends see "a friend who left". Dew and plants they grew stay, because tombstones keep the facts and no personal data. Their critter leaves a sleeping cottage (04-22). Then the person's D1 rows are deleted, entitlements and the Apple token are revoked, and their R2 export bundle is deleted.
- **Moderation actions** from the console call the admin API (`/admin/v1/*`), which calls the `FarmDO`: remove an event (`unsend {by: safety}`; the target becomes a tombstone naming the rule), remove a member (`removed {by: safety}`), pause a person (`settings_changed {paused}` on their farms: they read but can't post, their critter naps), or freeze a farm (`settings_changed {frozen}`). The safety team writes these with a null actor. A removal holds the original payload and its media for an appeal for 180 days, then drops them for good. After removing a `critter_changed`, `status` or `seed_changed` (a plan edit to its title, days or place), the farm writes a follow-up of the same kind on the person's behalf restoring the previous values (`farm-model.md` §2). An appeal that undoes a removal puts the held payload back and writes `restored`. Account bans live in D1 and are checked when a session or socket token is issued. Every action is in `moderation_actions`, and the reporter hears back (11-21).
- **The safety desk's share of a purge and a merge.** The purge after 30 days runs each part's registered step; the desk's (`purgeModeration`) deletes the person's safety notes and their filings of reports about others, blanks their appeal texts, clears the copied context and excerpt of reports about them (an escalated one keeps them for the senior or legal look) and tombstones their words in other reports' context. Decisions, bans and the audit log keep the pseudonymous id. A merge's `person_merged` job runs the desk's step (`mergeModeration`) after the farms': filings, reports about the person, appeals and notes move to the kept person, and where both had an open case about the same item the filings join the kept person's case. Reports filed afterwards read a merged-away author as the kept person through the farm's `aliases`. Both steps are safe to run again.
- **Blocks have one source of truth**: the `blocks` table behind `/v1/blocks` (`auth/blocks.ts`). Every check (visits, the gate, trades, addressed gestures, pushes) reads `eitherBlocked`; a report filed with `alsoBlock` writes the same block the app's `PUT /v1/blocks/:person` does (`blockPerson`), and the desk's "blocked by" count reads that table (`blockerCount`).

## 8. Encryption

TLS in transit; Cloudflare encrypts Durable Object storage, D1 and R2 at rest. There is no end-to-end encryption in v1: server-side search, report review and the opt-in AI features need to read content. The privacy page says so plainly. End-to-end encryption for visits can be considered later.

## 9. Environments

| | dev | prd |
|---|---|---|
| App | `com.kithfield.app.dev` "Kithfield Dev" | `com.kithfield.app` "Kithfield" |
| Workers, D1, R2, Queues | `kithfield-*-dev` | `kithfield-*` |
| Host | `dev.kithfield.com` | `kithfield.com` |

The API is the route `<host>/api/*`; the site serves the rest and `/.well-known/apple-app-site-association`. Invite links are `kithfield.com/i/<code>`, or `kith.fm/<code>` if that domain is bought. Bundle ids are placeholders until the Apple account is set up.

Set per environment in `apps/api/wrangler.jsonc`:

| | dev | prd | What it does |
|---|---|---|---|
| `RULES_TARGET` (var) | `4` | `3` | The farm rules version new events are written under, held at or below the server's own `RULES_VERSION` (`farm/wiring.ts`). It stays at the version every phone in the store can read: rules 4 (restoration projects, farm-written themes) goes to prd once a store build reads it. Unset, the server's own version |
| `GATE_LIMIT` | 10 a minute | 10 a minute | Gestures at another farm's gate, per visitor |
| `GATES_LIMIT` | 30 a minute | 30 a minute | `GET /v1/gates`, the farms a person may visit, per person |
| `AI_LIMIT` | 30 a minute | 30 a minute | Asking for a voice note's caption, per person |
| `AI_FARM_LIMIT` | 120 a minute | 120 a minute | Asking for voice-note captions, per farm |
| `AI` (Workers AI) | remote | remote | Voice-note captions, their translation and the Sunday letter. Always runs on Cloudflare, also from `wrangler dev`; the tests stand in for it |
| `SHOP_LIMIT` | 10 a minute | 10 a minute | The shop's writes, per person: purchase syncs, gifts, chip-ins and wall names (namespaces 1261 dev, 1262 prd) |
| `FIRE_LIMIT` | 12 a minute | 12 a minute | Pieces of a speaker's voice sent for live captions, per person, about one every five seconds (namespaces 1263 dev, 1264 prd) |
| `APNS_KEY_ID`, `APNS_TEAM_ID` (vars), `APNS_KEY_P8` (secret) | key `4QN5TUP479`, team `YFND2EEW8S` | the same | The team's APNs key, for Live Activity pushes sent straight to Apple (start, move and end the plan's day). Without the secret, Live Activities move only while the app runs |
| `APNS_HOST` (var) | `api.sandbox.push.apple.com,api.push.apple.com` | `api.push.apple.com` | The APNs hosts, in order; the next is tried only for a token the last called a bad device token (a TestFlight build of Kithfield Dev runs on production) |
| `LIVEKIT_URL` (var), `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` (secrets) | `wss://kithfield-cvm2v8ac.livekit.cloud` | the same project | The fire room's LiveKit project: the key pair mints room tokens and checks LiveKit's webhook. Locally, `livekit-server --dev` (devkey / secret) and `--var LIVEKIT_URL:ws://localhost:7880` |

Two crons (`triggers.crons`, UTC), told apart in `src/index.ts` by `controller.cron`:

- **Daily, `17 3 * * *`**: the waitlist's retention, expired keepsakes exports, the safety desk's retention, the media sweep, chip-ins past their close (promises released, anything paid becomes the payer's credit), and accounts whose 30 days are over go on the `deletion` queue.
- **Hourly, `7 * * * *`**: each farm whose Sunday letter is due goes on the `ai` queue (a `recap` job once Sunday 09:00 has passed in the farm's time zone, late runs included), and the AI's words owed a delete are swept from R2.

The api consumes every queue (`src/queues.ts`), each with a dead-letter queue after 3 retries; `push`, `deletion` and `ai` have handlers, and a batch with none (`media`, so far) is retried rather than acked. The `ai` queue carries `AiJob`s (`recap`, `voice_caption`); its consumer reads consent again before sending anything to Workers AI.

## 10. Purchases, the fire, AI, weather and the native surfaces

The schemas are in `packages/contracts` (`http/shop.ts`, `http/gifts.ts`, `http/webhooks.ts`, `http/fire.ts`, `http/rhythm.ts`, `http/stickers.ts`, `http/ai.ts`, `queues.ts`, `surfaces.ts`).

- **Purchases** go through RevenueCat (StoreKit 2, Play Billing). The app logs in to RevenueCat with the person id, anonymous people too; a person merge moves purchases with a RevenueCat `TRANSFER`. RevenueCat posts `RevenueCatWebhook` to `POST /v1/webhooks/revenuecat` with a shared secret in `Authorization`; the server records entitlements in D1 and acknowledges event types it doesn't act on. After a purchase or a restore the app calls `POST /v1/purchases/sync`, which asks RevenueCat at once and answers `Entitlements`. Product ids are `kf.item.<item>` (non-consumable), `kf.gift.<tier>` and `kf.chipin.<tier>` (consumables) and `PATRON_PRODUCTS`; entitlements are `patron` and `farm_plus`. The server never sends an App Store or Play price: the app shows the store's own. Owned items stay when patronage lapses; patron perks rest. Wearing an item is checked against the person's collection when the profile changes.
- **Gifts**: `POST /v1/gifts` reserves a gift id (refused when the friend owns the item, or `unavailable` between blocked people), the app buys the gift consumable, `POST /v1/gifts/:gift/paid` ties the store transaction to it, and the phone sends `gift {given}` (or the gate gesture) with that id. The farm takes a gift id only from its giver, paid and not given yet. A gift paid for but not given yet (the app closed between the store and the farm) is kept on the giver's phone and given the next time the shop opens; the server can later list a person's paid, ungiven gifts (`GiftView` with `state: 'paid'`) so another phone of theirs can finish them, which no endpoint serves yet.
- **Chip-ins** (a wished-for gift on a member's birthday, a farm theme): members see who chipped in and how full it is, never amounts; the friend a gift is for never sees it. Once covered, the farm writes the gift on behalf of whoever started it (`gift {given, chipIn, with}`), or switches the theme on with `settings_changed {theme}` and a null actor; a theme is the farm's forever. Not covered in time, every pledge is released or refunded.
- **The printed book** is a physical good, so it is paid through Stripe Checkout, never in-app purchase. A split order authorises each share and captures them once covered; uncovered by the deadline, the holds are released. Stripe posts to `POST /v1/webhooks/stripe`, checked against `Stripe-Signature`.
- **The fire room** runs on LiveKit: `POST /v1/farms/:id/fire-token` mints a token for the room `fire-<farm>` with the person id as identity and `FireAttributes` (`mode`, `captionsOk` from the person's consent, `lantern`, `captionsIn`). Its answer says whether live captions can be had at all (`captionsAvailable`: Workers AI and the shop's perks are both wired up). LiveKit posts room and participant events to `POST /v1/webhooks/livekit`, checked against its signed token; the api tells the `FarmDO`, which sends who is by the fire in the `presence` frame, writes `fire {out}` 3 minutes after the last person leaves, and sends no alert push, ever.
- **Live captions** are a patron perk behind the speaker's `captions` consent. While someone has captions on, each consenting speaker's phone sends its own audio in pieces to `POST /v1/farms/:id/fire/captions`; the api transcribes them with Whisper and translates them with the translation model, once per piece, and publishes `FireCaptionLine`s on the room's `captions` data topic to the listeners with captions on whose patron perks are on (their own patronage, or a friend's Farm Plus). Nothing is stored; a speaker who said no shows as "…".
- **AI** runs on Cloudflare Workers AI (`tech-decisions.md` §1). The `ai` queue carries `AiJob`s: the Sunday `recap` (from the messages of members who said yes to `recap`) and `voice_caption` (a voice note whose author said yes to `voice_notes`). Consent is read again when a job runs. Saying no stops sending at once; `…/forget` queues the deletion of what was made for that feature. The recap is served as `WeeklyRecap` (`GET /v1/farms/:id/recap`): its best pollinator rotates week to week and is chosen for a kind of care, never a count; with nobody saying yes the app writes the letter itself, with no AI. A yes counts only when given to the consent words in force (the app's `CONSENT_TEXT_VERSION`, the api's `AI_CONSENT_TEXT_VERSION`). A voice note is captioned when a friend asks (`POST /v1/farms/:id/voice/:seq/caption {lang}`, then `GET …?lang=`; at most 30 asks a minute per person and 120 per farm): Whisper hears it once, claimed so languages asked together share the run, and other languages are translated from that; nothing heard is final. A forwarded voice note is never captioned (its voice said yes nowhere here), nor is anything between two people where either blocked the other. The letter is written from the yes-sayers' messages as last edited, never what they forwarded, with people and the farm as placeholders: names reach it only through them, and a letter naming anyone otherwise is refused, as is one with numerals, counting, ranking or streak words, or a run of words lifted from a message (a quote translated into the other language isn't caught; the prompt asks for none). The hourly cron sends each due farm to the `ai` queue, which queues the latest week once Sunday 09:00 has passed in the farm's time zone, late runs included. What the AI made is kept as JSON in R2 under `ai/`, indexed in D1 without its words, and served only after a last look at consent; a caption goes with its voice note's media (unsend, removal with media, quarantine, account deletion), a safety removal drops it at once (the audio stays for an appeal), `…/forget` or account deletion deletes the person's captions and every letter their words went into, and a farm that is gone takes all of it.
- **Weather** comes from WeatherKit's REST API, fetched at 05:00 farm time for the keeper's town (`farm-model.md` §6). `GET /v1/weather/attribution` answers `WeatherAttribution`, Apple's mark and legal link, cached by the server, shown wherever the weather changes the farm.
- **Native surfaces** read the App Group: the app writes `SurfaceData` and the PNGs it renders, and widgets work out lit windows (opened in the last 3 hours) and sleepiness against "now". Notification actions (`NOTIFICATION_ACTIONS`: I'm in, Can't this time, Leave a dewdrop) send the command `actionCommand` builds to `POST /v1/farms/:id/cmd` with the device's action key. Live Activity tokens are registered with `PUT /v1/devices/:deviceId/activity-start` and `…/activities`; a silent push carrying `SurfaceRefreshData` asks the app to rewrite the surfaces, which is how a widget learns the fire is lit. The share extension sends what it can and leaves the rest as `ShareDraft`s for the app.

## 11. To verify

- Durable Object limits for the busiest farm: 24 members, a lit fire, a burst of reactions. Measure requests and CPU per event.
- Expo push from Workers, and receipts handling.
- Better Auth's D1 adapter with the anonymous and email-code plugins on Workers.
- The cost of one `CottageDO` notification per member per event on a busy 24-person farm; batch them if it's high.
