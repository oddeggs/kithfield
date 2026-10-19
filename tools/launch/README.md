# @kithfield/launch

Bakes Kithfield's launch assets from the art (`@kithfield/art`) and the design export
(`design/13 Launch.dc.html`, `design/09 Shop and Plus.dc.html`): the app icon and splash the app
builds with, and every store and launch image and clip. Nothing is drawn by hand: icons and the
splash come from the art's scenes in Node; screenshots and launch art are the board's own boxes,
lifted out and captured at the store's exact pixel size, with the art inside redrawn at that
density.

## Run

```sh
pnpm --filter @kithfield/design exec playwright install chromium-headless-shell   # once per machine
pnpm --filter @kithfield/launch bake                        # everything (about 20 min; clips are most of it)
pnpm --filter @kithfield/launch bake -- --only icons        # app icon, splash, alternates
pnpm --filter @kithfield/launch bake -- --only ios.vi,android
pnpm --filter @kithfield/launch bake -- --only clips --season autumn
pnpm --filter @kithfield/launch check -- --sheets /tmp/launch-compare
```

`--only` takes asset id prefixes (`icons`, `ios`, `ios.en.iphone-6.9`, `android`, `marketing`,
`clips`, `iap`; see `src/specs.ts`). `--season` picks the board's season (spring by default); a
seasonal set overwrites the current one.

`check` verifies every file in `store/manifest.json` against its store slot (size, alpha, file
size, a clip's length, frame rate and audio) and compares each still with its region of the
design render, printing the mean difference.

## What it writes

| Where | What |
|---|---|
| `apps/mobile/assets/icon/Kithfield.icon` | The iOS 26 icon for Icon Composer: sky, hill and cottage, glow and critter, with dark overrides for the sky and hill (`ios.icon`) |
| `apps/mobile/assets/icon/app-icon*.png` | The flat icon by day, dark and tinted (the web and Android's legacy launchers use the day one) |
| `apps/mobile/assets/icon/android-*.png` | Android's adaptive icon: background, foreground in the 72 dp view, monochrome |
| `apps/mobile/assets/splash/` | The launch screen's pencil horizon by day and night, phone and tablet, and Android 12's lit window |
| `store/ios/<en,vi>/` | iPhone 6.9" and 6.5" panoramas by day and night, the iPad 13" set, the App Preview; English also has In-App Events and Custom Product Pages |
| `store/android/<en,vi>/` | Phone screenshots and the feature graphic; `store/android/icon-512.png` |
| `store/iap-review/<productId>.png` | One App Review screenshot per in-app product in `docs/products.md` |
| `store/marketing/` | Launch film storyboard, TikTok and Reels loops, Product Hunt, X and Threads, sticker teaser, OG images, press hero |
| `store/icons/` | The 52 alternate icons (16 critters × 3 looks, four seasons) and Android 12's splash frames |

Only `store/manifest.json` and the copy (`store/listing.*.md`, `store/launch-kit.en.md`) are
committed; the media are regenerated.

## How the boards become assets

- `src/specs.ts` lists each export: frame, box, panels, pixel size, store slot, language.
- `src/board.ts` opens a board file on the design renderer's frozen clock (`@kithfield/design`),
  lifts one box out at the viewport's corner (square corners, no shadow, the panorama's dashed
  guides hidden), tells its art to draw at the capture's density, and captures it. Every change is
  undone before the next box.
- Vietnamese takes the board's own Vietnamese set (13-04 against 13-03, element for element),
  copy the board has only in English from the launch catalogue (`packages/i18n/src/launch.*.ts`),
  and the store rule's type: Lora for headlines, Patrick Hand for kickers.
- UI words read as the app has them (`src/copy.ts`), so screenshots show real UI.
