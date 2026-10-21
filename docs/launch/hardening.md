# Launch hardening

A security and privacy review of the API, the media Worker and the iOS app before the first store
submission, with what was fixed, what the founder or counsel still has to do, the App Store
privacy labels, the App Review notes, the legal checklist, and load and device measurements.

Reviewed on 19 October 2026 against `integrate/core` with the fixes on `feat/hardening`.

## 1. Summary

- **Fixed in code, each with a test:** the serious ones: Better Auth's session list handed
  out every session's bearer token; signing out on a phone left its device's action key, pushes and
  sockets alive; a visitor could write a one-sided trade by reusing an op id; paid clothes could be
  worn through a farm write or a join; anyone could open sockets (and create Durable Objects) without
  limit; no request body limit; farms left with no members were never deleted; Sign in with Apple
  tokens were never revoked on account deletion; RevenueCat kept the customer after deletion.
- **Founder:** set the new secrets (App Review account, Sign in with Apple key), enter the privacy
  labels and the review notes, decide on the unused location and photo-library permission strings,
  and check the items in §2.3.
- **Counsel:** the open legal items in §8 (licence, Decree 147, the Online Safety Act, age
  assurance, export compliance, retention periods).
- **Load:** one farm object handles 24 members (and 50 phones) bursting 10 writes each with no
  errors and no missed deliveries; p95 write latency is 0.3 s at 24 phones and 0.74 s at 50 phones
  on a local `wrangler dev` after the typing fix (§9).

## 2. Findings by severity

### 2.1 Fixed

