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
- **Ids** (people, farms, devices, reports) are server-made, URL-safe, at most 64 characters.
- **`actor`** is a person id. It is null only for the farm's own kinds (`farm_created`, `weather`,
  `shared_rain`, `season_rolled`, `harvested`, `rules_changed`, `restored`) and for what the farm or
  the safety team writes on `unsend` (`by: safety`), `removed` (`by: safety`), `settings_changed`
  (`frozen`, `paused`) and `fire` (`out`).
- A removed, unsent or deleted author's event keeps its `seq` and `kind`; its `payload` becomes a
  `Tombstone`. Check with `isTombstone`. An appeal that undoes a removal writes `restored`; phones
  refetch the target by paging.
- **Protocol version**: `PROTOCOL_VERSION` (1), sent in `hello` on both sockets. The server compares
  it and answers `protocol_unsupported` when it can't serve it.

## Forward compatibility

- Objects strip unknown keys, so an older app reads a newer server's payloads.
- Events travel as `EventEnvelope`s (in `events` and `event` frames and `EventsPage`): the envelope
  is checked, the payload isn't, so one unknown kind never fails a batch. `parseEvent` sorts each
  into a known `FarmEvent` or an unknown envelope. A known kind whose payload fails (say, a newer
  enum value) counts as unknown.
- **Clients store unknown events, advance `lastSeq` past them and skip them in the reducer.**
- **Any new kind that changes growth ships with a rules-version bump**, so an app that can't apply
  it gets `rules_outdated` instead of growing the farm differently.
- A frame `type` an app doesn't know parses to `{type: 'unknown', received}`; ignore it.

## Socket rules

- After committing a write, the farm broadcasts the new `event` to every socket, the writer's
  included, then sends the writer its `ack`. A rejected write gets only `rejected`.
- A duplicate `opId` is answered with its original outcome: an applied write is acked again with its
  original seq, a rejected one stays rejected with its original reason. The farm stores rejected op
  ids too. A rejection is final; the outbox drops the write.
- An app too old for the farm gets a socket `error` (`rules_outdated` or `protocol_unsupported`)
  and its outbox keeps the write.
- Keep-alive is the bare text `ping` (`PING`), answered with `pong` (`PONG`) by the hibernation
  auto-response, without waking the farm.

## House rules in the schemas

No streaks, no counts of care, no read receipts. `dew` and `today` in the snapshot are inputs for
the shared reducer and are never drawn as numbers; credits carry people and kinds of care only.
