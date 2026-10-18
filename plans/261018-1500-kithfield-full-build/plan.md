# Kithfield: full build

Status: planned · 18 Oct 2026
Inputs: `docs/tech-decisions.md`, `docs/farm-model.md`, `docs/backend.md`, `design/00 Cover.dc.html` (index of every screen), `CLAUDE.md` (agent contract).

## How this plan runs

The plan is built for parallel subagents, not one developer.

- **Waves run in order; lanes inside a wave run at the same time.** Each lane is one agent in its own git worktree and branch, with a disjoint owns list, so lanes never edit the same files.
- **Contracts first.** Wave 0 freezes `packages/contracts` (event kinds, commands, socket frames, snapshot, API bodies), the theme tokens and the plant catalogue. Every later lane codes against them. A lane that needs a contract change reports `NEEDS_CONTEXT`; the contracts lane makes the change between waves.
- **A run** is one agent session that takes a lane from its inputs to its done-when (or to a clean stopping point). Estimates below are runs per lane. Every lane also gets one **review run** (an independent reviewer agent checking the diff against the done-when) and, when needed, one fix run.
- **Between waves**, one integration agent merges the lanes in the listed order, resolves conflicts, runs the full test suite and the wave gate, and fixes what breaks. Nothing starts in the next wave until the gate passes.
- **Concurrency**: at most 8 lanes at once. Wall-clock is driven by the longest lane in each wave (the critical path column).

### Shared-file rules (where parallel lanes would otherwise collide)

| Hotspot | Rule |
|---|---|
| Routes | Each feature owns its own route folder under `apps/mobile/src/app/(feature)/`. Only the shell lane edits `_layout.tsx` and the tab bar |
| i18n | One catalogue file per feature: `packages/i18n/src/<feature>.en.ts` / `.vi.ts`. `pnpm --filter @kithfield/i18n gen` writes `catalogues.generated.ts`; re-run it after a merge conflict |
| D1 migrations | Number ranges per lane (below; the farm object lane, 1d, takes `0400–0449`). Never edit another lane's migration |
| Contracts | Owned by the contracts lane only |
| `package.json` dependencies | A lane may add dependencies only to the packages it owns, at versions already in the catalogue; new catalogue entries go through the integration agent |
| Native config (`app.config.ts`, `targets/`) | Owned by the native-surfaces lane from wave 3; earlier lanes request changes through `NEEDS_CONTEXT` |

## Waves

### Wave 0: Foundation · critical path 2 runs

| Lane | Owns | Does | Runs | Done when |
|---|---|---|---|---|
| 0a Scaffold | repo root, `apps/*` skeleton configs, `.github/` | pnpm workspace with 6pm's catalogue pins; TS/ESLint/Prettier/Vitest/Jest; Expo app skeleton (dev and prd variants); `apps/api` Worker with `FarmDO`/`CottageDO` bindings, D1, R2, Queues in `wrangler.jsonc`; `apps/web` and `apps/admin` skeletons; CI for lint, typecheck and tests | 1 | `pnpm i && pnpm typecheck && pnpm test` green in CI; the app boots to a blank screen on the simulator; `wrangler dev` answers `/api/health` |
| 0b Contracts | `packages/contracts`, `packages/farm/src/catalog.ts` | zod schemas for every event kind (`farm-model.md` §2), commands, socket frames and HTTP bodies (`backend.md` §3), the snapshot, report and moderation bodies; the plant catalogue (24 plants + rose, signature pool, porch pot) | 1 (after 0a) | Every frame and event in the docs has a schema with a round-trip test; reviewed against both docs |
| 0c Theme | `packages/theme`, `tools/fonts` | Colour (day, night), type scale, spacing, radii from `01 Foundations`; motion tokens from `01 Foundations` and `design/kf-motion.js`; embedded fonts (Young Serif, Gaegu, Patrick Hand, Lora) with Vietnamese coverage | 1 | Tokens match `01 Foundations` values exactly; fonts load on the simulator, including Vietnamese tone marks (12-12) |
| 0d Design renders | `tools/design`, `design/renders/` | Headless Chrome renders every screen id (`data-screen-label`) to `design/renders/<id>.png`, plus night and season variants where the screen has Tweaks | 1 | One PNG per screen id across all files; a re-run is deterministic |
| 0e i18n | `packages/i18n` (index, glossary, test) | Catalogue structure, the completeness test, and the glossary from `01 Foundations` in en and vi | 1 | The test fails on a missing vi key; the glossary terms are present |

