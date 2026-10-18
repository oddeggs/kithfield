# Kithfield: the farm model

Decided 18 Oct 2026. Builds on `design/15 Farm and Field Guide.dc.html` (15-08, "Farm rules") and `docs/tech-decisions.md` §3–4. Where this file and the design differ, this file wins; the differences are listed in §8. The schemas in `packages/contracts` say the same thing in code.

## 1. Principles

- The farm is derived from what friends did. Nothing on the farm is set directly.
- One pure reducer in `@kithfield/farm` runs on the server, in the app and in the widgets. The server's result is the truth; phones apply their own tends at once and reconcile.
- Time-based states (sleepy, misty) are computed from timestamps and "now", never stored or scheduled.
- Randomness is a seeded hash of recorded facts, so every device gets the same answer.
- Stages only go up within a season. Nothing ever dies, wilts to brown or loses progress.

## 2. Event log (Farm Durable Object, SQLite)

`events(seq INTEGER PRIMARY KEY, op_id TEXT UNIQUE, at INTEGER, day TEXT, actor TEXT, kind TEXT, payload TEXT, rules_version INTEGER)`

- `seq` is assigned by the farm object and starts at 1. Seq 1 is always `farm_created`.
- `op_id` is the writer's UUIDv7, so a retried write applies once. The farm mints one for the events it writes.
- `at` is server time, in epoch milliseconds.
- `day` is the farm's local day the event happened on (`YYYY-MM-DD`), set by the farm at commit from the farm's time zone. Caps, roses and every other day rule read `day`, never a device's time-zone data, so "days" are the same for everyone. Every event carries it from rules version 2 (`DAY_FROM_RULES_VERSION` in the contracts); events applied under rules version 1 exist only in development data and may lack it.
- `actor` is a person. It is null only for the farm's own kinds, and for what the farm or the safety team writes: `unsend` and `removed` by safety, `settings_changed` for `frozen` and `paused`, the keeper handover (`settings_changed {role: keeper}` written by the farm), a farm theme switching on once friends' chip-in covers it (`settings_changed {theme}`), and `fire` going out.
- On the wire the columns are camelCase (`opId`, `rulesVersion`).
- Kinds:

| Group | Kinds |
|---|---|
| Chat | `message`, `edit`, `unsend`, `reaction`, `sticker`, `media`, `voice`, `link`, `pin` |
| Gestures | `dewdrop`, `firefly`, `wave`, `knock`, `hug`, `quiet_note`, `slow_post`, `card_signed`, `gate` |
| Plans | `seed_planted`, `seed_changed`, `vote`, `rsvp`, `checkin` |
| Keepsakes | `gift`, `scrapbook_page`, `traded` |
| Presence | `farm_opened` (at most one per person per hour), `hibernate`, `status`, `fire` |
| Membership | `joined`, `left`, `removed`, `critter_changed`, `settings_changed` |
| Written by the farm | `farm_created` (seq 1), `weather` (daily), `shared_rain`, `season_rolled`, `harvested`, `rules_changed`, `restored` |

- `farm_created`: the farm's identity. It sets `farm` (its own id), `kind` (farm or visit), `name` (none for a visit), `land`, `timeZone` and `hemisphere`.
- `pin`: a message pinned to the cork board, or taken down. Up to 10; the oldest drops off.
- `status`: what a critter shows above its cottage: a status bubble, a rain cloud, or the social battery.
- `seed_changed`: a plan changed after planting: a day, a place, the organiser's hat, the day it settles.
- **A plan's day** is its only day option, or, once a settling day (`settleOn`) is set, the option the most people lean on (the earliest of a tie; the first option if nobody leaned). The day counts toward sprouting only once the farm's day reaches `settleOn`; the first event on or after that day sprouts every plan that is otherwise ready. Once a plan has sprouted its day is fixed: votes, `days` and `settleOn` no longer change it (`checkCommand` refuses them as `invalid`, and the reducer ignores them). A `checkin` counts only on a sprouted plan's own day, by the event's `day`; any other check-in is refused and grows nothing. These are the rules from version 3 (`PLAN_DAY_RULES_VERSION`); events written under version 2 keep the older reading, where a settling day counted as soon as it was set and a check-in counted on any day.
- `fire`: the fire room `lit`, `sat` by each person once a session, and `out`, written by the farm 3 minutes after the last person leaves.
- `traded`: a swap made while visiting another farm, written on both farms, each with its own trader as actor.
- `restored`: an appeal undid a removal, and the target's payload is back.
- `gate`: a visitor from another farm waved, or left a firefly or a gift at the gate. Visitors never read the chat.
- `card_signed`: a member's birthday card, signed on their birthday.

