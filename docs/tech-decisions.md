# Kithfield: technical decisions

Decided 18 Oct 2026. Change one only with new evidence, and record the change here. The shape follows 6pm (`~/oddeggs/6pm/docs/tech-decisions.md`); the design is `design/` (start at `00 Cover.dc.html`).

## 1. Shape of the system

| Part | Choice | Why |
|---|---|---|
| App | Expo 58, React Native 0.88 (New Architecture, Hermes), Expo Router native stack; iOS first, Android at launch, web through Expo web | Same pins as 6pm, so fixes and lessons carry across |
| Motion | Reanimated 4 (worklets on the UI thread), Gesture Handler 3, expo-haptics. Tokens from `01 Foundations` and `design/kf-motion.js` live in `@kithfield/theme` | The native feel is the product. No JS-thread animation, no `Animated` from RN |
| Art | `design/kithfield-art.js` is the single source of every drawing. On native it runs through a Canvas 2D → Skia adapter (`@shopify/react-native-skia`); on web and desktop it runs on a browser canvas unchanged; in Node it runs on CanvasKit for baking. See §2 | One renderer, three backends, pixel-matched by golden tests |
| Native surfaces | `@bacons/apple-targets`: widgets, Live Activities, share extension, iMessage sticker extension. Art reaches them as PNGs the app renders offscreen into the App Group (6pm's `companion-images` pattern) | Widgets cannot run JS or Skia |
| API | Hono on Cloudflare Workers. One Durable Object per farm; D1 for global data; R2 for media; Queues for push and jobs. See §3 | One platform, no servers, near-zero idle cost, the same stack as 6pm's API |
| Data on the phone | expo-sqlite (SQLCipher on): a cache of each farm's log plus an outbox for unsent writes. See §4 | Opens instantly and offline; the server stays the truth |
| Auth | Better Auth on Workers + D1: anonymous-first accounts, Sign in with Apple, Google, email code (phone code deferred, 18 Oct 2026) | CritterPass's decision (`docs/decisions/20260927-better-auth-anonymous-upgrade.md`), reused without its infrastructure |
| Calls | LiveKit Cloud for the fire room and lanterns; a Worker mints room tokens. Move to Cloudflare Realtime or self-hosted LiveKit when usage justifies it | Best React Native SDK and Expo plugin; no ringing, so no CallKit or VoIP push at first |
| Purchases | RevenueCat (StoreKit 2, Play Billing): patron subscriptions, Farm Plus, Founding Farmer, cosmetics and gifts as in-app purchases. The printed scrapbook and merch through Stripe | Apple requires IAP for digital goods; physical goods must not use it |
| AI | Cloudflare Workers AI through the api's `AI` binding, decided 19 Oct 2026: Whisper (`@cf/openai/whisper-large-v3-turbo`) for fire captions and voice-note captions, a Workers AI translation model for en ↔ vi (`@cf/meta/m2m100-1.2b`), and a Workers AI text model for the Sunday recap letter. AI catch-up stays on the phone (Apple Foundation Models). Every outside use is opt-in per feature and person (11-18 to 11-20) | No new account, contract or key: it runs on the Cloudflare account already holding the data, so words and voices never leave the platform that already processes them; the consent sheets and the Privacy Policy name Cloudflare as the provider |
| Moderation | Reports land in D1; an admin console on Workers behind Cloudflare Access (CritterPass's `cp-admin` pattern); Cloudflare CSAM scanning on the media domain | Required for user-generated content (App Review 1.2) |
| Website | `apps/web`: the landing pages from `design/17 *.dc.html`, privacy, terms, support, the invite page and the waitlist (D1), on Cloudflare | The designs already run the same art module |
| i18n | Typed TS catalogues in `@kithfield/i18n` (en, vi) with a completeness test | 6pm pattern |
| Errors | Sentry | |
| Repo | pnpm workspace with `catalog:` pins, TS strict, ESLint flat config, Prettier, Vitest (packages, api), Jest (mobile) | 6pm tooling |

Deliberately absent: Postgres, PowerSync, Centrifugo, Redis, Railway, Docker in production, TanStack Query, NativeWind, WebViews or DOM components for art.

## 2. Art pipeline

- **Adapter.** `@kithfield/art` wraps an `SkCanvas` in the subset of `CanvasRenderingContext2D` the renderer uses: paths, `arc`, `ellipse`, curves, `clip`, `globalAlpha`, linear and radial gradients, `drawImage`, `setLineDash`. Mappings that need care: `globalCompositeOperation` (multiply, screen, source-in, destination-in/out/over) to `BlendMode`; the five CSS `filter` strings to colour matrices; `shadowBlur` to a drop-shadow image filter on a layer in device space, with σ = shadowBlur / 2 (canvas shadows ignore the transform; the shadow follows the drawn image's alpha, which a blur mask filter on the paint cannot); `fillText` to Skia fonts with Gaegu, Patrick Hand and Lora embedded (Vietnamese tone marks need Patrick Hand and Lora, as in `12-12`).
- **Draw once, move many times.** The renderer already caches each drawing as a sprite. On native each sprite becomes an `SkImage` drawn once on an offscreen surface. Breathing, blinking, hops and shared-element flights are transforms of cached images on the UI thread. Loops drawn on twos (the fire at 12 fps) are about 12 cached frames switched by a frame index, never redrawn while running.
- **Layers, not combinations.** Critters compose from separately cached layers (body and coat, marking, accessory, outfit, companion), so 16 critters × coats × 5 markings × 9 accessories never multiply into sprites.
- **Budgets.** One live farm animates at a time; frame callbacks stop on hidden tabs and when the app is in the background; paints and paths are cached, never allocated per frame; the sprite cache is size-capped and flushed on a memory warning. These come from 6pm's performance audit (`plans/reports/audit-261011-1604-performance-report.md` in 6pm).
- **Golden tests.** A fixed set of scenes renders through the original file in headless Chrome and through the adapter on CanvasKit in Node (6pm's `tools/scripts/skia-node.ts`), and CI compares the pixels. The renderer is seeded, so the outputs must match.
- **Baking.** The same Node path writes App Store screenshots, OG and invite images, the press kit and the sticker packs for WhatsApp and Telegram (512 px WebP). The app itself writes widget, Live Activity and notification images for the user's own critters and farms.
- **Updating the art.** `design/kithfield-art.js` is never edited in the app. A sync script copies it into `@kithfield/art` byte for byte, and the golden tests run on every change (6pm's `extract-prototype-logic.ts` pattern).

## 3. Backend

The farm's events, growth rules and computed states are specified in `docs/farm-model.md`.

- **Farm Durable Object** (one per farm, SQLite storage). It owns:
  - the farm's ordered event log: messages, edits, unsends, reactions, gestures, plans, RSVPs, gifts, and the cosmetics on display
  - farm state derived from `@kithfield/farm` (plants, sleepy critters, seasons, rare blooms)
  - presence and typing, over hibernating WebSockets
  - full-text search within the farm (FTS5)
  - alarms for sleepy timers, Sunday harvest, seasons, weather refreshes and the fire room going quiet
  - every write to the farm is one ordered call into the object, so there are no races
- **Visits** (one-to-one chats) are farms with two members and no farm art in the header.
- **D1** holds people, devices and sessions (Better Auth), memberships (the farms each person is in, used for the switcher and push fan-out), invites, purchases and entitlements, reports, the waitlist, and the push ledger.
- **R2** holds photos, video, voice notes and files. Uploads go up through presigned URLs, and reads come back through a signed media Worker (CritterPass's `media-worker` pattern).
- **Queues** carry push fan-out, media processing and the AI jobs (the Sunday recap, and captions for Plus). AI is opt-in, behind a consent screen (App Review 5.1.2).
- **Push**: routed through CritterPass's rules (a per-person budget, quiet hours, collapsing, a ledger of every push sent), with copy from the notification catalogue in `10 On the System`.

## 4. Sync

- Each farm's log has a sequence number the server assigns. The phone keeps a `last_seq` per farm, subscribes over the farm's WebSocket, and on reconnect asks for everything after `last_seq`. Older history pages in on scroll.
- Writes go into the phone's outbox with a UUIDv7 `op_id` and are retried until acknowledged. The farm object ignores an `op_id` it has already applied, and it answers a write it rejects with a result, never by dropping it, so the outbox never blocks. The command pattern comes from CritterPass, minus PowerSync.
- The phone draws its own writes at once (optimistic) and reconciles when the server's sequence comes back.
- Reconnect, replay, rejection and revocation are covered by an end-to-end suite against `wrangler dev` in CI (CritterPass's `sync-e2e` discipline).

## 5. Workspace layout

```
apps/mobile     Expo app (src/app routes, src/features, src/ui, src/db, src/data), targets/ for native surfaces
apps/api        Hono Worker, the Farm Durable Object, D1 migrations, queues, cron
apps/web        landing pages, invite page, legal, waitlist
apps/admin      moderation console
packages/art    kithfield-art.js (synced), Skia adapter, CanvasKit baker, golden tests
packages/farm   farm rules as pure TS (growth, sleepiness, seasons, weather, rare blooms), run by the server, the app and the widgets
packages/theme  colour, type, spacing and motion tokens
packages/i18n   en/vi catalogues
design/         the Claude Design export, read only
```

Workspace packages are `@kithfield/<dir>`, ESM, and export TypeScript source.

## 6. To verify before relying on it

- APNs needs HTTP/2. Check that Workers can call it directly. If not, ordinary pushes go through Expo's push service and Live Activity pushes through a small relay.
- Skia's text rendering for Gaegu, Patrick Hand and Lora against the browser, and the adapter's colour matrices against CSS `filter`.
- Memory and frame time of the busiest farm (24 critters, night, fire lit) on the oldest supported iPhone.
- Live Activity push updates for the fire room and the day of a plan.
- Licensing: an app licence that can ship on the App Store (MPL, MIT or Apache, or a contributor licence agreement), the server under AGPL, the art under a separate non-free licence.
- Workers AI for captions: Whisper's latency on 5 to 15 second pieces for live fire captions (if too slow, a streaming speech model on Workers AI), the quality of en ↔ vi translation, and Cloudflare's retention terms for Workers AI inputs against the consent copy ("never keep it past 30 days", "never train on it").
- Apple In-App Purchase has no refund the app can make: chip-in pledges paid before a chip-in is covered can't be returned automatically, so pledges stay promises until covered unless App Review accepts another way.
- Vietnam's Decree 147 phone verification, the UK Online Safety Act and age-assurance laws, with counsel.
