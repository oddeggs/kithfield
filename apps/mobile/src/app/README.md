# Routes

Expo Router reads this folder. The shell owns the root files (`_layout.tsx`, `index.tsx`,
`+not-found.tsx`) and the tab group's `_layout.tsx`. Each feature owns its own folder below and adds
screens there without editing a shared file.

| Folder | Who adds screens | What it is |
|---|---|---|
| `(tabs)/farm/` | Farm home | The Farm tab's native stack. Replace `index.tsx`; add pushed screens beside it |
| `(tabs)/chat/` | Chat | The Chats tab's stack |
| `(tabs)/seedbed/` | Plans | The Seed bed tab's stack |
| `(tabs)/you/` | Settings and safety | The You tab's stack |
| `(onboarding)/` | Onboarding | Shown instead of the tabs to someone not signed in. Replace `welcome.tsx` (the URL `/welcome`; `index.tsx` would collide with the app's own `/`) |
| `(modal)/` | Any feature | A sheet over the app: name files `<feature>-<screen>.tsx` (`plans-plant.tsx`). A sheet with its own heights, an overlay or a gesture scene is listed in `SHEETS` |
| `(cover)/` | Any feature | Full screen over everything (search, the photo viewer, the fire room): `<feature>-<screen>.tsx` (`chat-search.tsx`) |
| `(dev)/` | The shell | Development-only screens (the component gallery, the sync, media, sheet, art and gestures labs). Each is listed inside the root layout's `Stack.Protected guard={__DEV__}` and requires its screen only under `__DEV__`, so none ships |

## How it fits

- **Tabs.** Each tab folder has a `_layout.tsx` with a native `Stack` on the theme's background. The
  floating tab bar sits over every tab's screens, so a screen runs to the bottom edge and pads its
  scrolling content with `tabBarClearance(insets.bottom)` from `ui/tab-bar/tab-bar`.
- **Sign-in gate.** The root layout shows `(tabs)` to someone signed in and `(onboarding)` otherwise
  (`Stack.Protected`, reading `useSession()` from `ui/session/session`). The splash stays up while
  the session is `loading`.
- **Modals and covers.** The root stack presents any route in `(modal)` as a page sheet and any in
  `(cover)` as a full-screen modal. Don't give these groups a `_layout.tsx`: their files must stay
  direct routes of the root stack. They are for signed-in screens; onboarding's own sheets live in
  `(onboarding)`.
- **Sheets with their own heights.** Native sheets take their presentation and detents when they
  are created, so a route never sets `presentation` or `sheet…` options on itself
  (`<Stack.Screen options>` in its file arrives after mount: detents are ignored, and a
  `fitToContents` sheet can't find its screen and drops taps). Instead it adds one line to `SHEETS` in
  `ui/navigation/presentation.ts`, which the root stack reads through
  `screenOptionsFor(route.name, { screenH, palette })` before the screen mounts:

  | `SHEETS` entry | What it gives | Used by |
  |---|---|---|
  | `{ kind: 'detents', tops: [286, 150], grabber: true, undimmedUpTo: 0 }` | A `formSheet` resting with its top at each distance from the screen's top, as the design measures it (`(screenH - top) / screenH`, smallest first); the screen behind stays lit and touchable up to detent `undimmedUpTo` | `(modal)/farm-critter`, `(modal)/plans-remember` (`tops: [214]`) |
  | `{ kind: 'fractions', detents: [0.82, 1], grabber: true }` | A `formSheet` at fractions of the screen | `(modal)/farm-new` |
  | `{ kind: 'fit' }` | A `formSheet` as tall as what it holds (`fitToContents`), with the grabber | The safety and settings sheets, `(dev)/sheet-lab` |
  | `{ kind: 'overlay' }` | `transparentModal`, no transition and no dimming: the screen draws its own scrim and sheet on the UI thread | The gesture tray, message menu, reactions, attach |
  | `{ kind: 'cover' }` | `fullScreenModal`, rising from the bottom | The gesture scenes (firefly, knock, weather, slow post, forward, Quick Tend) |

  Every sheet gets the theme's 30-point corner (`radii.sheet`) and `palette.sheet` behind it; an
  overlay is transparent; everything else sits on `palette.background`. A `fit` sheet's content
  lays out at its own height (no `flex: 1` at its root) and pads its bottom itself. To see one take
  taps, open the gallery's Sheets section and press "Open a native sheet".
- **Tab dots and your critter.** A screen shows a tab's honey dot with `useTabDot(tab, on)` and puts
  the person's critter on the You tab with `useYouCritter(...)` (`ui/tab-bar/tab-activity`).
- **Keyboard.** The root layout mounts `KeyboardProvider` (`react-native-keyboard-controller`) once
  around everything, sheets included. A screen uses its hooks and views (`useKeyboardHandler`,
  `KeyboardAvoidingView`, `KeyboardStickyView`) directly and never mounts a provider of its own.
- **Night.** A farm screen hands its town to `useSunPlace(place)` (`ui/theme/theme-provider`) so the
  app turns to night after the farm's sunset, not only in dark appearance.
- **Data.** `DataSlot` (`ui/session/data-slot`) starts the data layer once (`startData`) under
  the theme and the art, keeps the splash up while it starts, then puts `<DataProvider>` and the
  session around the screens. A fresh install becomes an anonymous person and counts as signed in;
  a session the server ended counts as signed out. A first launch that can't reach the server
  shows the error shell with "Try again". Screens read and write with the hooks from `data/`.

Build screens from `ui/components` and `ui/art`; copy comes from your feature's catalogue in
`@kithfield/i18n`.
