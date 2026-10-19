# States and access checklist

One row per screen in design files 03 to 16, checked against the Gate 3 bar:
- loading, empty, offline and error states built from existing components;
- works at night;
- holds still under Reduce Motion;
- reflows at AX5 without clipping;
- Vietnamese with its marks unclipped;
- VoiceOver hears the labels, roles and actions its design notes ask for.

How it was checked: each screen's code was read against its design notes, and the app was run on
an iPhone 16 simulator (iOS 27.0) in dark appearance, with Reduce Motion, at the largest
accessibility text size and in Vietnamese: the four tabs, the farm's states, the chat, search,
the seed bed and the first-run tips. Native surfaces (widgets, Live Activities, the share
extension, the Messages drawer) were judged from their Swift only.

`✓` passes, `✓ fixed` was fixed in this pass, `✗` is still open (see the note), `–` doesn't
apply. Screens that aren't app screens, or aren't built, have no cells.

## Summary

| Column | Pass | Open | n/a |
|---|---|---|---|
| Loading | 114 | 6 | 46 |
| Empty | 52 | 3 | 111 |
| Offline | 137 | 8 | 21 |
| Error | 126 | 7 | 33 |
| Night | 165 | 0 | 1 |
| Reduce Motion | 146 | 0 | 20 |
| AX5 | 154 | 9 | 3 |
| Vietnamese | 166 | 0 | 0 |
| VoiceOver | 157 | 7 | 2 |

What is still open (each row's note has the detail):
- **Loading, offline and error:** onboarding's busy and loading looks (03-02, 03-09, 03-10, 03-15),
  the "say hi" and wave refusals on the farm moments (04-16, 04-19), remember-me offline (06-05),
  cached copies for the recap, scrapbook and visit gates (07-02, 07-05, 07-06), owned sticker packs
  offline (08-01), Quick Tend's blank load (08-03), the gift screens (08-05, 08-06), the lapsed patronage and costs page (09-03,
  09-12), the sound route sheet (10-11), and the farms list behind "history arriving" (11-16).
- **Empty:** a restoration project with nothing chosen yet (07-04) and a contacts search with no
  match (03-09).
- **AX5:** the plant-a-farm sheet (04-18), the removed-from-farm page (04-21), the hangout
  (06-06), the together screen and gift opening (08-02, 08-06), the adding screen (10-07), and the
  sound and ask sheets (10-11 to 10-13) still don't scroll at the largest sizes.
- **VoiceOver:** vote buds don't say how many lean on them (06-02), gift wraps read raw ids
  (08-05), the safety email isn't a link (11-21), and the fire room's frames don't say who talks
  (16-12 to 16-16).
- **Not built:** phone sign-in (03-13), the costs page, merch and teams (09-24 to 09-26), picture in
  picture (10-10), the later fire room screens (16-17 to 16-19), the launch icon and splash work in
  13 Launch, and all of 14 Platforms.

## Screens

