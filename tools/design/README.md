# @kithfield/design

Renders the design export (`design/*.dc.html`) to PNG references in `design/renders/`, so every
screen can be compared side by side with the app, the website and the art goldens. The renders are
regenerated, not committed; only `design/renders/compare/` is kept in git.

## Run

```sh
pnpm exec playwright install chromium-headless-shell   # once per machine
pnpm --filter @kithfield/design render                 # everything (about 6 min)
pnpm --filter @kithfield/design render -- --only 04-01,16,01-foundations
pnpm --filter @kithfield/design render -- --check-determinism --only 04,17-landing
pnpm --filter @kithfield/design compare -- design/renders/04-01.png ~/Desktop/sim.png --name 04-01-sim
```

If `playwright install` stalls while unpacking (seen with Node 26), unzip the archive it downloaded
(`$TMPDIR/playwright-download-*/…headless-shell….zip`) into
`~/Library/Caches/ms-playwright/chromium_headless_shell-<revision>/` and create an empty
`INSTALLATION_COMPLETE` file there.

- `--only` takes screen ids (`04-01`), file numbers (`16`, every `16-xx`) or file slugs
  (`01-foundations`, `17-landing`). A partial run updates `index.json` in place; a full run clears
  `design/renders/` first (except `compare/`).
- `--offline` renders from the network cache only (see Determinism).
- `--concurrency <n>` design files in parallel (default 4).
- `--check-determinism` renders the selection twice into temporary folders and fails unless every
  PNG matches (byte for byte, or within the drift tolerance below); `--keep` keeps both runs.
- `compare` writes `design/renders/compare/<name>.side.png` (render left, screenshot scaled to the
  render's width right) and `<name>.diff.png` (pixels over the threshold in red), and prints the
  mean difference out of 255.

## Naming

| What | File | Scale |
|---|---|---|
| A frame with `data-screen-label="04-01 Farm home"` | `04-01.png` | @3x up to 500 CSS px wide (phones), @2x wider (web, iPad, desktop frames such as `17-01`) |
| The same frame under tweaks | `04-01.night.png`, `04-01.winter.png`, `04-01.winter.night.png` | as above |
| A section of a canvas file with no screen labels (`00 Cover`, `01 Foundations`, `02 Cast`) | `01-foundations/<section>.png`, `<section>.<variant>.png` | @2x |
| A scrolling page (`17 Landing`, `17 Landing VI`), one viewport per stop | `17-landing/<width>/<section>[-NN].png` | 390×844 @3x, 834×1194 @2x, 1440×900 @1x |

Section slugs come from the section's `id` (`colour`, `components`, `dev-notes`), or its title when
it has none. Page stops step one viewport at a time through each `<section>`, so the pinned,
scroll-driven `evening` section appears as `evening-01` … `evening-07`.

`design/renders/index.json` maps each id (`04-01`, `01-foundations/colour`,
`17-landing/1440/critters`) to its file, source `.dc.html`, title, CSS size, scale and variants.

## Tweaks

A file's tweaks are the props in its `<script data-dc-script data-props="…">`: every file but
`17 Landing`, `17 Landing VI` and `19` declares `season` (spring, summer, autumn, winter; spring
by default) and `motion`, and `04`, `05`, `06`, `07`, `10`, `11`, `12` and `16` add `night`. The
renderer reads them from the file (nothing is listed by hand), renders every combination through
the runtime's own `__dcSetProps`, and keeps a variant only when its pixels differ from the
defaults and from each combination it builds on. So a screen with no seasonal art gets no season
variants, and although eight files declare `night`, only the screens whose template uses it get
`.night` files. `index.json` lists what each screen actually has. `motion` is skipped because
renders already freeze animation.

## Determinism

- Each page gets its own browser context on Playwright's clock, installed and paused at
  2026-10-24 09:41 UTC. Pending timers and animation frames run only when the renderer advances
  the clock (one second per settle), the same way every time.
- `<kf-art>` draws only when the renderer asks: its own frame loop is gated off, and every art
  element is drawn in document order at one fixed instant (4.5 s into its loop, or the engine's
  own still time for still art) after every font face, all unicode ranges included, has loaded.
  The engine caches sprites on first draw, so a fixed draw order means a fixed cache. It is
  seeded; it never calls `Math.random`.
- Before each capture pass the renderer scrolls the whole page once, so anything that starts when
  first seen (observers, the live motion samples in `18`) has started instead of racing the
  capture's own scrolling. Script animations (Web Animations) are then held at their first frame;
  CSS animations and transitions are settled by Playwright's `animations: 'disabled'` (finite
  ones finish, infinite ones go back to their start).
- Requests that leave the local server (Google Fonts, the React UMD scripts the runtime loads) are
  cached in `tools/design/node_modules/.cache/kithfield-design` on first fetch and replayed byte
  for byte afterwards, so later runs are stable and work offline (`--offline`).
- Chromium runs with software raster, one raster thread, an sRGB profile and memory pressure off.
  Canvas files are laid out in a 1600×4200 viewport, taller than any frame, because a capture
  larger than the viewport takes another raster path that changes later captures; and each page
  gets one whole-viewport capture, thrown away, before the real ones.
- `--check-determinism` expects byte-identical PNGs. Should a few pixels ever differ (a level or
  two on an antialiased edge), it reports them as drift and tolerates up to 0.01% of a render's
  pixels; the same tolerance keeps such drift from ever creating a tweak variant.
- Renders depend on the pinned Chromium and on this Mac's system fonts (SF Pro for UI text):
  compare renders made on the same machine and Playwright version.
