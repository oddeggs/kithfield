# @kithfield/contracts

The wire contracts every part of Kithfield codes against: farm events, commands, socket frames, the
snapshot and the HTTP bodies, as zod schemas with inferred types (`FarmEvent`, `FarmCommand`,
`FarmClientFrame`, `FarmServerFrame`, `Snapshot`, and the request and response bodies). Change them
only through the contracts owner.

## Wire conventions

- **JSON, camelCase keys.** Database columns (`op_id`, `rules_version`) map to `opId`, `rulesVersion`.
- **Ids are named by their noun**: `farm`, `person`, `device`, `report`, `action`, `appeal` hold
  the id itself. There are no `farmId`-style keys. A field holding something else says so
  (`farmName`, `farmKind`).
- **Instants are epoch milliseconds**: integers, UTC, everywhere (`at`, `expiresAt`, `pausedUntil`).
  Never ISO strings.
- **Calendar days** are `YYYY-MM-DD` in the farm's time zone; birthdays are `MM-DD`; wall-clock times
  are `HH:MM`.
- **`opId`** is a lowercase UUIDv7 made by the writer. The farm mints one for the events it writes.
- **`seq`** starts at 1, and seq 1 is always `farm_created`. `lastSeq: 0` in `hello` means the
  phone holds nothing.
- **`day`** on every event is the farm's local day (`YYYY-MM-DD`) it happened on, set by the farm
  at commit from the farm's time zone. Day rules (caps, roses) read it, never device time-zone
  data. Required from rules version `DAY_FROM_RULES_VERSION` (2); development data written under
  rules version 1 may lack it.
- **Ids** are URL-safe, at most 64 characters, and made by the server (people, farms, reports),
  except device ids, which the app makes on first launch (`PUT /v1/devices/:deviceId`).
- **`actor`** is a person id. It is null only for the farm's own kinds (`farm_created`, `weather`,
  `shared_rain`, `season_rolled`, `harvested`, `rules_changed`, `restored`) and for what the farm or
  the safety team writes on `unsend` (`by: safety`), `removed` (`by: safety`), `settings_changed`
  (`frozen`, `paused`, and the keeper handover `role: keeper` when the last keeper leaves or is
  removed, given to the longest-standing remaining member) and `fire` (`out`).
- The farm writes `ON_BEHALF_KINDS` on a person's behalf, with that person as actor: `joined`,
  `farm_opened`, `hibernate`, `gate`, `traded`, and `critter_changed`, `status` and `seed_changed`
  (also phone commands). After a safety removal of a `critter_changed`, `status` or `seed_changed`,
  the farm writes a follow-up of the same kind restoring the previous values. For a plan edit that
  changed its title, days or place, the follow-up restores the planter's plan, with the editor of
  the removed edit as actor.
- A profile change (`PATCH /v1/me/profile`, `MeProfileUpdate`) reaches every farm the person lives
  on as a `critter_changed` the farm writes on their behalf, with exactly the changed keys: `name`,
  `critter` and `birthday` map one to one onto its payload.
- A removed, unsent or deleted author's event keeps its `seq` and `kind`; its `payload` becomes a
  `Tombstone`. Check with `isTombstone`. The farm builds it with `tombstoneOf`, which keeps the
  facts the reducer reads (`TOMBSTONE_KEEPS`), so a phone catching up past an unsend or a deleted
  account grows the farm the same. `settings_changed` is the farm's, never tombstoned. A tombstoned
  `joined` adds a nameless member (it keeps the critter and `via`); a tombstoned `status` clears
  the bubble whose `seq` it was.
- Account deletion tombstones everything the person wrote on their farms and visits. On farms they
  only visited it tombstones their `gate` and `traded` events, then writes `left {how:
  account_deleted}` with them as actor.
- An appeal that undoes a removal writes `restored`; phones refetch the target by paging and the
  reducer applies it once the target is back. The snapshot is the truth.
- **Protocol version**: `PROTOCOL_VERSION` (1), sent in `hello` on both sockets. The server compares
  it and answers `protocol_unsupported` when it can't serve it. Adding `day` to the envelope didn't
  change it: frames are unchanged, and older apps drop the key. What changed is a rule (which day
  an event counts on), so it rides on the rules version instead.

## Forward compatibility