Gate 0: contracts frozen, renders exist, CI green.

### Wave 1: Engines · critical path 3 runs

| Lane | Owns | Does | Runs | Done when |
|---|---|---|---|---|
| 1a Art | `packages/art` | Byte-for-byte sync of `design/kithfield-art.js`; the Canvas 2D → Skia adapter (blend modes, filters as colour matrices, blur masks, fonts); the sprite cache with a memory cap; a layered critter API (body, marking, accessory, outfit, companion); 12-frame loops; CanvasKit baker for Node; golden tests against headless Chrome | 3 | Golden scenes (every critter awake and asleep, farm day and night, each season, fire, plants at all stages) match within 2/255 mean; one farm at 120 fps on the simulator |
| 1b Farm rules | `packages/farm` (not `catalog.ts`) | The pure reducer: dew per family, caps, `k` scaling, stages only up, sleepy and misty functions, seasons by hemisphere, harvest day, rare-variant hash, shared rain, porch pot, rules versions | 2 | Property tests for caps, scaling, determinism and "never down"; every table in `farm-model.md` has a test |
| 1c Auth | `apps/api/src/auth/**`, migrations `0001–0099` | Better Auth on D1 (anonymous, Apple, Google, email code; phone sign-in is deferred), sessions, devices, socket tokens, age and Terms records, account merge | 2 | Integration tests for every sign-in path and the anonymous upgrade, run under `wrangler dev` |
| 1d Farm object | `apps/api/src/farm/**` | `FarmDO`: event log, `op_id` idempotency, reducer integration, derived tables, socket protocol (hello, snapshot, events, cmd, ack, rejected), HTTP commands and paging, FTS5 search, presence and typing, alarms (weather through an interface, filled in during wave 3), hibernation | 3 | A protocol test suite: replay, reconnect after a gap, duplicate `op_id`, rejection, a snapshot for a stale client, an alarm firing |
| 1e Cottage and push | `apps/api/src/cottage/**`, `apps/api/src/push/**`, migrations `0100–0199` | `CottageDO` (chat list, waiting counts, budget, devices); the push queue consumer through Expo push; mute, hibernate, connected, quiet-hours and budget checks; collapsing; the ledger; back-off | 2 | Tests for each push decision rule; one real push to a simulator through Expo |
| 1f Mobile shell | `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/ui/**` | Expo Router structure; the tab bar (Farm, Chat, Seed bed, You); sheets; primitives and the component library from `01 Foundations`; haptics; motion helpers on Reanimated | 2 | Every component from `01 Foundations` renders on the simulator and matches its render; Reduce Motion honoured |
| 1g Mobile data | `apps/mobile/src/data/**`, `apps/mobile/src/db/**` | expo-sqlite (SQLCipher) store for snapshots, events and the outbox; the socket client with reconnect and catch-up; optimistic apply through `@kithfield/farm`; the session client; the HTTP command fallback | 3 | End-to-end tests against `wrangler dev`: two clients chatting, one offline for a while then catching up, an outbox replayed after a restart |
| 1h Website | `apps/web/**`, migrations `0200–0249` | The landing pages from `17 Landing` and `17 Landing VI`; privacy, terms, support, the account-deletion request page, press, the invite page (`17 Website`); waitlist in D1; OG images through the art baker once 1a lands | 2 | Pages match the renders at mobile, tablet and desktop widths; Lighthouse performance ≥ 90; the waitlist writes to D1 |

