# Undesigned states

States the product needs that no design covers. Each is built from existing components and copy
in the house voice, and is logged here so design can draw it later.

| Screen | State | Reason |
|---|---|---|
| 03-02 Sign in (email) | The letter that carries the 6-digit sign-in code: subject with the code for autofill, greeting, the code, its 10-minute lifetime, a "not you" line and the owl's sign-off, in en and vi (`packages/i18n/src/sign-in-code.*.ts`), plain text | 03-02 says "Email sends a 6-digit code" but no design shows the letter |
| Tab bar | The You tab before the person's critter is known: a soft empty circle in the critter's place | The design always shows a critter there; the critter arrives from the data layer after sign-in |
| Component library at night | Night colours for buttons, chips, fields, the segmented control, the toggle, the plan, notice and quiet-note cards, the tray's dewdrop tint and the failed-send line, taken from the night palette (`apps/mobile/src/ui/theme/palette.ts`) | `01 Foundations` draws the library in day only; `12 States` (12-08, 12-09) gives night only for sheets, the tab bar, bubbles and quiet notes |
| Any screen | Toast: the notice card at the top of the screen, rising 8 points as hint cards do (12-07), fading under Reduce Motion, read out politely by VoiceOver | No toast is designed; the notice card is the library's card for gentle warnings |
| Any route | Not found (a link to a path the app doesn't have): the offline spot critter, a title, one line and "Back to the farm" | No design for an unknown link |
| Any control | Haptics: a selection tick for tabs, segments, chips, toggles and sheet stops; a light tap for long-press; a soft tap as a dewdrop or firefly leaves; success when something you made is done | The design names no haptics |
