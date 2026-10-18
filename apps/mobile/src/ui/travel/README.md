# Travel: art that leaves one screen and lands in the next

The signature transitions of `18 Motion and Transitions` share one layer. `TravelHost` (mounted
once in the root layout) keeps a transparent overlay above everything, native sheets and covers
included (`FullWindowOverlay` on iOS). A flight measures its two ends, hides their own drawings,
flies a copy drawn from the art's caches, and hands over to the target's drawing when it lands.
Everything moves on the UI thread: a spring (`motion.sheet`'s damping, settling in the
storyboard's time from `transitions`), tilting on the storyboard's wobble (`travelWobble`, from
sample 01) at the display rate while its drawings swap on twos (`travel`), with the two-drawing
landing settle. Under Reduce Motion nothing travels: the target's drawing cross-fades in over
`motion.fade`. The overlay is not a VoiceOver modal container, and its canvas exists only while
something flies (and a few seconds after).

## The ends

| You have                                       | Use                                                                                                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A view (an avatar, an icon, a bubble)          | `<TravelAnchor id sprite?>` around it: measured, and hidden while its copy flies. Inside a native sheet pass `sheetTop` (the window's height less the sheet's): a sheet's views measure from its own corner |
| A drawing on your own Skia canvas              | `<TravelSpot id box sprite?>` over it (a box in the parent's points), and `useTravelShown(id)` / `useTravelShownAll(ids)` as that drawing's opacity                                                         |
| Nothing to anchor (a tab, a door you measured) | Pass a `Box` in window points instead of an id; `tabIconBox(tab, width, height, insets.bottom)` is a tab's icon                                                                                             |

Ids two features share live in `travelIds` (`ids.ts`). An id can be flown to before its screen
has mounted: the flight rises toward a guess and turns to the target when it arrives.

## A flight

```tsx
const travel = useTravel();
const flight = travel.fly({
  from: travelIds.chatFace(farm, seq),
  to: travelIds.farmCritter(farm, person),
  sprite: { avatar: kind, look, size: 76 }, // drawn at the size it swells to
  morph: true, // lands as the target's own sprite (the whole critter)
  grow: 0.35,
  durationMs: timing('critterTravel', 'out'),
  backMs: timing('critterTravel', 'back'),
  onTouchdown: () => go.critter(farm, person),
});
flight.reverse(); // back along the same path, keeping its speed
flight.retarget(otherId); // on to somewhere else, keeping its place and speed
flight.finish(); // straight to the landing
flight.cancel(); // stop; both ends get their drawings back at once
```

Orders given before the flight has started wait for it. Callbacks: `onStart` (the copy shows),
`onTouchdown`, `onLanded`, `onReturned`. `loop` (0 to 1) draws a loop on the way, `holdMs` keeps
it on the target dimmed to a slow pulse before handing over, and a scene sprite can carry a
`halo`. An end hidden by two flights shows again when the last lets it go.

A sprite is a scene (`{ scene, attrs, width, height, drawings?, halo? }`), a face
(`{ avatar, look, size }`, one drawing: the art's avatar doesn't move), a whole critter
(`{ critter, look, size, asleep? }`, three drawings of the `pose` scene on twos) or images already
drawn (`{ sprite }`). Pass `drive` (a shared value 0 to 1) for a flight the finger holds, then
`release(forward, rate)` when it lets go.

See them all in the motion lab (`kithfield-dev://motion-lab`, development builds).

## Wired in the features

| Transition                               | Where                                                                                                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A critter travels (bubble → farm → card) | `features/chat/room/message-row.tsx` and `meet.ts` (the face, and VoiceOver's "See {name} on the farm"), `features/farm/farm-scene.tsx` and `farm-canvas.tsx` (the critter's spot and drawing) |
| Planting a seed (→ Seed bed tab)         | `features/plans/plant-sheet.tsx`                                                                                                                                                               |
| A firefly's flight to a door             | `features/gestures/firefly.tsx`                                                                                                                                                                |

## Farm home ↔ chat, under the finger (not wired yet)

The storyboard drags the farm's sheet up into the chat. The farm home's sheet holds the farm's
credits and plans, not its chat, so this needs the farm home to become the chat as its sheet
rises. With that in place, the farm home adds, as the drag begins:

```tsx
// `open` is the sheet's progress, 0 (farm) to 1 (chat header), as a shared value.
const flights = critters.map((c, i) =>
  travel.fly({
    from: travelIds.farmCritter(farm, c.person),
    to: `chat:header:${farm}:${c.person}`, // a TravelSpot per critter in FarmHeaderArt
    morph: true,
    arc: 30 + i * 6,
    durationMs: timing('farmToChat', 'eachWay'),
    drive: open,
  }),
);
// On release: flights.forEach((f) => f.release(toChat, rate));
```

and the chat header (`features/chat/room/header-art.tsx`) puts a `TravelSpot` at each critter's
place from `placeCritters`, with `useTravelShownAll` as each critter's opacity. The lab's
"Farm and chat" stage plays exactly this.
