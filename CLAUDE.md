# Kithfield: agent contract

Binding for every coding agent working on Kithfield (`oddeggs/kithfield`, branch `main`).

## Read before coding

1. Your lane in [plans/261018-1500-kithfield-full-build/plan.md](plans/261018-1500-kithfield-full-build/plan.md): its inputs, owns list and done-when.
2. [docs/tech-decisions.md](docs/tech-decisions.md), plus [docs/farm-model.md](docs/farm-model.md) for anything that grows, sleeps or counts, and [docs/backend.md](docs/backend.md) for anything that talks to the server.
3. The design for your screens: `design/<NN> *.dc.html`, with the screen ids your lane lists, the "Notes for the developer" table at the end of each file, and `design/renders/<id>.png` once the render tool exists.

Precedence: docs > design notes > design visuals > older reports.

## The bar

- **Native feel is the product.** UI-thread animation only (Reanimated worklets, Gesture Handler). Timings and curves come from `@kithfield/theme` motion tokens, which are taken from `01 Foundations` and `design/kf-motion.js`. No JS-thread `Animated`.
- **Art is never redrawn by hand.** Every critter, plant and scene comes from `@kithfield/art` (the synced `design/kithfield-art.js`). Draw once into a cached image, then move it with transforms.
- **Pixel- and colour-exact.** Size, spacing, type and colour come from `@kithfield/theme`. Compare with `design/renders/` before calling UI done.
- **The house rules are product requirements:** no streaks, no counts of care, no read receipts, nothing dies, care is always free.
- **Real behaviour only.** No fake timers or stubbed servers left in features.

## How to work

- **Owns list.** Change only the files your lane owns. If you need a change elsewhere, stop and report `NEEDS_CONTEXT` with the exact change.
- **Contracts are frozen.** `packages/contracts` (events, commands, frames, snapshot) changes only through its owner lane. Code against it; don't fork types.
- **Tests where they protect behaviour:** the farm reducer, protocol and sync, idempotency, auth, purchases, deletion, moderation, art goldens. No snapshot tests of UI. Run only the files you changed: `pnpm --filter @kithfield/<pkg> test -- <file>`.
- **No ids in code.** No plan, wave, lane or screen ids in code, comments, test names or commit subjects.
- **Undesigned states** are built from existing components and logged in `docs/undesigned-states.md` (screen, state, reason).
- Copy is never hard-coded: it comes from `@kithfield/i18n` (en + vi), one catalogue file per feature.

## Repo conventions

- Packages are `@kithfield/<dir>`, ESM, export TypeScript source. Versions live in the `catalog:` of `pnpm-workspace.yaml`, pinned like 6pm.
- TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`). Named exports except route files and configs. Files ≤ 300 lines.
- Relative imports are extensionless (Metro).
- D1 migrations: one file each, `apps/api/migrations/NNNN_<what>.sql`, using the number range your lane is given.
- Run `pnpm exec prettier --write` on what you changed.

## Tools

Agents run autonomously and may use any suitable tool without asking: chrome-devtools MCP (web pages, the design files, Workers in the browser), computer use (the simulator, Xcode, native apps), agent-device and the Expo MCP (simulators, devices, builds, screenshots), the Cloudflare MCP and plugin skills, and any installed skill that fits the task (Expo, Cloudflare, Wrangler, Durable Objects, code review). Use them to check your own work: screenshot the screen, compare it with `design/renders/`, fix, repeat.

## This Mac

- Native work is checked on the local iOS simulator; `apps/mobile/ios` is generated and ignored (`expo prebuild -p ios --clean` after native changes).
- Workers run locally with `wrangler dev`; never deploy from a lane.
- Kill only process ids you started. Never `pkill -f` or `killall`. Never `git stash`.
- Temp files go in the session scratchpad, never the repo.

## Secrets

Only `.env.example` and `.dev.vars.example` are committed. Never print a secret value; list names only.

## Commits

Each lane works on its own branch (`feat/<area>-<behaviour>`) in its own worktree; conventional commits; one commit per task; no AI references or attribution lines (no `Co-Authored-By`, no session links).

## Status

End every pass with:

```
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Summary: one or two sentences
Evidence: tests run, screenshots compared; what was not checked
Concerns/Blockers: optional
```