The farm writes some kinds on a person's behalf, with that person as actor and an op id it mints: `joined`, `farm_opened`, `hibernate`, `gate` and `traded`, which phones never send, and `critter_changed`, `status`, `seed_changed` and `gift`, which phones send too. A `gift {given}` friends chipped in for is written by the farm once it is covered, on behalf of whoever started the chip-in, naming the chip-in and everyone else in it (`with`), never amounts. After a safety removal of a `critter_changed`, a `status` or a `seed_changed`, the farm writes a follow-up of the same kind on the person's behalf that restores the previous values: their critter, name and birthday, their status, or the plan's title, days and place (a `seed_changed` follow-up is for the planter's plan, with the editor of the removed edit as actor). Phones never send the farm's own kinds (`ON_BEHALF_KINDS` and `FARM_WRITTEN_KINDS` in the contracts).

`hibernate` is written on every farm the person lives on, and only when it changes. Someone who joins a farm while hibernating gets `hibernate {on: true}` right after their `joined`.

**Keepers.** A farm always has a keeper. When the last keeper leaves or is removed, the farm writes `settings_changed {setting: role, person, role: keeper}` with a null actor right after the `left` or `removed`, making the longest-standing remaining member (earliest `joined`) the keeper.

A pause comes from the safety team as `settings_changed {paused, person, until}`. The person can read but not post, and their critter naps until `until`. The snapshot holds it as `pausedUntil`.

Edits and unsends never take dew back: care that was given stays given.

**Tombstones.** An unsend, a moderation removal or the author's account deletion replaces an event's payload with a tombstone. The event keeps its seq, kind, actor and time. The tombstone keeps only the facts the reducer reads (`TOMBSTONE_KEEPS`: targets, recipients, plan answers and the like), never content. So a phone catching up past a tombstone grows the farm the same. A tombstoned `joined` keeps the critter and how they came (`via`) and adds a nameless member; a tombstoned `critter_changed` keeps the critter but not the birthday; a tombstoned `status` keeps which status it was (and the cloud or battery value, never the words), so the bubble it set clears. `settings_changed` is the farm's own and is never tombstoned. When an appeal undoes a removal the farm writes `restored`; phones page the target back in, and the reducer applies it then.

## 3. Care families

Every tending kind belongs to one of six families. Each family grows its own plant each season, so 6 families × 4 seasons = 24 plants, and every kind of care grows something all year.

| Family | Counts | Dew |
|---|---|---|
| Dew | `dewdrop` | 1 |
| Words | `message`, `link`, `quiet_note` (2), `slow_post` (2) | 1 unless noted |
| Pictures | `media`, `sticker` | 2 for media, 1 for a sticker |
| Voices | `voice`, time by the fire (`fire {sat}`, one per person per session) | 2 |
| Gestures | `firefly` (2), `wave`, `knock`, `hug`, `gift` (2) | 1 unless noted |
| Gatherings | `seed_planted`, `vote`, `rsvp`, `scrapbook_page`; a `checkin` with 2+ people at a hangout | 1; a hangout gives 3 to everyone there |

Only these kinds grow family plants. Two kinds of care grow nothing on purpose:
- **Reactions.** The dewdrop in the reaction row is a `dewdrop` event, and that is the tend.
- **Remember-me seeds** (06-05). They are personal: the person's cottage keeps them (`/v1/remember`), never the farm log, and the friend they are about never sees them.

Outside the families:
- **Rose**: blooms on each member's birthday, watered by anyone that day (07-01).
- **Signature crop**: grows from all care combined, one per farm (15-06).
- **Rare variants** (rain-kissed, frost-lace, sun-gold) are a property of a blooming plant, not separate plants.

The plant for each family and season is data in `packages/farm/src/catalog.ts` (plant id, family, season, art name). Names as finalised in design (15-08 §7), art ids in brackets:

