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
| `(modal)/` | Any feature | A sheet over the app: name files `<feature>-<screen>.tsx` (`chat-search.tsx`) |
| `(cover)/` | Any feature | Full screen over everything (the photo viewer, the fire room): `<feature>-<screen>.tsx` |
| `(dev)/` | The shell | Development-only screens (the component gallery), removed from release builds |

## How it fits

- **Tabs.** Each tab folder has a `_layout.tsx` with a native `Stack` on the theme's background. The
  floating tab bar sits over every tab's screens, so a screen runs to the bottom edge and pads its
  scrolling content with `tabBarClearance(insets.bottom)` from `ui/tab-bar/tab-bar`.
- **Sign-in gate.** The root layout shows `(tabs)` to someone signed in and `(onboarding)` otherwise
  (`Stack.Protected`, reading `useSession()` from `ui/session/session`). The splash stays up while
  the session is `loading`.
- **Modals and covers.** The root stack presents any route in `(modal)` as a modal sheet and any in
  `(cover)` as a full-screen modal (`ui/navigation/presentation.ts`). Don't give these groups a
  `_layout.tsx`: their files must stay direct routes of the root stack. They are for signed-in
  screens; onboarding's own sheets live in `(onboarding)`.
- **Tab dots and your critter.** A screen shows a tab's honey dot with `useTabDot(tab, on)` and puts
  the person's critter on the You tab with `useYouCritter(...)` (`ui/tab-bar/tab-activity`).
- **Night.** A farm screen hands its town to `useSunPlace(place)` (`ui/theme/theme-provider`) so the
  app turns to night after the farm's sunset, not only in dark appearance.
- **Data.** `DataSlot` (`ui/session/data-slot`) starts the data layer once (`startData`) under
  the theme and the art, keeps the splash up while it starts, then puts `<DataProvider>` and the
  session around the screens. A fresh install becomes an anonymous person and counts as signed in;
  a session the server ended counts as signed out. A first launch that can't reach the server
  shows the error shell with "Try again". Screens read and write with the hooks from `data/`.

Build screens from `ui/components` and `ui/art`; copy comes from your feature's catalogue in
`@kithfield/i18n`.
