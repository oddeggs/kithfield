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
- `CURRENT_TERMS_VERSION` (in the api) is the Terms version the app must have accepted; an older acceptance shows the Terms again.
- When an anonymous person signs in to an account that already has a person, the two merge. The merge is one D1 batch that checks again, inside the batch, that `from` is still anonymous, so of two sign-ins racing for one person exactly one merges. After it commits, the server puts `PersonMergedJob {kind: person_merged, from, into, at}` on the `deletion` queue; each farm and cottage moves what it keys by person (memberships, snapshot members, chat rows, devices, remember-me seeds) from `from` to `into`. Past events are not rewritten: their actor stays `from`, and readers map it to `into`. The move changes a farm's state outside its log, so the farm marks the seq it had reached, and a phone that says `hello` below that point gets a snapshot.
- A person's name, critter and birthday (day and month, opt-in) are set with `PATCH /v1/me/profile {name?, critter?, birthday?}`, at least one, answering `Me`. Creating or joining a farm needs a name and a critter. The server stores them on the person, then writes `critter_changed` on the person's behalf on every farm they live on, carrying exactly the keys that changed (`name`, `critter`, `birthday`, the same names and types), so each farm's state matches. Nothing is written when nothing changed.
- The mobile app keeps a bearer session in the Keychain. Sockets authenticate with a 5-minute token from `POST /v1/rt-token {farm?}` (with a farm, for that farm's socket; without, for the cottage's), sent in the first frame, never in the URL.
- The app makes its device id on first launch (a UUID kept in the Keychain) and registers with `PUT /v1/devices/:deviceId {platform, name, pushToken, appVersion}`; the person's `CottageDO` keeps the push token. Desktop sign-in by QR (11-13) creates a session for the new device linked from the phone.
- Registering answers with the device's action key. The share extension and notification reply actions send it in the `Kithfield-Action-Key` header to the HTTP command endpoint (CritterPass pattern). Registering again rotates it.
- Age check (03-14) and the Terms acceptance (03-15) are recorded on the person. Accounts under the minimum age are not created.

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
| both | `presence`, `typing` | Never stored. The phone sends `{here}` or `{on}`; the farm sends who is here or writing. Presence drives `farm_opened` at most hourly |
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
reports(id, reporter_id, farm_id, seq, reason, context_json, status, created_at)
moderation_actions(id, report_id, admin_id, action, note, created_at)
bans(person_id, scope, until, reason)
appeals(id, person_id, action_id, status, created_at)
push_ledger(id, person_id, kind, farm_id, sent_at, collapsed)
waitlist(email_hash, email, lang, created_at, confirm_hash, confirmed_at, notified_at)
```

`memberships` and `farms` mirror each farm's members, roles, keeper and name. The mirror is written from the farm's state as it is after the commit, never from the event's payload, and a write that fails is retried, so a late retry can't bring back a membership that has ended. It serves the farm list, push fan-out and the gate's friends-of-friends check. `farm_visitors` records the farms a person left something at or traded with without living there, so account deletion reaches them; `farm_merges` lists the farms a merged-away person lived on until the `person_merged` job is done with them.

The waitlist is double opt-in. A daily job deletes rows nobody confirmed within 7 days, and the raw email is deleted once the one launch letter has gone (`notified_at`); the keyed hash stays.

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
- Nudges: `few` is two a week, `some` four. They back off after two go ignored: one last "I'll stop knocking", then nothing until the person comes back (`design/10`).
- A knock to call (an invite to sit together) is pushed at most once an hour per porch and is never collapsed. It expires after 60 seconds and never becomes a missed-call push.

## 7. Deletion and moderation

- **Unsend** replaces the event's payload with a tombstone and deletes its media; every phone deletes its copy on the next sync. The tombstone keeps the facts the reducer reads (`TOMBSTONE_KEEPS`, `farm-model.md` §2), never content.
- **Account deletion** (11-03): `POST /v1/me/delete` starts 30 days in which signing in cancels it. Then the `deletion` queue walks the person's memberships and tells each `FarmDO` to write `left {how: account_deleted}`, tombstone everything they wrote and delete their media. On farms they only visited, it tombstones their `gate` and `traded` events and then writes `left {how: account_deleted}` with them as actor, so phones there tombstone what they hold too. Friends see "a friend who left". Dew and plants they grew stay, because tombstones keep the facts and no personal data. Their critter leaves a sleeping cottage (04-22). Then the person's D1 rows are deleted, entitlements and the Apple token are revoked, and their R2 export bundle is deleted.
- **Moderation actions** from the console call the admin API (`/admin/v1/*`), which calls the `FarmDO`: remove an event (`unsend {by: safety}`; the target becomes a tombstone naming the rule), remove a member (`removed {by: safety}`), pause a person (`settings_changed {paused}` on their farms: they read but can't post, their critter naps), or freeze a farm (`settings_changed {frozen}`). The safety team writes these with a null actor. A removal holds the original payload and its media for an appeal for 180 days, then drops them for good. After removing a `critter_changed`, `status` or `seed_changed` (a plan edit to its title, days or place), the farm writes a follow-up of the same kind on the person's behalf restoring the previous values (`farm-model.md` §2). An appeal that undoes a removal puts the held payload back and writes `restored`. Account bans live in D1 and are checked when a session or socket token is issued. Every action is in `moderation_actions`, and the reporter hears back (11-21).

## 8. Encryption

TLS in transit; Cloudflare encrypts Durable Object storage, D1 and R2 at rest. There is no end-to-end encryption in v1: server-side search, report review and the opt-in AI features need to read content. The privacy page says so plainly. End-to-end encryption for visits can be considered later.

## 9. Environments

| | dev | prd |
|---|---|---|
| App | `com.kithfield.app.dev` "Kithfield Dev" | `com.kithfield.app` "Kithfield" |
| Workers, D1, R2, Queues | `kithfield-*-dev` | `kithfield-*` |
| Host | `dev.kithfield.com` | `kithfield.com` |

The API is the route `<host>/api/*`; the site serves the rest and `/.well-known/apple-app-site-association`. Invite links are `kithfield.com/i/<code>`, or `kith.fm/<code>` if that domain is bought. Bundle ids are placeholders until the Apple account is set up.

## 10. To verify

- Durable Object limits for the busiest farm: 24 members, a lit fire, a burst of reactions. Measure requests and CPU per event.
- Expo push from Workers, and receipts handling.
- Better Auth's D1 adapter with the anonymous and email-code plugins on Workers.
- The cost of one `CottageDO` notification per member per event on a busy 24-person farm; batch them if it's high.
