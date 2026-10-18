# Kithfield: backend

Decided 18 Oct 2026. Builds on `docs/tech-decisions.md` §3–4 and `docs/farm-model.md`.

## 1. Pieces

| Piece | Kind | Owns |
|---|---|---|
| `api` | Hono Worker | Auth, farm list, invites, media upload URLs, LiveKit tokens, purchases webhook, reports, admin API, and routing sockets and commands to the objects below |
| `FarmDO` | Durable Object, one per farm or visit | The event log, derived farm tables (`farm-model.md`), search, presence, typing, alarms |
| `CottageDO` | Durable Object, one per person | The chat list (latest event and preview per farm), waiting counts for Quick Tend, the push budget and quiet hours, device push tokens |
| D1 `kithfield` | SQLite | People, sessions, memberships, invites, entitlements, reports, bans, the waitlist, the push ledger |
| R2 `kithfield-media` | Object store | Photos, video, voice notes, files, export bundles |
| Queues | `push`, `media`, `ai`, `deletion` | Work done after a write commits |
| `media` Worker | Worker | Signed reads from R2 |
| `admin` Worker | Worker + Cloudflare Access | Serves the moderation console (`design/19`) and proxies to the admin API |

A phone holds at most two sockets: one to its `CottageDO` (home screen, badges, chat list) and one to the `FarmDO` it has open.

## 2. Auth and devices

- Better Auth on D1, anonymous-first: a new install gets an anonymous person. Signing in with Apple, Google, an email code or a phone code upgrades the same person (CritterPass's merge rules).
- The mobile app keeps a bearer session in the Keychain. Sockets authenticate with a 5-minute token from `POST /v1/rt-token`, sent in the first frame, never in the URL.
- Each device registers `{device_id, platform, push_token, app_version}` with its `CottageDO`. Desktop sign-in by QR (11-13) creates a session for the new device linked from the phone.
- The share extension and notification reply actions use a per-device action key (CritterPass pattern) and call the HTTP command endpoint.
- Age check (03-14) and the Terms acceptance (03-15) are recorded on the person. Accounts under the minimum age are not created.

## 3. Farm protocol

JSON frames over the farm socket (`GET /v1/farms/:id/socket`, upgraded and forwarded to the `FarmDO`).

| From | Frame | Meaning |
|---|---|---|
| phone | `hello {token, lastSeq, rulesVersion}` | Join. The farm checks membership |
| farm | `snapshot {seq, state}` | Sent when the phone has nothing, is more than 500 events behind, or has an old rules version |
| farm | `events [{seq, …}]` | Everything after `lastSeq` (or after the snapshot), in batches of 200 |
| phone | `cmd {opId, kind, payload}` | A write. Applied once per `opId` |
| farm | `ack {opId, seq}` / `rejected {opId, reason}` | The outcome. A rejection is final; the outbox drops it and the UI explains |
| farm | `event {…}` | A new event from anyone |
| both | `presence {…}`, `typing {…}` | Never stored; presence drives `farm_opened` at most hourly |

- HTTP equivalents: `POST /v1/farms/:id/cmd` (same body, same idempotency) and `GET /v1/farms/:id/events?after=&before=&limit=` for paging history.
- Search: `GET /v1/farms/:id/search?q=` runs FTS5 inside the farm object.
- After committing an event the farm sends `{farmId, seq, preview, actor}` to each member's `CottageDO`, and enqueues push for members who aren't connected to the farm.
- The socket hibernates when idle, so an open but quiet farm costs almost nothing.

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
waitlist(email_hash, lang, created_at)
```

Farm content never lives in D1. A report copies its context (the reported event and up to 20 events around it) into `reports.context_json`, so evidence survives an unsend; it is deleted when the report closes, plus 90 days.

## 5. Media

- `POST /v1/media/upload-url {farmId, kind, bytes, mime}` returns a presigned R2 PUT (multipart above 50 MB). Keys are `farm/<farmId>/<uuid>`.
- The phone resizes photos (long side 2048 px) and compresses video before upload; voice notes are AAC. No server transcoding in v1.
- Reads go through the `media` Worker with a signed, short-lived URL, checked against membership.
- Cloudflare CSAM scanning runs on the media domain. A match quarantines the object, opens an urgent report and follows the legal reporting duty.

## 6. Push

- Expo's push service sends to APNs and FCM. A direct APNs path is added later for Live Activity updates (the fire room, the day of a plan).
- The `push` queue consumer decides per recipient, in order: muted or hibernating → skip; connected to that farm → skip; quiet hours → hold; budget (from `CottageDO`) → collapse into one "a few things on the farm" push. Copy comes from the notification catalogue (`design/10`). Every send is in `push_ledger`.
- Nudges back off after two are ignored (`design/10`).

## 7. Deletion and moderation

- **Unsend** replaces the event's payload with a tombstone and deletes its media; every phone deletes its copy on the next sync.
- **Account deletion** (11-03): the `deletion` queue walks the person's memberships and tells each `FarmDO` to tombstone everything they wrote and delete their media. Friends see "a friend who left". Dew and plants they grew stay, because they hold no personal data. Their critter leaves a sleeping cottage (04-22). Then the person's D1 rows are deleted, entitlements and the Apple token are revoked, and their R2 export bundle is deleted.
- **Moderation actions** from the console call the admin API, which calls the `FarmDO`: remove an event (tombstone with a reason), remove a member, or freeze a farm. Account bans live in D1 and are checked when a session or socket token is issued. Every action is in `moderation_actions`, and the reporter hears back (11-21).

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
- Better Auth's D1 adapter with the anonymous and phone plugins on Workers.
- The cost of one `CottageDO` notification per member per event on a busy 24-person farm; batch them if it's high.