| Severity | Finding | Fix (commit subject) |
|---|---|---|
| High | Farms left with no members after a purge kept their log, media, AI words and D1 rows for good | `fix(api): take away a farm nobody lives on once its last member's account is purged` |
| High (App Review 5.1.1(v)) | Sign in with Apple tokens were never revoked when an account was deleted | `feat(api): keep Sign in with Apple's refresh token and revoke it when the account is purged`, `feat(mobile): hand an Apple sign-in's code to the server, so deleting the account can revoke it` (live once the key is set, §10.2) |
| Medium | `GET /api/auth/list-sessions` returned the raw bearer token of every session (a fresh desktop session could copy the phone's 365-day token); Better Auth's revoke endpoints bypassed Kithfield's device cleanup | `fix(api): stop serving Better Auth's session list, which hands out every session's token` |
| Medium | A phone signing itself out left its device's action key working, its push token registered and its sockets open, and dropped it from the device list | `fix(api): end a phone's device when it signs itself out` |
| Medium | A visitor could reuse any op id the visited farm had answered (a gate gesture) to write a one-sided `traded` event, skipping the 90-day limit | `fix(api): finish a retried trade only from the trade its op id wrote` |
| Medium | Farm and cottage socket upgrades had no limit and no session, so anyone could create Durable Objects and hold sockets | `fix(api): limit farm and cottage socket upgrades per client address` (600 a minute per address, an IPv6 /64 as one, so phones behind a carrier NAT still reconnect) |
| Medium | No body-size limit: bodies were read whole before any schema check, including unauthenticated routes and webhooks | `fix(api): refuse request bodies over 256 KB before any route reads them` (the dev upload proxy and caption audio check their own length) |
| Medium | Safety-held originals (kept 180 days for an appeal) survived the author's purge | `fix(api): drop what a safety removal held back when its author's account is purged` |
| Medium | RevenueCat kept the customer and its purchase history after deletion | `fix(api): delete the person's RevenueCat customer when their account is purged` |
| Medium | The share extension calls a required-reason API (file attributes) with no privacy manifest; the app's manifest declared no collected data | `fix(mobile): declare the app's and the share extension's privacy manifests` |
| Medium | The data layer could start twice when its slot remounted (two stores, clients and socket sets) | `fix(mobile): start the data layer once per process, across remounts` |
| Low–medium | Paid wardrobe items could be worn through a phone-sent `critter_changed` or the critter given when joining | `fix(api): check the wardrobe on a farm's critter change and on joining, as on the profile` |
| Low | A banned person's device action keys kept working | `fix(api): refuse a banned person's device action keys and delete them with the ban` |
| Low | Sign-in nonce, deletion-code and desktop-code limits keyed on the raw address, so an IPv6 /64 stepped around them | `fix(api): count an IPv6 /64 as one address in the sign-in, deletion and desktop limits` |
| Low | Better Auth logged values (a failed letter's error, request details) with its messages | `fix(api): log Better Auth's messages without the values logged with them` |
| Low | Photos were sent to phones with `cache-control: public`, so a shared cache could keep one past its signed URL, an unsend or a quarantine | `fix(media): tell phones a photo is private; only the zone's cached copy is public` |
| Low | A chip-in kept its starter's tag words and its recipient's id after their purges | `fix(api): forget a chip-in's tag words and its recipient when their accounts are purged` |
| Low | Release builds kept `NSAllowsLocalNetworking` (plain HTTP to the LAN) | `fix(mobile): keep plain HTTP to the local network out of release builds` |
| Low | Any participant by the fire could publish caption lines in someone else's name | `fix(mobile): show fire caption lines from the server only` |
| Low (copy) | The contacts permission string promised matching by scrambled numbers, which doesn't exist | `fix(i18n): say what the contacts permission is for: inviting friends by text` (needs a new build) |
| Hot spot | Every typing on/off was broadcast to every socket at once | `perf(api): tell a farm who is writing at most every quarter second` |
| UI | The way in's back chevron was pushed out of its circle at the largest text size | `fix(mobile): keep the way in's back chevron inside its circle at the accessibility sizes` |
| UI | The welcome gate stayed in day colours at night | `fix(mobile): turn the welcome gate to night after sunset, as the farm does` |

### 2.2 Open, accepted or for later (no change made)

| Severity | Finding | Why it stays / what to do |
|---|---|---|
| Medium | No cap on how many writes a member sends a minute | A rejection is final and the outbox drops the write, so a cap would lose real messages (an outbox drains hundreds after a day offline). The burst test (§9) shows one farm absorbs 500 writes in under a second. Add a Cloudflare WAF rate rule on `/api/v1/farms/*/cmd` if abuse appears |
| Low | The fire's caption route trusts the speaker's `mode` attribute, which a participant can set (`canUpdateOwnMetadata`) | Only members of the farm; worst case a listener asks for captions (Workers AI). Fix later by reading `permission.canPublish` from LiveKit's participant list |
| Low | Sign-in codes: 5 an hour per address (~120 a day), waitlist letters every 10 minutes | Add a daily cap per address if mail abuse appears |
| Low | `POST /v1/desktop-link/:code/session`, waitlist pick and confirm have no limiter | Codes and tokens are 192–256-bit; body limit now applies |
| Low | The unhandled-error log records the whole error object | Errors carry no request content; reduce to name and message if a log ever shows personal data |
| Low | Other members' forwarded copies of a deleted person's photos stay (the copy is the forwarder's) | Document in the privacy policy, or delete copies whose source the person uploaded |
| Low | Other people's chat lists keep a deleted person's last preview and visit name until the next event | Clear them when a cottage hears `left {account_deleted}` |
| Low | A recap job running between the AI step and the farm step of a purge could write a new recap source | Skip people with `deleted_at` in the AI consumer |
| Low | `chip_in_payments.person_id` stays after a purge | Kept as the shop's financial record; say so in the privacy policy |
| Low (mobile) | Some Keychain items use the default accessibility (`WHEN_UNLOCKED`) while the session uses `AFTER_FIRST_UNLOCK` | Harmless now; share one option if a background wake ever reads them |
| Low (mobile) | `chat-seen.json` (farm ids and seqs) and `planted-seeds.json` (filtered by person) are not cleared at sign-out | Neither holds content; clear them with the media queue later |
| Low (mobile) | The dev labs' copy catalogues ship in the release bundle (their code doesn't) | Load them only in development builds |
| Info | The Keychain session and database key travel with encrypted backups and survive uninstall | Deliberate: a restored phone stays signed in |
| Info | No certificate pinning, no WebViews; external links open in Safari View Controller; message links are `http(s)` only | Fine |

### 2.3 Founder

| Item | What to do |
|---|---|
| App Review account | Set `REVIEW_ACCOUNT` in prd (and dev), run the seed, put the address and code in the review notes (§10) |
| Sign in with Apple revocation | Create (or extend) a key with Sign in with Apple enabled for `com.kithfield.app`; set `APPLE_SIGN_IN_KEY_P8` and `APPLE_SIGN_IN_KEY_ID` in each environment. Until then Apple tokens can't be revoked, which App Review checks |
| Unused permissions | The location and photo-library-read permissions are declared, and their ask screens exist, but nothing opens those screens and nothing reads a location or the library. Nothing is ever requested, so this is not a rejection today; remove the two Info.plist strings (`locationWhenInUsePermission: false`, `photosPermission: false`) or ship the features before declaring them |
| Privacy labels and manifest | Enter §6 in App Store Connect; the app's `PrivacyInfo.xcprivacy` (`app.config.ts`) says the same. If Sentry or any crash reporting is added, add Crash Data and Performance Data to both |
| Media signing key | Confirm `MEDIA_SIGNING_KEY` differs between dev and prd, or a dev read URL is valid on prd |
| Photo scanning | Confirm Cloudflare's CSAM Scanning Tool is turned on for the media host's zone; the review notes say photos are scanned |
| RevenueCat key | `REVENUECAT_IOS_KEY` must be set for the store build (it isn't in `eas.json`) |
| Content and EULA (Guideline 1.2) | The Terms don't yet say "no tolerance for objectionable content or abusive users"; add it to the house rules or link Apple's Standard EULA. The report reasons now include sexual content, child safety, violence and self-harm, and the Terms forbid child sexual abuse and exploitation, linking the child safety standards (kithfield.com/child-safety); the fire room and gate gestures can't be reported as items; text and names aren't filtered (photos are hash-scanned) |
| Broken links | kithfield.com/costs and /acknowledgements have no page yet |
| Restore purchases | Shown on the patron screens, not on the cart or Sticker packs; acceptable, mention if asked |
| Device check | §11.2 on the oldest supported iPhone |

## 3. API security review

### 3.1 Authentication and authorization

Every non-public route goes through `requireSession` (Better Auth bearer or cookie), the device
action key (`sessionOrActionKey`, a few kinds of farm write and media upload only), or Cloudflare
Access for the safety desk. Public by design: health, costs, the sign-in nonce, the desktop QR ask,
the website's deletion request and confirm (emailed code), waitlist routes (unguessable tokens),
the invite preview, keepsakes download links (HMAC, 15 minutes), and the webhooks.

- **Webhooks:** RevenueCat compares the whole `Authorization` header in constant time and answers
  503 when the secret is unset (never accepts). Stripe checks the HMAC over the raw body with a
  300-second tolerance, in constant time. LiveKit checks an HS256 JWT whose `iss` is the API key,
  with an expiry and a `sha256` claim matching the body; events are deduplicated.
- **Safety desk:** RS256 Access JWT against the team's keys, `iss`, `aud`, `exp`, `nbf`, plus the
  `MODERATORS` allow-list and senior/second-reviewer rules.
- **Farm membership:** every farm, media, fire, sticker, shop and rhythm route checks membership in
  D1 (`member()`), and the farm object checks it again from its own state for history, search,
  scrapbook, recap and every command. Commands act as the socket's person; payloads carry no actor.
  Keeper-only kinds are enforced by the shared rules. Removed members' sockets close on publish.
- **Sockets:** the token comes in the first frame, never the URL: a 5-minute HMAC token (HKDF key)
  scoped to one farm or cottage and tied to a live session; a banned or deleted person can't get
  one. Upgrades are now limited per address.
- **Sessions:** 365-day sliding lifetime, no cookie cache, so deleting a session row stops HTTP at
  once; bans and deletion delete session rows and now action keys.
- **IDOR:** ids in paths are always checked against the caller (membership, ownership or both).
  The one gap found (trade op ids) is fixed. `PUT /v1/devices/:id` lets a device id or push token
  be re-registered by another person (displacing it); this needs the victim's ids, which no route
  exposes.

### 3.2 Rate limits

| Endpoint | Limiter | Key | Limit |
|---|---|---|---|
| Anonymous sign-in | Better Auth (D1-backed, works across isolates) | IP, IPv6 /64 | 10/min |
| Apple / Google sign-in | Better Auth + single-use nonce + token replay check | IP /64 | 10/min |
| Email code send | Better Auth + per-address count | IP /64; address | 3/min; 5/hour |
| Email code sign-in | Better Auth + 5 tries per code + 10 wrong a day per address | IP /64; address | 10/min |
| Sign-in nonce | `SIGN_IN_NONCE_LIMIT` | IP /64 | 20/min |
| Desktop link ask; look-up and answer | `DESKTOP_LINK_LIMIT` | IP /64; person | 10/min |
| Website deletion request and confirm | `DELETION_REQUEST_LIMIT` | IP /64 | 5/min |
| Waitlist | `WAITLIST_LIMIT` | IP /64 | 5/min |
| Invite preview and join | none (12-character base62 codes, ~71 bits) | | |
| Media upload URLs and copies | `MEDIA_LIMIT` | person | 60/min |
| AI captions (voice notes) | `AI_LIMIT`, `AI_FARM_LIMIT` | person; farm | 30/min; 120/min |
| Fire captions | `FIRE_LIMIT` | person | 12/min |
| Reports and appeals | `REPORT_LIMIT` | person | 10/min each |
| Gate gestures; gate list | `GATE_LIMIT`; `GATES_LIMIT` | person | 10/min; 30/min |
| Shop writes | `SHOP_LIMIT` | person | 10/min |
| Farm and cottage sockets | `SOCKET_LIMIT` (new) | IP /64 | 600/min |
| Farm commands (socket and HTTP) | none (§2.2) | | |

RateLimit bindings count per Cloudflare location and are eventually consistent, so a spread-out
caller gets a few times each limit.

### 3.3 Inputs, URLs, logs, cookies, SQL

- **Sizes:** bodies over 256 KB are refused with 413 before any route reads them. Contracts cap
  every field (messages 4,000 characters, URLs 2,048, arrays 10–200). Uploads: presigned PUTs sign
  `content-length`, `content-type` and `if-none-match: *` for one hour; multipart parts sign their
  length for 24 hours and `/complete` checks the total.
- **Signed media reads:** HMAC over `read`, the key and the expiry; keys must match
  `farm/<id>/<uuid>`; 30–60 minutes; signed only for members on finished, unquarantined objects,
  checked again on every request, cache hits included. Files that aren't media download as
  attachments with `nosniff` and a sandbox CSP.
- **Logs:** no console call logs a body, header, token, code or message text. Better Auth's values
  are now dropped. The AI, weather, farm and cottage logs reduce errors to a message.
- **CORS and cookies:** no CORS headers anywhere (browsers get no cross-origin reads). Better Auth's
  cookie is `__Secure-`, `Secure`, `HttpOnly`, `SameSite=Lax`, host-only; the app uses bearer
  tokens, and `trustedOrigins` is only the app's scheme. The safety desk refuses cross-site writes.
- **Open redirects:** none. Better Auth's redirect flow and password links answer 404; the waitlist
  and the safety desk redirect only to fixed paths.
- **SQL:** every statement uses bound parameters. Interpolated pieces are constants, generated `?`
  lists, or column names from rows another of our objects exported.

### 3.4 Account deletion

`POST /v1/me/delete` (or the website's emailed code) marks the person, deletes sessions, action
keys and codes, forgets every device's push and Live Activity tokens, closes cottage and farm
sockets, takes them out of the fire room in LiveKit, and emails the 30-day letter. Signing in within
30 days cancels it. The daily cron then queues the purge; the deletion queue retries with back-off
and a failing purge is queued again the next day.

The purge, every step safe to repeat, D1 rows last:

- **Farms:** each farm the person lived on, left or visited writes `left {account_deleted}` and
  tombstones everything they wrote, their trades and (now) what safety held back, deleting their
  media. A farm left with no members goes entirely (new): its object storage, media, AI words and
  D1 rows.
- **D1:** people (cascading accounts, sessions, consents and the shop's person rows), memberships,
  visits, waiting requests, merges, blocks they made, desktop links, push ledger, deletion codes,
  pending email codes and their counts; invites they made stay, made by nobody.
- **R2:** their uploads, keepsakes bundles, AI captions and letters their words went into.
- **Cottage:** emptied (`deleteAll`) with a marker so late deliveries are refused.
- **Elsewhere:** RevenueCat customer deleted (new, when the key is set); Apple tokens revoked (new,
  when the Sign in with Apple key is set); LiveKit keeps nothing (no recording or egress).
- **Kept on purpose:** bans (a ban outlives the person), moderation actions under a pseudonymous id,
  the audit log for two years, escalated reports' context, quarantined media evidence, payments.
  Their retention periods must be stated in the privacy policy (§8).

## 4. Mobile privacy and security

### 4.1 Where things are stored

| Storage | What | Protection |
|---|---|---|
| Keychain: `kithfield.database-key` | SQLCipher key, 32 random bytes | `AFTER_FIRST_UNLOCK` |
| Keychain: `kithfield.bearer`, `kithfield.person` | Session token; person id | `AFTER_FIRST_UNLOCK` |
| Keychain: device, push, unsent-notice, onboarding, prefs, hints, pending gifts | Device id, push token, counts, name and critter draft, gift drafts (a gift note) | `AFTER_FIRST_UNLOCK` or default |
| SQLCipher database | Each farm's events (message text included), outbox, replicas | Encrypted; the app refuses a plaintext database; WAL encrypted |
| Documents | Media upload queue (files and captions), chat-seen marks, planted seeds | iOS data protection |
| App Group | Widget data (farm names, friends' names and critters, next plan), share drafts, stickers | iOS data protection; cleared at sign-out; no tokens or message text |
| MMKV, AsyncStorage, UserDefaults | Nothing | |

### 4.2 Bundle, transport, debug, logs, clipboard

- **Secrets in the bundle:** none. A production export was searched for Stripe, Google, AWS and
  private-key patterns, JWTs, RevenueCat secret keys and dev hosts: no hits. `extra` holds only
  public values (API origin, App Group, Google iOS client ids, the RevenueCat public key, the EAS
  project id).
- **ATS:** no arbitrary loads or exception domains; release builds now drop local networking.
- **Debug screens:** the network switch and every lab are required only under `__DEV__` and are
  absent from the release bundle; their routes redirect to the farm.
- **Logs:** everything is behind `__DEV__` except one warning with an error code.
- **Clipboard:** read only on tap of Paste (iOS asks); invite links and copied messages are written
  on request; the WhatsApp sticker pasteboard is local and expires.

### 4.3 Permissions

| Permission | English | Vietnamese | Used |
|---|---|---|---|
| Camera | Kithfield uses the camera only when you take a photo to share, scan a code to sign in on another device, or light your lantern by the fire. | Kithfield chỉ dùng máy ảnh khi bạn chụp ảnh để chia sẻ, quét mã để đăng nhập trên thiết bị khác, hoặc thắp đèn lồng bên lửa. | Photos, QR sign-in, the lantern |
| Microphone | Your mic is only used while you record a voice note or sit by the fire, and you always arrive muted. | Micro chỉ được dùng khi bạn ghi tin nhắn thoại hoặc ngồi bên lửa, và bạn luôn vào với micro đang tắt. | Voice notes, the fire |
| Photo library (read) | So your recent photos show in the tray when you share one. Only the photos you choose are ever sent. | Để ảnh gần đây hiện trong khay khi bạn chia sẻ. Chỉ những ảnh bạn chọn mới được gửi đi. | Never requested (§2.3); picking uses the system picker |
| Photo library (add) | So you can save photos and videos from your farms to your library. | Để bạn lưu ảnh và video từ các nông trại vào thư viện ảnh. | Saving from the viewer, sticker export |
| Face ID | You'll confirm with Face ID before deleting your account or letting a new device in. | Bạn sẽ xác nhận bằng Face ID trước khi xoá tài khoản hoặc cho một thiết bị mới vào. | Deleting the account, desktop sign-in |
| Contacts | So you can pick friends from your contacts to invite by text. Your contacts stay on this phone, and your address book is never uploaded. | Để bạn chọn bạn bè trong danh bạ và mời họ qua tin nhắn. Danh bạ chỉ ở trên điện thoại này, và danh bạ của bạn không bao giờ được tải lên. | Inviting friends by text |
| Location (in use) | On a hangout day, to show the path from where you are. Nothing is shared with the farm, ever. | Vào ngày hẹn, để chỉ đường từ chỗ bạn đang ở. Không có gì được chia sẻ với nông trại, không bao giờ. | Never requested (§2.3) |
| Calendar (write only) | So you can add a plan to your calendar. Kithfield only writes the event and never reads your calendar. | Để bạn thêm kế hoạch vào lịch. Kithfield chỉ ghi sự kiện và không bao giờ đọc lịch của bạn. | Adding a plan |
| Notifications | (system) | (system) | Pushes |

Background modes are exactly `audio` (the fire) and `remote-notification` (widget refreshes).

### 4.4 Privacy manifests

- **App** (`ios.privacyManifests` in `app.config.ts`): no tracking; required-reason APIs UserDefaults
  `CA92.1`, file timestamps `C617.1`, system boot time `35F9.1`, disk space `E174.1`; collected
  data as in §6. Expo merges the libraries' own manifests at prebuild.
- **Share extension** (`targets/share/PrivacyInfo.xcprivacy`): file timestamps `C617.1` (the size
  of a file it copied into the App Group).
- **Widgets, notifications, stickers:** call no required-reason API (no `UserDefaults`, no file
  attributes), so they need no manifest.
- Check after the next prebuild: Xcode's "Generate Privacy Report" on the archive.

## 5. Encryption export compliance

`usesNonExemptEncryption: false`. The app uses HTTPS and SQLCipher (AES via the system's crypto) to
protect the person's own data at rest, which falls under the exemption for encryption limited to
authentication and data protection. Counsel to confirm (§8).

## 6. App Store privacy labels

No data is used to track. No third-party advertising or analytics SDK, no IDFA, no crash reporting.
Every collected type is **linked to the user** and used only for **App Functionality**.

| Apple data type | Collected | Linked | Tracking | Purposes | From |
|---|---|---|---|---|---|
| Contact Info: Name | Yes | Yes | No | App Functionality | The display name; Google's name at sign-in (Apple sends none) |
| Contact Info: Email Address | Yes | Yes | No | App Functionality | Email code, Apple (possibly a relay address) or Google sign-in |
| Contact Info: Phone, Physical Address, Other | No | | | | Phone sign-in isn't built; the printed book isn't on sale |
| Health & Fitness, Financial Info, Sensitive Info | No | | | | Payments go through Apple; no card data |
| Location: Precise | No | | | | Nothing reads the device's location |
| Location: Coarse | Yes | Yes | No | App Functionality | The farm's town (typed by the keeper, for weather and sunset) and the city Cloudflare derives from the IP for the devices list |
| Contacts | No | | | | Read on the phone to send invites by text; nothing leaves it |
| User Content: Emails or Text Messages | Yes | Yes | No | App Functionality | Farm chat (not end-to-end encrypted) |
| User Content: Photos or Videos | Yes | Yes | No | App Functionality | Shared photos and video (location metadata stripped on the phone) |
| User Content: Audio Data | Yes | Yes | No | App Functionality | Voice notes; captions only with the speaker's consent. The fire room is live audio, never recorded |
| User Content: Gameplay Content | Yes | Yes | No | App Functionality | The farm: plants, critters, gestures, plans, gifts, scrapbook |
| User Content: Customer Support | No | | | | Support is by email |
| User Content: Other User Content | Yes | Yes | No | App Functionality | Status, plans, reports and appeals, farm names, recap letters |
| Browsing History, Search History | No | | | | Link previews are fetched on the phone; farm search isn't kept |
| Identifiers: User ID | Yes | Yes | No | App Functionality | The person id (also RevenueCat's app user id and the LiveKit identity) |
| Identifiers: Device ID | Yes | Yes | No | App Functionality | A per-install id, the push token and the device's name for the devices list (not IDFA or IDFV) |
| Purchases: Purchase History | Yes | Yes | No | App Functionality | Items, gifts, chip-ins and patronage, via RevenueCat |
| Usage Data: Product Interaction | Yes | Yes | No | App Functionality | Whether a push was opened, to rest pushes; not analytics |
| Usage Data: Advertising Data, Other Usage Data | No | | | | |
| Diagnostics: Crash Data, Performance Data | No | | | | Add both if crash reporting is added |
| Diagnostics: Other Diagnostic Data | Yes | Yes | No | App Functionality | App version and user agent with each session, push receipts |
| Other Data | Yes | Yes | No | App Functionality | Birthday (month and day, optional, shown to friends); the age check keeps only that it passed |

Processors to name in the privacy policy: Cloudflare (hosting, storage, email, Workers AI for
captions, recap and translation, which keeps nothing), Apple (APNs, WeatherKit, Sign in with Apple),
Google (sign-in), Expo (push delivery), RevenueCat (purchases), LiveKit Cloud (live audio, not
recorded).

## 7. App Review notes

Paste into App Store Connect → App Review Information → Notes, with the review address and code
from the `REVIEW_ACCOUNT` secret in the sign-in fields:

> **Signing in.** On the first screen tap "Start a farm", then "Continue with email". Enter
> `<review address>` and tap "Send me a code". No email is sent for this address: type the code
> `<review code>`. You arrive on "The Orchard Gate", a farm shared with a second test member,
> Juniper, with a few messages, a plan ("Picnic by the pond") and their critters. Please sign in at
> most five times an hour with this address; more are refused like any other address.
>
> **What Kithfield is.** A small shared farm for close friends: messages, photos and voice notes
> help the farm grow. Nothing dies, there are no streaks and care is always free.
>
> **In-app purchases** (all through Apple, managed by RevenueCat). From the You tab: "Rocco's cart"
> (cosmetic items, non-consumable) and "Patrons" → "Choose how to help" (auto-renewing
> subscriptions, with renewal terms, Terms of Use, Privacy Policy and Restore purchases on screen;
> "Your patronage" links to cancelling in the App Store). From a friend's critter card: "Gift"
> (consumable gifts) and "Chip in together" (friends each pledge a share of a birthday gift;
> nobody is charged until the shares cover it, then each pays their own share as a consumable; the
> app never refunds, and a share paid after a chip-in closes becomes the payer's credit). From the
> sticker picker: "Shop" (sticker packs). The printed scrapbook is a physical good paid outside the
> App Store, and isn't on sale yet.
>
> **Live voice.** "The fire" is a voice room for the farm's members only, powered by LiveKit. Tap
> the fire ring on the farm: "Light it and sit down", or "Join in" / "Just listen" when it's lit.
> Everyone arrives muted; it never rings anyone; nothing is recorded. Live captions are an optional
> patron feature and need the speaker's consent.
>
> **User-generated content (Guideline 1.2).** Long-press any message, photo, video, voice note,
> sticker or link → "Report" (reasons, an option to also block, "Send report"). On a critter card →
> "More" → "Report <name>" or "Block <name>"; Settings → "Blocked" to unblock. Keepers can remove a
> member (Farm settings → "Critters"). Reports reach our safety team's desk, answered within a day
> (an hour for urgent ones); the person who reported hears back in "Notes from the safety team",
> and the reported person can appeal. Photos are hash-scanned for known abuse imagery. Joining
> requires accepting the house rules and is for people 13 and over.
>
> **Deleting an account (Guideline 5.1.1(v)).** You tab → "···" (Settings) → "Delete account" →
> "Delete everything", confirmed with Face ID or the passcode. The account is deleted after 30 days
> (signing in again before then cancels it); a confirmation email is sent, and Sign in with Apple
> tokens are revoked when it is deleted. It can also be deleted at kithfield.com/delete-account.

### The deletion path in the app

1. You tab → the "···" button at the top right (VoiceOver: "Settings").
2. Account → "Delete account".
3. "Pack up and leave every farm?", listing what goes, with "Download my keepsakes first".
4. "Delete everything" → Face ID or the passcode ("Confirm to delete your account").
5. "<name> has packed up" → "Close". The server sends `POST /v1/me/delete`.

## 8. Legal checklist

| Item | State | Who |
|---|---|---|
| APNs over HTTP/2 from Workers | Verified 19 Oct 2026: direct HTTP/2 works, no relay needed | Done |
| Licensing (app under MPL, MIT or Apache, or a CLA; server AGPL; art non-free) | Not chosen; the repo is `UNLICENSED` | Founder with counsel |
| Vietnam Decree 147 (phone verification for social platforms) | Not built: phone sign-in is deferred; whether Kithfield is in scope (private groups up to 24) is open | Counsel |
| UK Online Safety Act | Reporting, blocking, a 24-hour desk, appeals and hash-scanning exist; a risk assessment, terms naming prohibited content, and a named contact are not written | Counsel and founder |
| Age assurance | Self-declared year of birth with a 13+ gate, the year not kept; whether that is enough (UK, US state laws, Australia) is open | Counsel |
| Workers AI data terms | Checked 19 Oct 2026: inputs and outputs kept only while a request runs, never used for training; the consent copy says so | Done |
| Apple IAP refunds and chip-ins | No app-made refunds; pledges stay promises until covered; App Review note written (§7) | Founder, at review |
| Export compliance (`usesNonExemptEncryption: false` with SQLCipher) | Believed exempt (data protection) | Counsel to confirm |
| Retention periods for bans, moderation records, escalated report context, quarantined evidence, payments | Kept on purpose without stated periods | Counsel and founder, in the privacy policy |
| Privacy policy and terms | Must match §6 and the processors; must add "no tolerance for objectionable content" | Founder |
| Sign in with Apple revocation | Built; needs the key (§2.3) | Founder |

## 9. Durable Object load test

`apps/api/scripts/load-farm.ts` (`pnpm --filter @kithfield/api load:farm -- --api
http://localhost:<port> --phones N [--burst 10] [--typing off] [--pid <workerd pid>]`) drives a
local `wrangler dev` only. N phones sign in (each its own address), pass the age check, and join one
farm by its invite (a farm holds 24 members, so phones past 24 are members' second devices). Every
phone opens the farm socket, says hello, catches up and turns presence on; then all of them at once
send 10 writes each (messages, dewdrops and waves, cycling) with typing on and off around each. It
reports send-to-ack latency, send-to-arrival on every other phone, rejections, errors, missed
deliveries and the local `workerd` process's memory (an upper bound: every object runs in it).

Local `wrangler dev` on an M-series Mac, one farm object, 10 writes per phone at once:

| Phones (members) | Writes | Before: ack p50 / p95 | After: ack p50 / p95 | After: fan-out p95 | Errors, missed | Typing off: p50 / p95 |
|---|---|---|---|---|---|---|
| 6 (6) | 60 | 95 / 112 ms | 88 / 100 ms | 100 ms | 0, 0 | 51 / 63 ms |
| 24 (24) | 240 | 374 / 653 ms | 220 / 297 ms | 297 ms | 0, 0 | 146 / 205 ms |
| 50 (24) | 500 | 872 / 1,887 ms | 442 / 740 ms | 739 ms | 0, 0 | 377 / 617 ms |

- Throughput after the fix: 560–760 writes a second through one object; connecting 50 sockets took
  0.3 s. `workerd` grew by 10–30 MB per run with the sockets open.
- **Hot spot found and fixed:** typing. Each write's typing on and off changed the set of people
  writing twice, and each change was broadcast to every socket at once, tripling the frames per
  write (p95 at 50 phones: 1.9 s with typing, 0.6 s without). Typing is now told at most every
  250 ms, only when the set differs from what phones last heard; on and off within the window cancel
  out. Broadcasts are also serialised once rather than once per socket, and a typing or presence
  frame that changes nothing costs nothing.
- The remaining cost is linear in writes × sockets (each event goes to every socket), which is the
  protocol's design; no snapshot is rebuilt per write. The burst is far beyond a real farm's rate.
- Not measured: the deployed runtime (Cloudflare's isolates are faster than local `workerd`, and
  memory per object isn't visible locally), and the cottage objects' delivery queue under load.

## 10. App Review demo account

### 10.1 How it works

`REVIEW_ACCOUNT` is a Worker secret holding JSON: `{"email": "...", "code": "6 digits", "companion":
"..."}`. For exactly those addresses (the companion is optional) the email-code sign-in issues that
code instead of a random one and never sends mail. Everything else is unchanged: the code must be
asked for first, lasts 10 minutes, allows 5 tries, and the per-address send limit (5 an hour), the
wrong-code lock (10 a day) and Better Auth's per-address limits apply. Unset or unreadable, the
feature is off (`apps/api/src/auth/review-account.ts`, tested in `review-account.test.ts`).

Use addresses nobody can guess (for example `review-7f3k2@kithfield.com`): someone who knew the
address could ask for codes and lock it with wrong guesses for a day.

### 10.2 Setting it up (founder)

1. Choose the two addresses and a 6-digit code.
2. Set the secret, per environment:
   `pnpm --filter @kithfield/api exec wrangler secret put REVIEW_ACCOUNT --env prd` and paste
   `{"email":"<review>","code":"<code>","companion":"<friend>"}` (and `--env dev` for TestFlight
   builds that use the dev API).
3. Seed the farm once the Worker is deployed:
   `REVIEW_ACCOUNT='<the same JSON>' pnpm --filter @kithfield/api seed:review -- --api https://kithfield.com`
   It prints the farm it planted, or that the account already has one (running it again adds
   nothing).
4. For Apple token revocation, set `APPLE_SIGN_IN_KEY_P8` (the `.p8` contents) and
   `APPLE_SIGN_IN_KEY_ID` with `wrangler secret put` in each environment.

### 10.3 Why a script against the API

The seed (`apps/api/scripts/review-seed.ts`, the command in `seed-review.ts`) talks to the API as
two phones do: it signs both review addresses in with their code, passes the age check and the
Terms, sets their names and critters, plants the farm, joins the companion by the invite, and sends
messages, a wave, a dewdrop, a plan and an answer to it through the farm's command route. So
everything is written by the real commands and events, no admin route had to be added (no new
attack surface), and it works the same against `wrangler dev` and a deployment. It sends plain
requests, as the phone does: Node's own `fetch` adds browser headers that Better Auth rightly
refuses. Tested end to end in `apps/api/test/review-seed.test.ts`.

## 11. Device performance

### 11.1 On the simulator

The busiest farm: 24 members' critters, night (dark appearance), the fire lit, on an iPhone 16
simulator (iOS 27.0) running the shared development client (debug JS, Metro):

| Measure | Idle on the farm | Scrolling the farm sheet |
|---|---|---|
| UI thread | 60 fps | 60 fps |
| JS thread | 0 fps (idle: every animation runs on the UI thread) | 60 fps |
| Memory (performance monitor) | 920–970 MB | 1,015 MB |
| Process resident size (host) | 1.28–1.40 GB, steady over a minute | |

A debug simulator build carries Metro's bundle with source maps, Hermes' debugger and the
simulator's frameworks, so its memory says little about a release build on a phone.

### 11.2 Still to measure on the oldest supported iPhone (iOS 17; the founder's phone check)

- Release build, the same busiest farm: UI and JS frame rates while idle, while the fire burns, while
  scrolling the sheet and while opening a chat; Xcode's memory gauge and Instruments' Allocations
  (the art cache's budget, peak and steady state).
- Cold launch to the first farm frame, and the splash hand-off.
- The fire room with 6–8 voices and a lantern: CPU, thermal state and battery over 10 minutes.
- Memory warnings: background the app with the farm open, open the camera, come back.
- Widgets and the Live Activity under their memory limits.
