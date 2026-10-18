# @kithfield/contracts

The wire contracts every part of Kithfield codes against: farm events, commands, socket frames, the
snapshot and the HTTP bodies, as zod schemas with inferred types (`FarmEvent`, `FarmCommand`,
`FarmClientFrame`, `FarmServerFrame`, `Snapshot`, and the request and response bodies). Change them
only through the contracts owner.

## Wire conventions

- **JSON, camelCase keys.** Database columns (`op_id`, `rules_version`) map to `opId`, `rulesVersion`.
- **Instants are epoch milliseconds**: integers, UTC, everywhere (`at`, `expiresAt`, `lastOpenedAt`).
  Never ISO strings.
- **Calendar days** are `YYYY-MM-DD` in the farm's time zone; birthdays are `MM-DD`; wall-clock times
  are `HH:MM`.
- **`opId`** is a lowercase UUIDv7 made by the writer. The farm mints one for the events it writes.
- **`seq`** starts at 1. `lastSeq: 0` in `hello` means the phone holds nothing.
- **Ids** (people, farms, devices, reports) are server-made, URL-safe, at most 64 characters.
- **`actor`** is a person id, or `null` when the farm or the safety team wrote the event.
- A removed, unsent or deleted author's event keeps its `seq` and `kind`; its `payload` becomes a
  `Tombstone`. Check with `isTombstone`.
- **Protocol version**: `PROTOCOL_VERSION` (1), sent in `hello` on both sockets.
- Objects strip unknown keys, so an older phone can read a newer server's events.

## House rules in the schemas

No streaks, no counts of care, no read receipts. `dew` and `today` in the snapshot are inputs for
the shared reducer and are never drawn as numbers; credits carry people and kinds of care only.
