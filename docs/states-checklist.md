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
| Loading | 102 | 18 | 46 |
| Empty | 51 | 5 | 110 |
| Offline | 124 | 21 | 21 |
| Error | 111 | 23 | 32 |
| Night | 157 | 8 | 1 |
| Reduce Motion | 144 | 0 | 22 |
| AX5 | 106 | 57 | 3 |
| Vietnamese | 165 | 1 | 0 |
| VoiceOver | 149 | 15 | 2 |

What is left, by kind (each row's note has the detail):
- **AX5** is the largest gap: onboarding's absolutely placed screens, one-line labels in the shop
  and field guide, fixed name chips in the fire room, and the native surfaces' fixed font sizes.
- **Loading, offline and error** on screens that read straight from the API (much of Settings,
  the patron screens, recap, scrapbook, visit gates) are silent or blank when a call fails.
- **Night** is open only on native surfaces (hard-coded colours in Swift) and two onboarding cards.
- **VoiceOver** gaps are nested buttons (sticker preview, yearly switch), the friends list's
  Invite chips (needs a label on the shared Chip), and unlabelled native art.

## Screens

| Screen | Title | Loading | Empty | Offline | Error | Night | Reduce Motion | AX5 | Vietnamese | VoiceOver | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 03-01 | Welcome | – | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: the invite sheet is a fixed 0.42 detent and does not scroll |
| 03-02 | Sign in: Apple, Google or email | ✗ | – | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | loading: no busy look on the sign-in buttons; night: Google button keeps day colours; AX5: absolutely placed title runs under the buttons |
| 03-03 | Email: a code arrives by post | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: code boxes are 60 tall, absolute layout |
| 03-04 | Who are you? Sixteen critters, filter by shape (tap) | – | – | – | – | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: the chip scroller is 32 tall |
| 03-05 | Make them yours: coat, markings, accessory (tap) | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | night: the twin card keeps day colours; AX5: options sit in a 172-tall absolute box |
| 03-06 | Asking for notifications, in the farm's voice | – | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: absolute text runs under the bottom bar |
| 03-07 | Name the farm, save a spot for friends | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: the farm-name field sits under the keyboard |
| 03-13 | Sign in with a phone number | – | – | – | – | – | – | – | – | – | not built (phone sign-in is deferred) |
| 03-14 | Age check: a birthday, kindly asked | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: the select row holds its label to one line (heights now grow) |
| 03-15 | House rules and our privacy promise (Terms and Privacy) | ✗ | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | loading: the Terms date row is blank until loaded |
| 03-08 | Asking for contacts | – | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: absolute text runs under the bottom bar |
| 03-09 | Find friends from contacts | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ | loading: empty list while contacts are read; empty: nothing for a search with no match; error: a failed invite is not caught; VoiceOver: each Invite chip reads only "Invite" (needs a label prop on ui Chip) |
| 03-10 | Joining without the app (the invite link in Safari) | ✗ | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | app side only (the page itself is the website); loading: blank while the session loads; AX5: absolute title |
| 03-11 | Asking for photos, the first time you attach one | – | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | built but nothing opens it; AX5 as 03-06 |
| 03-12 | Asking for location: optional, on the day only | – | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | built but nothing opens it; AX5 as 03-06 |
| 04-01 | Farm home (try the season and night tweaks) | ✓ fixed | ✓ fixed | ✓ fixed | ✓ fixed | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | fixed here: the reveal (12-01), just you (12-02), fog and post bag (12-04), the full-screen error (12-05), short name at AX5, critter status in its VoiceOver label |
| 04-02 | Chats: farms and visits together | ✓ fixed | ✓ fixed | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: no "no chats" flash before the cottage answers; the 12-15 empty state; header grows at AX5 |
| 04-03 | Group chat, the farm as its header (tap the dewdrop) | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ | fixed here: the farm header at night (cottages, lit windows); composer stacks at AX5 |
| 04-04 | Busy chat with 12 critters (scroll: the farm shrinks) | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | ✓ | ✓ | fixed here: the farm header at night (cottages, lit windows); composer stacks at AX5 |
| 04-05 | Who lives here: tap a critter for their card | ✓ | – | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: four-column tiles cut names and statuses |
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
| 04-16 | Welcome back: hugs, never a list | ✓ | – | ✓ | ✗ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | error: "say hi" ignores a refused wave; fixed here: the resting sheet scrolls at AX5 |
| 04-17 | A little valley of farms (switcher) | ✓ | – | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 04-18 | Plant a new farm | – | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: the plant sheet does not scroll |
| 04-19 | Move-in day: a new critter arrives | ✓ | – | ✓ | ✗ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | error: the wave ignores a refusal; fixed here: sheet scrolls at AX5 |
| 04-20 | Leaving a farm quietly | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: sheet scrolls at AX5 |
| 04-21 | What you see if you're removed from a farm | – | – | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: absolutely placed text runs under the buttons |
| 04-22 | A sleeping cottage for someone who left | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: sheet scrolls at AX5 |
| 04-23 | Speech bubbles: 24-hour statuses over each critter | – | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ fixed | AX5: bubble width is estimated at a fixed width per character; fixed here: status read with its critter |
| 05-01 | Long-press a message: tend, plant, keep | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 05-02 | The + tray: tend without words | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: scene and overlay sheets scroll at AX5; pills grow |
| 05-03 | Leave a firefly on a doorstep (pick a door) | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: scene and overlay sheets scroll at AX5; pills grow |
| 05-04 | Quick Tend: three waiting, the rest in a bouquet (tap a reply) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | only reachable from the development gestures lab |
| 05-05 | Slow post: your critter carries it overnight | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: scene and overlay sheets scroll at AX5; pills grow |
| 05-06 | Knock on the window (it wobbles on their widget) | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: scene and overlay sheets scroll at AX5; pills grow |
| 05-07 | Heavy weather: Fig raised a rain cloud | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: scene and overlay sheets scroll at AX5; pills grow |
| 05-08 | Sharing into Kithfield from another app | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | native share extension: night uses day colours only; fixed font sizes |
| 05-09 | Forwarding a message to another farm or visit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: header grows |
| 05-10 | Sending a file or document | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 05-11 | Every warm reaction, with what it means | – | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: scene and overlay sheets scroll at AX5; pills grow |
| 06-01 | Plant a seed (pick a day and place, watch it grow) | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: Cancel is 64 wide |
| 06-02 | Picking a day: voting buds and the sun patch (tap a bud) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | AX5: the bud (250) and sun patch (78) are fixed; VoiceOver: a bud does not say how many lean on it |
| 06-03 | The organiser's hat chases RSVPs so Pip doesn't have to | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 06-04 | Seed bed: plans live here, not in the chat | ✓ | ✓ fixed | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: the 12-13 empty state, calendar pill grows, first-run tip 3 of 3 |
| 06-05 | Remember-me seed: interview Thursday becomes a Friday nudge | – | – | ✗ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ | offline: remember-me goes straight to the API, not the post bag; the envelope wobble is not built |
| 06-06 | Hangout day: everyone at the campfire | ✓ fixed | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | fixed here: no "nobody here" flash; AX5: the hangout sheet does not scroll |
| 07-01 | Birthday bloom over Bea's cottage | ✓ fixed | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: no "over" flash, sheet scrolls; error: a refused water or signature is ignored |
| 07-02 | Sunday harvest recap, with the best pollinator | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | loading: blank; offline: no cached copy |
| 07-03 | Shared rain: three or more of you online at once | – | – | ✓ | ✗ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | error: a refused wave is ignored |
| 07-04 | Restoration project: the old greenhouse (try the overnight reveal) | – | ✗ | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✓ | empty: no project shows an empty caption |
| 07-05 | Visiting Kit's farm, where plums are in season | ✗ | – | ✗ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | loading: blank; offline: the gate needs the network |
| 07-06 | The scrapbook: every hangout becomes a pressed flower | ✗ | ✓ fixed | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | fixed here: the 12-14 empty state; loading: no placeholder; offline: needs the network; AX5: page cards are a fixed 184 |
| 08-01 | Sticker picker in the chat (tap the tabs) | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | fixed here: tabs are tabs; offline: owned packs are kept in memory only; VoiceOver: the preview send button is nested in another button |
| 08-02 | Together stickers: pick friends (tap the faces) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | 12-16 counterpart; AX5: no scroll, face names one line |
| 08-03 | Quick Tend: stickers as one-tap replies (tap one) | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | loading: blank while Quick Tend loads |
| 08-04 | Sticker shop: themed packs | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ |  |
| 08-05 | Send a pack as a gift | ✓ | ✓ | ✗ | ✓ | ✓ | – | ✓ fixed | ✓ | ✗ | offline: no "prices unavailable" line; VoiceOver: wrap names read as raw ids |
| 08-06 | On Bea's phone: the gift opens | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ | a failed fetch reads as "gone"; AX5: no scroll |
| 09-01 | Rocco's cart: this week's rotation | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: item tile lines held to one line |
| 09-02 | Try it on live on the farm, by day and at night (tap) | ✓ | – | ✓ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ | fixed here: pills and buttons grow |
| 09-20 | Preview it on your home-screen widget | ✓ | – | ✓ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ | fixed here: pills and buttons grow |
| 09-21 | Your collection | ✗ | ✓ | ✗ | ✗ | ✓ | – | ✓ | ✓ | ✓ | a failed collection fetch loads forever |
| 09-13 | Cottage styles: on the farm, at night, and in the widget | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | partly built: shown through the item screen by kind |
| 09-14 | Companions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | partly built: shown through the item screen by kind |
| 09-15 | Rare coats, for any critter | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | partly built: shown through the item screen by kind |
| 09-16 | Things that react to friends | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | partly built: shown through the item screen by kind |
| 09-17 | A matching set, and its set reward | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✗ | ✓ | ✓ | fixed here: the tick takes the shop ink; AX5: piece name one line |
| 09-27 | Matching sets, each with its own reward | ✓ | – | ✓ | ✓ | ✓ fixed | ✓ | ✗ | ✓ | ✓ | fixed here: the tick takes the shop ink; AX5: piece name one line |
| 09-06 | Tap a friend's item: see it, wish for it | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 09-18 | Your wishlist, on your critter card | ✓ fixed | ✓ | ✗ | ✗ | ✓ | – | ✗ | ✓ | ✓ | fixed here: no "empty" flash; a failed fetch is swallowed |
| 09-19 | June's birthday: friends chip in on a wished-for gift | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✗ | ✓ | ✓ | AX5: one-line label |
| 09-04 | Choosing a gift for Otis, and how to wrap it | ✓ | – | ✓ | ✓ | ✓ | – | ✗ | ✓ | ✓ | AX5: gift name one line |
| 09-05 | On Otis's phone: something on the step | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 09-07 | Shared farm themes the group chips in for | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: one-line label |
| 09-03 | Patrons: one honest screen | – | – | – | ✗ | ✓ | – | ✗ | ✓ | ✓ fixed | error: the costs link has no page yet; AX5: the paywall subline is one line; fixed here: Restore is a button |
| 09-22 | Patron tiers | ✓ | – | ✓ | ✓ | ✓ | – | ✗ | ✓ | ✗ | AX5: price one line; VoiceOver: the yearly switch is nested in the radio card |
| 09-10 | You're a patron: your view | ✗ | – | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | loading, offline and error are not handled |
| 09-11 | Managing your patronage | ✗ | – | ✗ | ✗ | ✓ | – | ✗ | ✓ | ✓ | blank until entitlements arrive; AX5: plan row one line |
| 09-12 | When patronage lapses: owned items stay | ✓ fixed | – | ✗ | ✗ | ✓ | – | ✗ | ✓ | ✓ | fixed here: no "nothing kept" flash |
| 09-23 | The farmers' wall, and voting on the next critter | ✗ | – | ✗ | ✗ | ✓ | – | ✓ | ✓ | ✓ | the wall and vote swallow failures |
| 09-08 | Printing the scrapbook: a year, bound in cloth (tap a colour) | ✓ | – | ✓ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ | fixed here: pills and buttons grow |
| 09-24 | Public costs page (kithfield.com/costs) | – | – | – | – | – | – | – | – | – | not built |
| 09-25 | Merch (kithfield.com/shop) | – | – | – | – | – | – | – | – | – | not built |
| 09-26 | Concept: Kithfield for teams | – | – | – | – | – | – | – | – | – | not built |
| 10-01 | Home screen widgets (other apps shown in tinted mode) | ✓ | ✓ | ✓ | – | ✗ | ✓ | ✗ | ✓ | ✗ | native widget: hard-coded colours, fixed font sizes, window links unlabelled |
| 10-02 | The day of: Dynamic Island and Live Activity | – | ✓ | – | – | ✗ | ✓ | ✗ | ✓ | ✗ | native Live Activity: hard-coded colours, fixed sizes, images unlabelled |
| 10-03 | Lock screen: soft pushes that back off | – | – | ✓ | ✓ | ✓ | – | – | ✓ | – | native notification service |
| 10-04 | Long-press a notification to answer from it | – | – | ✓ | ✓ | – | – | – | ✓ | – | system notification actions |
| 10-05 | Export stickers: take your critter anywhere | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: pills grow |
| 10-06 | In Messages: the Kithfield sticker drawer | – | ✗ | ✓ | ✓ | ✓ | – | – | ✗ | ✓ | native drawer: blank when there are no stickers; labels fall back to file names |
| 10-07 | Telegram and WhatsApp: the pack is ready to add | ✓ | – | ✓ | ✓ | ✓ | – | ✗ | ✓ | ✓ | AX5: no scroll |
| 10-08 | Dynamic Island while you're by the fire | – | ✓ | – | – | ✗ | ✓ | ✗ | ✓ | ✗ | native: hard-coded colours, fixed sizes, art unlabelled |
| 10-09 | Lock screen while you're by the fire | – | ✓ | – | – | ✗ | ✓ | ✗ | ✓ | ✗ | native: hard-coded colours, fixed sizes, art unlabelled |
| 10-10 | Picture in picture: your lantern frame floats over other apps | – | – | – | – | – | – | – | – | – | not built (picture in picture) |
| 10-11 | AirPods and switching where the sound goes | – | ✗ | – | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ fixed | empty: nothing when no route is known; error: a failed route change is not caught; fixed here: the current route says it is selected |
| 10-12 | Asking for the microphone, the first time you join in | – | – | – | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: the ask sheet does not scroll |
| 10-13 | Asking for the camera, the first time you light your lantern | – | – | – | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: the ask sheet does not scroll |
| 10-14 | Widget:  | ✓ | ✓ | ✓ | – | ✗ | ✓ | ✗ | ✓ | ✗ | native widget: hard-coded colours, fixed font sizes, window links unlabelled |
| 11-01 | The You tab: social battery and Hibernate (tap them) | ✗ | – | ✓ | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ | fixed here: rows grow; loading: blank name; error: silent; AX5: name one line |
| 11-02 | Settings: privacy, AI catch-up (off), account | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | load failures are silent |
| 11-03 | Deleting your account | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-04 | Account deleted: a kind goodbye | – | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-13 | Sign in on a computer: scan the QR code | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-14 | Your signed-in devices | ✗ | – | ✗ | ✗ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | list pops in; failures other than "not served" are silent |
| 11-15 | Signing out of this phone | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-16 | History arriving on a new phone | ✗ | – | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | no bars until farms load; failures silent |
| 11-17 | About: house rules, privacy, help | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-05 | Farm settings | ✓ | – | ✓ | ✓ | ✓ | – | ✓ fixed | ✓ | ✓ | fixed here: chip grows |
| 11-06 | Members and roles | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | fixed here: menu rows grow, the backdrop is a button |
| 11-07 | Invite link and farm size | ✗ | – | ✗ | ✗ | ✓ | – | ✓ fixed | ✓ | ✓ | loading shows "no link"; a failed load looks like "no link" |
| 11-08 | Notifications and muting for this farm | ✓ | – | ✗ | ✗ | ✓ | – | ✓ | ✓ | ✓ | a failed load is silent |
| 11-09 | Report a message | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-10 | Block someone | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-11 | A keeper removes a member | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-12 | What a blocked person sees (on Bram's phone) | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-18 | Asking first: captions use an outside AI (from 16-10) | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-19 | Asking first: an AI-written Sunday recap (from 07-02) | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 11-20 | Settings › AI and your data: every switch, and taking it back | ✓ | – | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | after a failed load the switches read "off" |
| 11-21 | The reporter hears back, kindly and within a day | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ | empty sheet while loading or failed; VoiceOver: the safety email is not a link |
| 11-22 | The reported person: what was removed, and asking for another look | ✗ | – | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | empty sheet while loading or failed |
| 12-01 | Loading: the farm draws itself in | ✓ fixed | – | – | – | ✓ | ✓ fixed | ✓ | ✓ | ✓ fixed | built here: paper, pencil rows, "drawing the farm…", the wobbly reveal; Reduce Motion cross-fades |
| 12-02 | Empty: a brand-new farm with just you | ✓ fixed | ✓ fixed | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | built here |
| 12-03 | Empty: a search that finds nothing | – | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 12-04 | Offline: the farm in a fog | ✓ | – | ✓ fixed | – | ✓ fixed | ✓ | ✓ | ✓ | ✓ | built here: mist, banner, post bag; a dusk fog at night (undesigned) |
| 12-05 | Error: the farm couldn't load | – | – | – | ✓ fixed | ✓ | ✓ | ✓ | ✓ | ✓ | built here; Try again reconnects on the next backoff (see concerns) |
| 12-06 | Slow upload on a weak signal | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | built by the media lane, not re-exercised here |
| 12-07 | First-run hints, one at a time | – | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | built here: three tips, one at a time, never again |
| 12-08 | Farm home at night | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 12-09 | Group chat at night (dark appearance) | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | ✓ | ✓ | fixed here: header art and mic at night |
| 12-10 | Reduce Motion: everything holds still | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | checked: the farm holds still |
| 12-11 | Largest Dynamic Type (AX5): the chat reflows | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: short name, stacked composer, short placeholder |
| 12-12 | Vietnamese, with fallback fonts for tone marks | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | fixed here: Vietnamese line-height floor in Txt |
| 12-13 | Empty seed bed | – | ✓ fixed | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | aligned here to the design |
| 12-14 | Empty scrapbook | – | ✓ fixed | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | aligned here to the design |
| 12-15 | No visits yet | – | ✓ fixed | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | aligned here to the design |
| 12-16 | An empty sticker drawer (Together tab) | – | ✗ | – | – | ✓ | ✓ | ✗ | ✓ | ✓ | the Stickers screen with Mine / Together / Packs is not built; the together screen shows its own empty state |
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
| 15-01 | The field guide: one season per page, six kinds of care as rows (tap a season) | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: titles and status lines held to one line |
| 15-02 | A plant's page: Lavender, from voice notes | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: titles and status lines held to one line |
| 15-03 | The farm in each season (northern hemisphere shown) | ✓ | – | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 15-09 | Real rain on the farm, with Apple Weather attribution | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: chip and pill grow |
| 15-04 | A rare bloom appears after shared rain | ✓ | – | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 15-05 | Harvest day: what everyone grew together | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: titles and status lines held to one line |
| 15-06 | Trading crops when visiting a friend's farm | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: title one line |
| 15-07 | Every plant, every stage | – | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 15-08 | Farm rules (for developers) | – | – | – | – | – | – | – | – | – | a developer document, not an app screen |
| 15-10 | A visit’s porch pot: one plant a season, grown by both of you | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: titles and status lines held to one line |
| 15-11 | The visit’s own little scrapbook: one pressed bloom each season | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: titles and status lines held to one line |
| 16-01 | An unlit fire: anyone can light it | ✓ fixed | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: no lit-fire flash, buttons grow |
| 16-02 | Mo's by the fire: a soft glow on the farm | – | – | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 16-03 | Joining: your critter walks over. Listen, or join in | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: buttons and tiles grow |
| 16-04 | Listening: Bea talks, her critter laughs as she does | ✓ | – | ✓ | ✓ | ✓ | ✓ fixed | ✗ | ✓ | ✓ | fixed here: level bars hold still; AX5: name chips are fixed height |
| 16-05 | You're muted, and gestures work by the fire | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: buttons and tiles grow |
| 16-06 | Speaking: your critter lip-syncs as you talk | ✓ | – | ✓ | ✓ | ✓ | ✓ fixed | ✗ | ✓ | ✓ | as 16-04 |
| 16-07 | A full circle: 8 friends, one listening, one on a weak connection | ✓ | – | ✓ | – | ✓ | ✓ | ✗ | ✓ | ✓ | AX5: chips fixed height |
| 16-08 | Leaving: your critter waves and walks home | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: buttons and tiles grow |
| 16-09 | The room goes quiet as the last person leaves | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | fixed here: buttons and tiles grow |
| 16-10 | Live captions and translation (Plus) | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ fixed | fixed here: the captions sheet closes with the escape gesture |
| 16-11 | Hear it, read it: captions, translation and expressions | ✓ | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 16-12 | Light your lantern: two people | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | AX5: name chips 22 tall; VoiceOver: frames do not say who talks |
| 16-13 | Lanterns for 3–4 people | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | AX5: name chips 22 tall; VoiceOver: frames do not say who talks |
| 16-14 | Lanterns for 6–8: the frames sit around the fire | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | AX5: name chips 22 tall; VoiceOver: frames do not say who talks |
| 16-15 | Sharing your screen by the fire | ✓ | – | – | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✓ | partly built: sharing from your own phone is not ready |
| 16-16 |  | ✓ | – | – | ✓ | ✓ | ✓ | ✓ fixed | ✓ | ✗ | VoiceOver: your own frame is labelled with only your name |
| 16-17 | Critter mask: your face drives your critter | – | – | – | – | – | – | – | – | – | not built (marked later in the design) |
| 16-18 | A visit call: Otis knocks on your porch door | – | – | – | – | – | – | – | – | – | not built (marked later in the design) |
| 16-19 | Declined with a sticker, and a missed knock | – | – | – | – | – | – | – | – | – | not built (marked later in the design) |