| Family | Spring | Summer | Autumn | Winter |
|---|---|---|---|---|
| Dew | clover (`clover`) | chamomile (`chamomile`) | marigold (`marigold`) | snowdrop (`snowdrop`) |
| Words | tulip (`tulip`) | cornflower (`cornflower`) | aster (`aster`) | winter jasmine (`jasmine`) |
| Pictures | daffodil (`daffodil`) | sunflower (`sunflower`) | chrysanthemum (`chrysanthemum`) | camellia (`camellia`) |
| Voices | sweet pea (`sweetpea`) | lavender (`lavender`) | heather (`heather`) | holly (`holly`) |
| Gestures | bluebell (`bluebell`) | poppy (`poppy`) | apple (`apple`) | moonflower (`moonflower`) |
| Gatherings | cherry blossom (`blossom`) | strawberry (`strawberry`) | pumpkin (`pumpkin`) | Christmas rose (`hellebore`) |

## 4. Growth

- Dew is counted per plant per season. `contributions(season, plant, person, day, dew)` holds what each person gave.
- **Cap**: each person adds at most **3 dew per plant per day** (the farm's local day). Tends beyond the cap still count as tending for sleepiness and credits; they just add no dew.
- **Scaling**: `k = max(1, √(active / 3))`, where `active` is the number of people credited this season: everyone who tended at least once, including people who have since left. Thresholds: sprout `3k`, bud `8k`, bloom `15k`, rounded up. Stage is `max(stored stage, stage from dew)`, so a new member raising `k` never lowers a plant.
- **Harvest**: on harvest day (the last Sunday of the season, farm time) every plant that reached bloom is harvested into the season's basket. Plants that didn't bloom simply rest; nothing is lost from the field guide.
- **Field guide**: a page is found the first time the farm brings that plant to bloom; a rare variant gets its own page. Trades on visits fill pages on both farms (15-06).
- **Credits** name kinds of care and people, never totals (04-01, 15-02).
- **Restoration project** (07-04): from rules version 4 (`RESTORATION_RULES_VERSION`) a farm always has one long project under way, the first in the catalogue's list (the old greenhouse) when the farm moves to rules 4 or is created under them, then the next. Any tend from anyone on a farm day marks that day tended (`tendedOn`). At the farm's first event on a later day, if the farm was tended on or after the day of the last step (`steppedOn`), the project reveals one more step: one a night, however much care there was, so nobody has to do anything special. When the catalogue's last step lands, the project joins `done` and the next starts the following day. Steps only rise. Views reveal the night's step from "now" before that event lands, as sleepiness is computed. Visits have no project. The catalogue in `packages/farm/src/catalog.ts` lists the projects in order with their step counts and art names.

## 5. Sleepy and awake (computed)

| Thing | Sleepy when | Awake when |
|---|---|---|
| Critter | its person hasn't opened the farm or been woken for 4 days, is hibernating, or is paused (`pausedUntil` is later than now) | they open the farm, or open a firefly left for them |
| Plant | no tend of its family for 7 days (14 in winter) | any tend of its family, from anyone |
| Farm | no `farm_opened` from anyone for 14 days: mist, everyone dozing | anyone opens it: the mist lifts, welcome back (04-16) |

These are functions of the latest timestamps and the current time. The snapshot carries the timestamps, so a widget works them out offline.

- A critter's last waking is the later of `lastOpenedAt` (from `farm_opened`) and `lastWokenAt` (opening a firefly left for them). Shared rain reads only `lastOpenedAt`.
- Time counts from when a person joined: a member who never opened the farm is sleepy 4 days after `joinedAt`, and a farm nobody has opened is misty 14 days after the earliest `joinedAt` of its members and former members.

## 6. Seasons, weather and chance

- **Calendar**: the farm's time zone and hemisphere come from the creator's device settings when the farm is made (`farm_created`), never from location. The keeper can change them (`settings_changed {calendar}`): a new hemisphere applies from the next `season_rolled`, a new time zone from the next local day.
- **Season**: meteorological seasons by the farm's hemisphere (north Mar/Jun/Sep/Dec, south Sep/Dec/Mar/Jun). The `season_rolled` event is written by an alarm; until it lands, every device computes the same season from the calendar.
- **Weather**: once a day an alarm fetches the weather for the keeper's town (`place` in farm settings: a city, never device location) and writes a `weather` event: rain, frost, heat or none, and its source. `place` is for weather only; it never sets days or seasons, and clearing it stops the weather. If WeatherKit is the source, Apple Weather attribution shows wherever weather appears; a source an app doesn't know gets a plain attribution.
- **Shared rain**: 3+ members with `farm_opened` within 10 minutes writes a `shared_rain` event (at most once a day). It grows a Gatherings tend for each of them and raises the rare chance.
- **Rare variants**: each plant gets one roll per season, on the first day with weather (rain, frost or heat) or shared rain on or after the day it blooms. That day, `hash(farm, plant, day, weather) < 0.15` (0.40 with shared rain that day) turns it rare; otherwise it stays plain for the season. Shared rain on a day without weather counts as rain for the roll. The snapshot keeps the roll's day as `rareRolledOn`: shared rain later that same day may roll again with the higher chance, and after that day the variant is fixed. The hash is computed from recorded events, so the outcome is the same on every device and can't be rerolled.

## 7. Snapshots, versions and the porch pot

- **Snapshot**: the farm object keeps a compact snapshot and its `seq`: the farm's identity and settings (time zone, hemisphere, place, frozen), the rules version, season, weather and shared-rain day; members with their last-opened, last-woken and last-tended times, hibernating, `pausedUntil`, whether they tended this season and their status bubble with the seq that set it (a member whose `joined` arrived tombstoned has no name); former members (with when they joined and left); this season's plants with their dew, credits and rare roll day; each family's latest tend; today's dew per person and plant (for the cap); roses, the porch pot, the field guide, the basket, plan seeds (an unsent one is kept as `unsent`, with no title or place, and never drawn), pins, the doorstep, the fire, the restoration project (from rules version 4; absent on visits and in older snapshots), and `aliases` after a person merge (merged-away id → kept id: past events keep their old actor, and phones and the reducer read them as the kept person). Dew and today's dew are reducer inputs, never drawn as numbers. Phones store the snapshot with the events since, and widgets read it from the App Group with their PNGs. A phone gets a snapshot only when it holds nothing or is more than 500 events behind (`backend.md` §3).
- **Rule changes**: every event records the `rules_version` it was applied under, and `rules_changed` marks the switch. New rules apply from that event on; past seasons are never recomputed. An app whose reducer is below the farm's rules version is told `rules_outdated` and grows nothing differently; its outbox keeps its writes until it updates.
- **When to bump the rules version**: any new kind that changes growth, any change to what a known kind grows (version 3: the plan-day rules in §2; version 4: the restoration project in §4, a farm-written `settings_changed {theme}`, and a tombstoned `seed_planted` that still sprouts from the facts its tombstone keeps: its dates, yeses, someday and whether it had a place), and any widened enum inside a known kind's payload or a snapshot field. Display-only names are open strings and need no bump: reactions, a hug's warmth, the weather source, and the kinds named in credits. Apps draw the ones they know and fall back for the rest.
- **Visits** (one-to-one) have a single **porch pot** instead of a farm: one plant per season that grows from all of both people's care, with the same cap (3 dew per person per day) and `k = 1`. The pot's plant follows the season (forget-me-not, nasturtium, cosmos, paperwhite), and its blooms fill the field guide of neither farm; they press into the visit's own small scrapbook.

## 8. Changes from the design

| Design | Now | Why |
|---|---|---|
| 15-08: each tending kind grows one plant all year | Six families, one plant per family per season | Every kind of care grows something every season |
| 15-08: bloom at a fixed 15 dew | Thresholds scale with members active this season | A 24-person farm and a 2-person farm bloom at a similar pace |
| 15-08: caps only for replies (10 a day) and dewdrops (1 per message) | 3 dew per person per plant per day for every plant | One rule; the farm shows how many people cared |
| 15-08: stage 0–5 with 5 = sleepy | Stage 0–4 (seed, sprout, bud, bloom, harvest) plus a computed sleepy flag | Sleepy is a state, not a stage |
| 15-08: visits not covered | A porch pot per visit | Replying one-to-one is rewarded too |
| 05-11: each warm reaction "grows a little something" | Reactions grow nothing; the dewdrop in the reaction row is the tend | Care is counted once, as a `dewdrop` |
| 06-05: a remember-me seed sits with the farm's seeds | Personal: kept by the person's cottage through `/v1/remember`, and it grows nothing | The screen says "only for you" and the friend it is about must never see it, so it can't live in the shared farm log (founder decision, 18 Oct 2026) |