| Screen | Title | Loading | Empty | Offline | Error | Night | Reduce Motion | AX5 | Vietnamese | VoiceOver | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 03-01 | Welcome | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: the gate reflows at AX5 and keeps the app name whole; the invite sheet scrolls at AX5 |
| 03-02 | Sign in: Apple, Google or email | ✗ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: reflows into one column at AX5; loading: no busy look on the sign-in buttons; the Google button keeps its brand colours by design |
| 03-03 | Email: a code arrives by post | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ | fixed here: note colours from the theme; boxes grow and the digit is capped; reflows at AX5 |
| 03-04 | Who are you? Sixteen critters, filter by shape (tap) | – | – | – | – | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ | fixed here: badge and ring from the theme; chip scroller grows at AX5 |
| 03-05 | Make them yours: coat, markings, accessory (tap) | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ | fixed here: the twin card has night colours; options and name row reflow at AX5 |
| 03-06 | Asking for notifications, in the farm's voice | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: reflows into one column at AX5 |
| 03-07 | Name the farm, save a spot for friends | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: reflows at AX5 and the name field rises clear of the keyboard |
| 03-13 | Sign in with a phone number | – | – | – | – | – | – | – | – | – | not built (phone sign-in is deferred) |
| 03-14 | Age check: a birthday, kindly asked | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: the three selects stack and wrap at AX5 |
| 03-15 | House rules and our privacy promise (Terms and Privacy) | ✗ | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | loading: the Terms date row is blank until loaded |
| 03-08 | Asking for contacts | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: reflows into one column at AX5 |
| 03-09 | Find friends from contacts | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | fixed here: each Invite chip says who it invites; loading: empty list while contacts are read; empty: nothing for a search with no match; error: a failed invite is not caught |
| 03-10 | Joining without the app (the invite link in Safari) | ✗ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | app side only; fixed here: reflows at AX5; loading: blank while the session loads |
| 03-11 | Asking for photos, the first time you attach one | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: reflows at AX5; still nothing opens this ask |
| 03-12 | Asking for location: optional, on the day only | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: reflows at AX5; still nothing opens this ask |
| 04-01 | Farm home (try the season and night tweaks) | ✓ fixed | ✓ fixed | ✓ fixed | ✓ fixed | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | fixed here: the reveal (12-01), just you (12-02), fog and post bag (12-04), the full-screen error (12-05), short name at AX5, critter status in its VoiceOver label |
| 04-02 | Chats: farms and visits together | ✓ fixed | ✓ fixed | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: no "no chats" flash before the cottage answers; the 12-15 empty state; header grows at AX5 |
| 04-03 | Group chat, the farm as its header (tap the dewdrop) | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ | fixed here: the farm header at night (cottages, lit windows); composer stacks at AX5 |
| 04-04 | Busy chat with 12 critters (scroll: the farm shrinks) | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ | fixed here: the farm header at night (cottages, lit windows); composer stacks at AX5 |
| 04-05 | Who lives here: tap a critter for their card | ✓ | – | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: two to a row at AX5, names and states wrap |
| 04-06 | Tap a critter: their card, and start a visit | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: action tiles grow |
| 04-07 | A visit: just two critters on a porch | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 04-08 | Reply to a message and @mention a friend | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 04-09 | Long-press your own message: edit, pin, unsend | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 04-10 | Pinned messages: the farm noticeboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 04-11 | Search: messages, photos and links | – | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ fixed | ✓ | fixed here: no hard-coded name when no critter is known |
| 04-12 | Recording a voice note (hold, slide up to lock) | – | – | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | ✓ | fixed here: the singing critter holds still under Reduce Motion |
| 04-13 | Photo and video viewer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 04-14 | Shared on the farm: photos, videos, links, voice | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 04-15 | Message states, link previews and typing | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 04-16 | Welcome back: hugs, never a list | ✓ | – | ✓ | ✓ fixed | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: a refused "say hi" says why in a toast and stays on the moment; the resting sheet scrolls at AX5 |
| 04-17 | A little valley of farms (switcher) | ✓ | – | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 04-18 | Plant a new farm | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: the plant sheet scrolls at AX5, the lands stack with their names beside them |
| 04-19 | Move-in day: a new critter arrives | ✓ | – | ✓ | ✓ fixed | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: a refused wave says why in a toast and stays on the moment; your own move-in opens after onboarding; sheet scrolls at AX5 |
| 04-20 | Leaving a farm quietly | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: sheet scrolls at AX5 |
| 04-21 | What you see if you're removed from a farm | – | – | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: art, words and buttons stack in one scrolling column at AX5 |
| 04-22 | A sleeping cottage for someone who left | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: sheet scrolls at AX5 |
| 04-23 | Speech bubbles: 24-hour statuses over each critter | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | fixed here: bubbles grow with text up to 1.6 times, placed at that size; status read with its critter |
| 05-01 | Long-press a message: tend, plant, keep | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 05-02 | The + tray: tend without words | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: scene and overlay sheets scroll at AX5; pills grow |
| 05-03 | Leave a firefly on a doorstep (pick a door) | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: scene and overlay sheets scroll at AX5; pills grow |
| 05-04 | Quick Tend: three waiting, the rest in a bouquet (tap a reply) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | only reachable from the development gestures lab |
| 05-05 | Slow post: your critter carries it overnight | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: scene and overlay sheets scroll at AX5; pills grow |
| 05-06 | Knock on the window (it wobbles on their widget) | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: scene and overlay sheets scroll at AX5; pills grow |
| 05-07 | Heavy weather: Fig raised a rain cloud | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: scene and overlay sheets scroll at AX5; pills grow |
| 05-08 | Sharing into Kithfield from another app | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ | native share extension, fixed here (not seen on a device): follows dark appearance; text scales with Dynamic Type |
| 05-09 | Forwarding a message to another farm or visit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: header grows |
| 05-10 | Sending a file or document | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 05-11 | Every warm reaction, with what it means | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: scene and overlay sheets scroll at AX5; pills grow |
| 06-01 | Plant a seed (pick a day and place, watch it grow) | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: Cancel keeps room for its word |
| 06-02 | Picking a day: voting buds and the sun patch (tap a bud) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | fixed here: buds and sun patches grow; a bud says who leans on it, by name and never as a count |
| 06-03 | The organiser's hat chases RSVPs so Pip doesn't have to | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 06-04 | Seed bed: plans live here, not in the chat | ✓ | ✓ fixed | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: the 12-13 empty state, calendar pill grows, first-run tip 3 of 3 |
| 06-05 | Remember-me seed: interview Thursday becomes a Friday nudge | – | – | ✗ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ | offline: remember-me goes straight to the API, not the post bag; the envelope wobble is not built |
| 06-06 | Hangout day: everyone at the campfire | ✓ fixed | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: no "nobody here" flash; the hangout sheet stops below the back button and scrolls at AX5 |
| 07-01 | Birthday bloom over Bea's cottage | ✓ fixed | ✓ | ✓ | ✓ fixed | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: a refused dewdrop or signature says why |
| 07-02 | Sunday harvest recap, with the best pollinator | ✓ fixed | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | fixed here: pencil rows while loading; offline: no cached copy |
| 07-03 | Shared rain: three or more of you online at once | – | – | ✓ | ✓ fixed | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: a refused wave says why |
| 07-04 | Restoration project: the old greenhouse (try the overnight reveal) | – | ✗ | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ | empty: no project shows an empty caption |
| 07-05 | Visiting Kit's farm, where plums are in season | ✓ fixed | – | ✗ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: pencil rows while loading; offline: the gate needs the network |
| 07-06 | The scrapbook: every hangout becomes a pressed flower | ✓ fixed | ✓ fixed | ✗ | ✓ fixed | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: pencil rows while loading, refusals said, one tall page a row at AX5; offline: needs the network |
| 08-01 | Sticker picker in the chat (tap the tabs) | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | fixed here: the preview no longer nests the sticker inside another button; offline: owned packs are kept in memory only |
| 08-02 | Together stickers: pick friends (tap the faces) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | 12-16 counterpart; fixed here: one scrolling column at AX5, face names on two lines and faces wrapping |
| 08-03 | Quick Tend: stickers as one-tap replies (tap one) | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | loading: blank while Quick Tend loads |
| 08-04 | Sticker shop: themed packs | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ |  |
| 08-05 | Send a pack as a gift | ✓ | ✓ | ✗ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ fixed | offline: no "prices unavailable" line; fixed here: each wrap is read by its name |
| 08-06 | On Bea's phone: the gift opens | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | a failed fetch reads as "gone"; fixed here: one scrolling column at AX5, the two buttons stacked |
| 09-01 | Rocco's cart: this week's rotation | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: names and lines wrap at AX5 |
| 09-02 | Try it on live on the farm, by day and at night (tap) | ✓ | – | ✓ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ | fixed here: pills and buttons grow |
| 09-20 | Preview it on your home-screen widget | ✓ | – | ✓ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ | fixed here: pills and buttons grow |
| 09-21 | Your collection | ✓ fixed | ✓ | ✓ fixed | ✓ fixed | ✓ | – | ✓ | ✓ | ✓ | fixed here: a failed collection fetch says so with Try again |
| 09-13 | Cottage styles: on the farm, at night, and in the widget | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | partly built: shown through the item screen by kind |
| 09-14 | Companions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | partly built: shown through the item screen by kind |
| 09-15 | Rare coats, for any critter | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | partly built: shown through the item screen by kind |
| 09-16 | Things that react to friends | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | partly built: shown through the item screen by kind |
| 09-17 | A matching set, and its set reward | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ | fixed here: the tick takes the shop ink; piece names wrap |
| 09-27 | Matching sets, each with its own reward | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ | fixed here: the tick takes the shop ink; piece names wrap |
| 09-06 | Tap a friend's item: see it, wish for it | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 09-18 | Your wishlist, on your critter card | ✓ fixed | ✓ | ✓ fixed | ✓ fixed | ✓ | – | ✓ fixed | ✓ | ✓ | fixed here: loading line, and "couldn’t" when the wishlist can’t be read |
| 09-19 | June's birthday: friends chip in on a wished-for gift | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: names and lines wrap at AX5 |
| 09-04 | Choosing a gift for Otis, and how to wrap it | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: names and lines wrap at AX5 |
| 09-05 | On Otis's phone: something on the step | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 09-07 | Shared farm themes the group chips in for | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: names and lines wrap at AX5 |
| 09-03 | Patrons: one honest screen | – | – | – | ✗ | ✓ | – | ✓ fixed | ✓ | ✓ fixed | fixed here: paywall pills wrap, Restore is a button; error: the costs link has no page yet |
| 09-22 | Patron tiers | ✓ | – | ✓ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ fixed | fixed here: price wraps; the yearly switch is a VoiceOver action, not a hidden button |
| 09-10 | You're a patron: your view | ✓ fixed | – | ✓ fixed | ✓ fixed | ✓ | ✓ | ✓ | ✓ | ✓ | fixed here: waits for the shop and offers Try again |
| 09-11 | Managing your patronage | ✓ fixed | – | ✓ fixed | ✓ fixed | ✓ | – | ✓ fixed | ✓ | ✓ | fixed here: waits for entitlements and offers Try again; plan rows wrap |
| 09-12 | When patronage lapses: owned items stay | ✓ fixed | – | ✗ | ✗ | ✓ | – | ✓ fixed | ✓ | ✓ | fixed here: no "nothing kept" flash; pills wrap |
| 09-23 | The farmers' wall, and voting on the next critter | ✓ fixed | – | ✓ fixed | ✓ fixed | ✓ | – | ✓ | ✓ | ✓ | fixed here: a quiet line while the wall loads, Try again if it can’t; a failed vote still reads as none |
| 09-08 | Printing the scrapbook: a year, bound in cloth (tap a colour) | ✓ | – | ✓ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ | fixed here: pills and buttons grow |
| 09-24 | Public costs page (kithfield.com/costs) | – | – | – | – | – | – | – | – | – | not built |
| 09-25 | Merch (kithfield.com/shop) | – | – | – | – | – | – | – | – | – | not built |
| 09-26 | Concept: Kithfield for teams | – | – | – | – | – | – | – | – | – | not built |
| 10-01 | Home screen widgets (other apps shown in tinted mode) | ✓ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ fixed | native, fixed here (not seen on a device): theme colours, Dynamic Type with a cap, window links say whose they are |
| 10-02 | The day of: Dynamic Island and Live Activity | – | ✓ | – | – | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ fixed | native, fixed here (not seen on a device): theme colours, Dynamic Type with a cap, art labelled or hidden |
| 10-03 | Lock screen: soft pushes that back off | – | – | ✓ | ✓ | ✓ | – | – | ✓ | – | native notification service |
| 10-04 | Long-press a notification to answer from it | – | – | ✓ | ✓ | – | – | – | ✓ | – | system notification actions |
| 10-05 | Export stickers: take your critter anywhere | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: pills grow |
| 10-06 | In Messages: the Kithfield sticker drawer | – | ✓ fixed | ✓ | ✓ | ✓ | – | – | ✓ fixed | ✓ | native, fixed here (not seen on a device): an empty drawer says how to fill it; file names read as words |
| 10-07 | Telegram and WhatsApp: the pack is ready to add | ✓ | – | ✓ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ | fixed here: one scrolling column at AX5, each card's Open wraps under its name |
| 10-08 | Dynamic Island while you're by the fire | – | ✓ | – | – | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ fixed | native, fixed here (not seen on a device): theme colours, Dynamic Type with a cap, art hidden |
| 10-09 | Lock screen while you're by the fire | – | ✓ | – | – | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ fixed | native, fixed here (not seen on a device): theme colours, Dynamic Type with a cap, art hidden |
| 10-10 | Picture in picture: your lantern frame floats over other apps | – | – | – | – | – | – | – | – | – | not built (picture in picture) |
| 10-11 | AirPods and switching where the sound goes | – | ✗ | – | ✗ | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | empty: nothing when no route is known; error: a failed route change is not caught; fixed here: the current route says it is selected; the routes scroll at AX5 |
| 10-12 | Asking for the microphone, the first time you join in | – | – | – | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: the ask sheet scrolls at AX5 |
| 10-13 | Asking for the camera, the first time you light your lantern | – | – | – | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: the ask sheet scrolls at AX5 |
| 10-14 | Widget:  | ✓ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ fixed | native, fixed here (not seen on a device): theme colours, Dynamic Type with a cap, window links say whose they are |
| 11-01 | The You tab: social battery and Hibernate (tap them) | ✓ fixed | – | ✓ | ✓ fixed | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: pencil rows, then "couldn’t reach" with Try again; your name wraps |
| 11-02 | Settings: privacy, AI catch-up (off), account | ✓ | ✓ | ✓ fixed | ✓ fixed | ✓ | ✓ | ✓ | ✓ | ✓ | fixed here: a failed load says so over the rows |
| 11-03 | Deleting your account | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-04 | Account deleted: a kind goodbye | – | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-13 | Sign in on a computer: scan the QR code | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-14 | Your signed-in devices | ✓ fixed | – | ✓ fixed | ✓ fixed | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: loading and failure with Try again |
| 11-15 | Signing out of this phone | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-16 | History arriving on a new phone | ✗ | – | ✓ fixed | ✓ fixed | ✓ | ✓ | ✓ | ✓ | ✓ | fixed here: a failed farm list says so with Try again; no bars until farms load |
| 11-17 | About: house rules, privacy, help | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-05 | Farm settings | ✓ | – | ✓ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ | fixed here: chip grows |
| 11-06 | Members and roles | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | fixed here: menu rows grow, the backdrop is a button |
| 11-07 | Invite link and farm size | ✓ fixed | – | ✓ fixed | ✓ fixed | ✓ | – | ✓ fixed | ✓ | ✓ | fixed here: waits for the current link, says when it can’t |
| 11-08 | Notifications and muting for this farm | ✓ fixed | – | ✓ fixed | ✓ fixed | ✓ | – | ✓ | ✓ | ✓ | fixed here: loading and failure with Try again |
| 11-09 | Report a message | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-10 | Block someone | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-11 | A keeper removes a member | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-12 | What a blocked person sees (on Bram's phone) | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-18 | Asking first: captions use an outside AI (from 16-10) | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-19 | Asking first: an AI-written Sunday recap (from 07-02) | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-20 | Settings › AI and your data: every switch, and taking it back | ✓ | – | ✓ fixed | ✓ fixed | ✓ | ✓ | ✓ | ✓ | ✓ | fixed here: switches wait, never read "off", and a failure says so |
| 11-21 | The reporter hears back, kindly and within a day | ✓ fixed | ✓ | ✓ fixed | ✓ fixed | ✓ | ✓ | ✓ | ✓ | ✓ fixed | fixed here: loading and failure in the sheet and the list; the safety email is a link that writes to it |
| 11-22 | The reported person: what was removed, and asking for another look | ✓ fixed | – | ✓ fixed | ✓ fixed | ✓ | ✓ | ✓ | ✓ | ✓ | fixed here: loading and failure in the sheet |
| 12-01 | Loading: the farm draws itself in | ✓ fixed | – | – | – | ✓ | ✓ fixed | ✓ | ✓ | ✓ fixed | built here: paper, pencil rows, "drawing the farm…", the wobbly reveal; Reduce Motion cross-fades |
| 12-02 | Empty: a brand-new farm with just you | ✓ fixed | ✓ fixed | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | built here |
| 12-03 | Empty: a search that finds nothing | – | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 12-04 | Offline: the farm in a fog | ✓ | – | ✓ fixed | – | ✓ fixed | ✓ | ✓ | ✓ | ✓ | built here: mist, banner, post bag; a dusk fog at night (undesigned) |
| 12-05 | Error: the farm couldn't load | – | – | – | ✓ fixed | ✓ | ✓ | ✓ | ✓ | ✓ | built here; art at the top; Try again reconnects at once |
| 12-06 | Slow upload on a weak signal | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | built by the media lane, not re-exercised here |
| 12-07 | First-run hints, one at a time | – | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | built here: three tips in the window layer, the tab bar left lit |
| 12-08 | Farm home at night | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 12-09 | Group chat at night (dark appearance) | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | ✓ | ✓ | fixed here: header art and mic at night |
| 12-10 | Reduce Motion: everything holds still | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | checked: the farm holds still |
| 12-11 | Largest Dynamic Type (AX5): the chat reflows | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: short name, stacked composer, short placeholder |
| 12-12 | Vietnamese, with fallback fonts for tone marks | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | fixed here: Vietnamese line-height floor in Txt |
| 12-13 | Empty seed bed | – | ✓ fixed | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | aligned here to the design |
| 12-14 | Empty scrapbook | – | ✓ fixed | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | aligned here to the design |
| 12-15 | No visits yet | – | ✓ fixed | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | aligned here to the design |
| 12-16 | An empty sticker drawer (Together tab) | – | ✓ fixed | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | built here inside the sticker picker; the design’s standalone Stickers screen with Mine / Together / Packs is not built |
| 13-02 | App Store screenshots · one panorama across six frames (6.9) | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-03 | Night set | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-04 | Vietnamese set (adapted, not translated) | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-05 | iPad 13 set · three-pane layout from 14-01 | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-06 | Google Play · feature graphic and phone screenshots | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-18 | App Preview video · 30 s, no voiceover, captions only | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-19 | Listing copy | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-20 | In-App Events · card and detail art | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-21 | Custom Product Pages · four audiences, each with its own first frame | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-07 | The app icon: a critter in a lit window | – | – | – | – | – | – | – | – | – | not built |
| 13-08 | The chosen icon, as iOS 26 layers for Icon Composer | – | – | – | – | – | – | – | – | – | not built |
| 13-09 | Default, dark, tinted and clear | – | – | – | – | – | – | – | – | – | not built |
| 13-10 | Every size | – | – | – | – | – | – | – | – | – | not built |
| 13-11 | On a real home screen, by day and at night | – | – | – | – | – | – | – | – | – | not built |
| 13-12 | Icon A/B test · product page optimisation | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-13 | Alternate icons for patrons: your critter, and four seasons | – | – | – | – | – | – | – | – | – | not built |
| 13-14 | Android adaptive icon and themed monochrome | – | – | – | – | – | – | – | – | – | not built |
| 13-01 | Launch screen: the first frame of the farm drawing in | – | – | – | – | – | – | – | – | – | not built |
| 13-15 | Cold start: launch screen → the farm inks in (12-01) → farm home | – | – | – | – | – | – | – | – | – | partly built: the splash holds; no reveal canvas or warm-start split |
| 13-16 | Warm start, and Reduce Motion | – | – | – | – | – | – | – | – | – | partly built: the splash holds; no reveal canvas or warm-start split |
| 13-17 | Android 12+ splash: the window lights up | – | – | – | – | – | – | – | – | – | not built |
| 13-22 | Launch film · 45 s, to animate in Limner | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-23 | Six looping clips for TikTok and Reels | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-24 | Product Hunt gallery | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-25 | X / Threads launch thread | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-26 | Sticker pack teaser · shareable | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-27 | OG images and press kit hero | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 13-28 | Copy and export sizes, every asset | – | – | – | – | – | – | – | – | – | web or store page, not an app screen |
| 14-01 | iPad: farms and visits / chat / live farm | – | – | – | – | – | – | – | – | – | not built |
| 14-02 | Large-screen farm, chat floating at the side | – | – | – | – | – | – | – | – | – | not built |
| 14-03 | iPhone Duo, closed: outer display, controls on the side | – | – | – | – | – | – | – | – | – | not built |
| 14-04 | iPhone Duo, open and partly folded: farm / chat | – | – | – | – | – | – | – | – | – | not built |
| 14-05 | Android farm home: navigation bar and dewdrop FAB | – | – | – | – | – | – | – | – | – | not built |
| 14-06 | Android chat with predictive back to the farm | – | – | – | – | – | – | – | – | – | not built |
| 14-07 | Android notifications with direct actions | – | – | – | – | – | – | – | – | – | not built |
| 14-08 | Android home-screen widgets | – | – | – | – | – | – | – | – | – | not built |
| 14-09 | Web join: the invite opens a working farm | – | – | – | – | – | – | – | – | – | not built |
| 14-10 | Narrow web layout (under 600px) | – | – | – | – | – | – | – | – | – | not built |
| 14-11 | Desktop: three panes, dropping photos, menu-bar critter with a firefly | – | – | – | – | – | – | – | – | – | not built |
| 14-12 | Typing : for stickers, and the shortcuts list (⌘/) | – | – | – | – | – | – | – | – | – | not built |
| 14-13 | Windows tray critter: a firefly glows | – | – | – | – | – | – | – | – | – | not built |
| 14-14 | Desktop at night, with a soft notification | – | – | – | – | – | – | – | – | – | not built |
| 14-15 | Desktop: the fire room in the right-hand pane | – | – | – | – | – | – | – | – | – | not built |
| 14-16 | Desktop sign-in: scan with your phone | – | – | – | – | – | – | – | – | – | not built |
| 15-01 | The field guide: one season per page, six kinds of care as rows (tap a season) | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: titles, names, stages and status lines wrap at AX5 |
| 15-02 | A plant's page: Lavender, from voice notes | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: titles, names, stages and status lines wrap at AX5 |
| 15-03 | The farm in each season (northern hemisphere shown) | ✓ | – | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 15-09 | Real rain on the farm, with Apple Weather attribution | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: chip and pill grow |
| 15-04 | A rare bloom appears after shared rain | ✓ | – | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 15-05 | Harvest day: what everyone grew together | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: titles, names, stages and status lines wrap at AX5 |
| 15-06 | Trading crops when visiting a friend's farm | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: titles, names, stages and status lines wrap at AX5 |
| 15-07 | Every plant, every stage | – | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 15-08 | Farm rules (for developers) | – | – | – | – | – | – | – | – | – | a developer document, not an app screen |
| 15-10 | A visit’s porch pot: one plant a season, grown by both of you | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: titles, names, stages and status lines wrap at AX5 |
| 15-11 | The visit’s own little scrapbook: one pressed bloom each season | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: titles, names, stages and status lines wrap at AX5 |
| 16-01 | An unlit fire: anyone can light it | ✓ fixed | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: no lit-fire flash, buttons grow |
| 16-02 | Mo's by the fire: a soft glow on the farm | – | – | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 16-03 | Joining: your critter walks over. Listen, or join in | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: buttons and tiles grow |
| 16-04 | Listening: Bea talks, her critter laughs as she does | ✓ | – | ✓ | ✓ | ✓ | ✓ fixed | ✓ fixed | ✓ | ✓ | fixed here: level bars still; chips grow to two lines up to 2×, Large Content Viewer |
| 16-05 | You're muted, and gestures work by the fire | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: buttons and tiles grow |
| 16-06 | Speaking: your critter lip-syncs as you talk | ✓ | – | ✓ | ✓ | ✓ | ✓ fixed | ✓ fixed | ✓ | ✓ | fixed here: level bars still; chips grow to two lines up to 2×, Large Content Viewer |
| 16-07 | A full circle: 8 friends, one listening, one on a weak connection | ✓ | – | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: chips grow, Large Content Viewer |
| 16-08 | Leaving: your critter waves and walks home | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: buttons and tiles grow |
| 16-09 | The room goes quiet as the last person leaves | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: buttons and tiles grow |
| 16-10 | Live captions and translation (Plus) | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | fixed here: the captions sheet closes with the escape gesture |
| 16-11 | Hear it, read it: captions, translation and expressions | ✓ | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 16-12 | Light your lantern: two people | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | fixed here: name chips grow; each frame says who it is, talking or muted, lantern lit or camera off |
| 16-13 | Lanterns for 3–4 people | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | fixed here: name chips grow; each frame says who it is, talking or muted, lantern lit or camera off |
| 16-14 | Lanterns for 6–8: the frames sit around the fire | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | fixed here: name chips grow; each frame says who it is, talking or muted, lantern lit or camera off |
| 16-15 | Sharing your screen by the fire | ✓ | – | – | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | partly built: sharing from your own phone is not ready |
| 16-16 |  | ✓ | – | – | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | fixed here: your own frame says it is yours, muted or talking, and your lantern |
| 16-17 | Critter mask: your face drives your critter | – | – | – | – | – | – | – | – | – | not built (marked later in the design) |
| 16-18 | A visit call: Otis knocks on your porch door | – | – | – | – | – | – | – | – | – | not built (marked later in the design) |
| 16-19 | Declined with a sticker, and a missed knock | – | – | – | – | – | – | – | – | – | not built (marked later in the design) |