Merge order: 1b, 1c, 1d, 1e, 1g, 1a, 1f, 1h.
Gate 1: two simulator clients exchange messages and dewdrops through local Workers, the farm grows identically on both and on the server, and the art goldens pass.

### Wave 2: The core app · critical path 3 runs · ends in TestFlight build 1 (internal)

| Lane | Owns | Screens | Runs |
|---|---|---|---|
| 2a Onboarding | `features/onboarding`, `app/(onboarding)` | 03-01 to 03-15 (sign-in, critter picker, permission asks, age, Terms, contacts, web join) | 2 |
| 2b Farm home | `features/farm`, `app/(farm)` | 04-01, 04-05, 04-06, 04-16 to 04-23 (farm, critter cards, welcome back, valley, new farm, move-in, leaving, removal, sleeping cottage, speech bubbles) | 3 |
| 2c Chat | `features/chat`, `app/(chat)` | 04-02 to 04-04, 04-07 to 04-15 (chat list, group chat with the farm header, visits, replies, mentions, edit and unsend, pins, search, voice notes, viewer, shared media, message states) | 3 |
| 2d Gestures | `features/gestures` | 05-01 to 05-07, 05-09 to 05-11 (long-press, the + tray, firefly, Quick Tend, slow post, knock, heavy weather, forwarding, files, reactions) | 2 |
| 2e Plans | `features/plans`, `app/(seedbed)` | 06-01 to 06-06 (planting, voting buds and the sun patch, the organiser's hat, seed bed, remember-me seed, hangout day) | 2 |
| 2f Settings and safety | `features/settings`, `features/safety`, `app/(you)` | 11-01 to 11-22 (You tab, settings, devices and QR, deletion, farm settings, members and roles, invites, muting, report, block, removal, AI and your data, the reporter hears back, appeals) | 2 |
| 2g Media | `apps/api/src/media/**`, `apps/media-worker/**`, `features/media` | Upload URLs, signed reads, CSAM quarantine hook, client resize and compression, upload progress (12-06) | 1 |
| 2h Moderation | `apps/admin/**`, `apps/api/src/admin/**`, migrations `0250–0299` | 19-01 to 19-05 (queue, report, member record, appeals, audit log); reports API; ban checks | 2 |

Done when (every lane): each listed screen matches its render on the simulator, side by side, in day and night; every interaction in the screen's developer notes works against local Workers; copy comes from i18n in en and vi.
Gate 2: TestFlight build 1 for the team: create a farm, invite a friend, chat, gesture, plan a hangout, report and moderate, all on real devices.

### Wave 3: Depth · critical path 3 runs · ends in TestFlight build 2 (external beta)

| Lane | Owns | Screens | Runs |
|---|---|---|---|
| 3a Rhythm and field guide | `features/rhythm`, `features/field-guide`, the weather provider in `apps/api/src/farm/weather/**` | 07-01 to 07-06, 15-01 to 15-11 (birthday bloom, Sunday harvest, shared rain, restoration, visiting farms, scrapbook, field guide, seasons, rare blooms, trading, porch pot); WeatherKit REST with attribution | 3 |
| 3b Stickers | `features/stickers`, `targets/stickers`, sticker baking in `tools/art` | 08-01 to 08-06, 10-05 to 10-07 (picker, together stickers, Quick Tend stickers, shop, gifting, export to Messages, Telegram and WhatsApp) | 3 |
| 3c Shop and patrons | `features/shop`, `apps/api/src/purchases/**`, migrations `0300–0349` | 09-* (Rocco's cart, try-on, widget preview, collection, sets, wishlist, chip-in gifts, farm themes, patrons, tiers, member view, lapsing, the farmers' wall, the printed book through Stripe) | 3 |
| 3d Fire room | `features/fire`, `apps/api/src/calls/**` | 16-01 to 16-16 (the voice room and lanterns on LiveKit, captions behind consent) | 3 |
| 3e Native surfaces | `apps/mobile/targets/**`, `apps/mobile/modules/surfaces`, `app.config.ts` | 10-01 to 10-04, 10-08 to 10-14, 05-08 (widgets, Live Activities, lock-screen pushes, notification replies, PiP, audio routing, mic and camera asks, share extension); offscreen PNGs into the App Group | 3 |
| 3f Signature motion | `apps/mobile/src/ui/travel/**` | 18-* (the shared overlay layer; transitions 01, 04, 06 and 07 first, then the rest) | 2 |
| 3g AI | `apps/api/src/ai/**` | The Sunday recap and captions jobs on the `ai` queue, behind 11-18 to 11-20 consent | 1 |
| 3h States and access | cross-feature, through `NEEDS_CONTEXT` patches to owning lanes | 12-01 to 12-16 (loading, empty, offline, error, first-run hints, night, Reduce Motion, AX5 text, Vietnamese) and VoiceOver labels from the design notes | 2 |

Gate 3: TestFlight build 2 to external testers; every screen in files 03 to 16 is built; performance budgets hold on the oldest supported iPhone.

### Wave 4: Platforms and launch · critical path 3 runs

| Lane | Owns | Screens | Runs |
|---|---|---|---|
| 4a Android | Android-specific code under `apps/mobile` | 14-05 to 14-08 (navigation bar and FAB, predictive back, notifications with actions, widgets) and a Play internal build | 3 |
| 4b Web and desktop | `apps/mobile` web target, `apps/desktop` (Tauri) | 14-09 to 14-15 (web join, narrow web, three panes, menu-bar and tray critter, shortcuts, the fire in the side pane) | 3 |
| 4c Large screens | iPad and foldable layouts | 14-01 to 14-04 | 1 |
| 4d Store assets | `tools/launch`, `store/` | 13-* (icons, alternate icons, launch screen, screenshot panorama in en and vi, App Preview, Custom Product Pages, In-App Events, Play graphics) baked from the art | 2 |
| 4e Hardening | read-only audit, then fixes through owning lanes | Device performance and memory, Durable Object load test, security and privacy review, privacy labels, App Review notes, the legal checklist in `tech-decisions.md` §6 | 2 |

Gate 4: App Store and Play submissions.

## Totals

| Wave | Lanes | Lane runs | Review runs | Critical path |
|---|---|---|---|---|
| 0 | 5 | 5 | 5 | 2 |
| 1 | 8 | 19 | 8 | 3 |
| 2 | 8 | 17 | 8 | 3 |
| 3 | 8 | 20 | 8 | 3 |
| 4 | 5 | 11 | 5 | 3 |
| **All** | **34** | **72** | **34** | **14 run slots**, plus one integration run between each wave |

About 110 agent runs in all, including integration and fix runs. With 8 lanes at once, the wall-clock time is set by the 14 critical-path run slots plus the integration passes and the founder gates below.

## After launch

Critter mask (16, marked later), visit calls by knocking (16), sticker creator market, Kithfield for teams, end-to-end encryption for visits.

## Founder gates

| Needed by | Gate |
|---|---|
| Wave 0 | Expo/EAS project; Cloudflare zone `kithfield.com` with Workers, D1, R2, Queues and Durable Objects enabled |
| Wave 1 | Apple Developer team, bundle ids, App Group; Sign in with Apple and Google OAuth clients. Phone sign-in is deferred (founder decision, 18 Oct 2026): wave 1 auth ships anonymous, Apple, Google and email code, so no phone-code provider is needed yet |
| Wave 2 | APNs key and FCM project for Expo push; Cloudflare CSAM scanning enabled; Cloudflare Access for the admin console |
| Wave 3 | RevenueCat project and every product in App Store Connect; LiveKit Cloud project; WeatherKit key; the AI provider for captions and the recap; Stripe for the printed book |
| Wave 4 | Google Play developer account; privacy policy and Terms text reviewed by counsel; trademark search; app licence choice (`tech-decisions.md` §6) |