- Objects strip unknown keys, so an older app reads a newer server's payloads.
- Events travel as `EventEnvelope`s (in `events` and `event` frames and `EventsPage`): the envelope
  is checked, the payload isn't, so one unknown kind never fails a batch. Phones sort each with
  `parseEvent` into one of three:
  - `known`: apply it.
  - `unknown` (a kind not in `EVENT_KINDS`): store the raw envelope, advance `lastSeq` past it and
    skip it in the reducer.
  - `invalid` (a known kind whose envelope or payload fails): store it raw, advance `lastSeq` past
    it, report its kind, seq and issue paths (never content), then send `hello` again with
    `lastSeq: 0` to take the farm's snapshot.
- The farm object parses its own writes with the strict `FarmEvent.parse` only.
- **Any new kind that changes growth ships with a rules-version bump**, and so does widening an
  enum inside a known kind's payload or a snapshot field. An app below the farm's rules version
  gets `rules_outdated` instead of growing the farm differently.
- The exception is display-only enums, which are open strings on the wire: `Reaction`, `Warmth`
  and `WeatherSource`. Apps draw the ones they know (`KNOWN_REACTIONS`, `KNOWN_WARMTHS`,
  `KNOWN_WEATHER_SOURCES`) and fall back for the rest. Credited kinds in the snapshot are open
  too.
- A frame `type` an app doesn't know parses to `{type: 'unknown', received}`; ignore it.

## Socket rules

- After committing a write, the farm broadcasts the new `event` to every socket, the writer's
  included, then sends the writer its `ack`. A rejected write gets only `rejected`.
- A duplicate `opId` is answered with its original outcome: an applied write is acked again with its
  original seq, a rejected one stays rejected with its original reason. The farm stores rejected op
  ids too. A rejection is final; the outbox drops the write.
- `hello.rulesVersion` is the highest farm rules version the app's reducer implements. Below the
  farm's current version the farm answers `error {rules_outdated}`; otherwise the phone catches up
  by events, and a `rules_changed` event switches rules. A snapshot is sent only when the phone
  holds nothing or is more than 500 events behind.
- An app too old for the farm gets a socket `error` (`rules_outdated` or `protocol_unsupported`)
  and its outbox keeps the write.
- Keep-alive: the phone sends the `PING` string (`'ping'`) as a plain text message; the farm's
  hibernation auto-response answers `PONG` (`'pong'`) without waking the object. Never JSON.

## The cottage

- After committing an event, the farm object calls each member's cottage with a `CottageDelivery`:
  the `CottageNotice` plus `connected`, which only the farm knows (whether that member has the farm
  open). The cottage updates the chat list and decides whether to push.
- A push goes on the queue as a `PushJob` with a copy key and parameters, never rendered text; the
  push consumer renders it in the person's language, checks quiet hours and the budget, sends and
  writes the ledger. `connected` is never shown in the chat list.
- History pages: with `after`, a page starts just after it; with `before`, it ends just before it;
  with neither, it is the newest page. Events are oldest first within a page.

## Accounts, the website and deferred parts

- **Person merges**: after a `person_merged` job reaches a farm, its snapshot carries `aliases`
  (merged-away id → kept id). Phones draw pre-merge events as the kept person, and the reducer maps
  actors through it before applying.
- **Account deletion**: in the app, `POST /v1/me/delete` (no body) answers 202
  `DeleteAccountResponse {purgeAt}` and ends every session. From the website,
  `DeletionRequest` → a 6-digit code by email → `DeletionConfirmRequest` → 202
  `DeleteAccountResponse`, or 400 `code_invalid`; the first step always answers 202. Signing in
  within the 30 days cancels; there is no cancel endpoint.
- **The launch list**: `POST /v1/waitlist` always answers 200 `WaitlistResponse {pick}`, listed
  or not; the pick (`WaitlistPickRequest`) counts only once that address confirms.
- **Invites**: `GET /v1/invites/:code` answers `InvitePreview` or 404 `invite_invalid`, never 410.
- **Terms**: `Me.currentTermsVersion` is the version in force; the app asks again when
  `Me.termsVersion` differs.
- **Contact matching is deferred** with phone sign-in: `ContactMatchRequest`,
  `ContactMatchResponse` and `discoverableByPhone` stay in the contracts but aren't served. When
  they return, the server stores and compares only `HMAC(server pepper, SHA-256 hash)` and
  rate-limits matching.

## House rules in the schemas

No streaks, no counts of care, no read receipts. `dew` and `today` in the snapshot are inputs for
the shared reducer and are never drawn as numbers; credits carry people and kinds of care only.
