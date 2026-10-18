# Art on screen

Every critter, plant and scene comes from `@kithfield/art`: the design's own renderer
(`design/kithfield-art.js`, synced byte for byte) running on Skia. It draws on the JS thread, so
art is drawn once into cached images and then only moved, switched or faded on the UI thread. All
of it counts against the art's sprite cache (96 MB, least recently used out first, emptied on a
memory warning); an image already on screen stays drawable when the cache lets it go.

| You need | Use | Notes |
|---|---|---|
| A drawing that doesn't move (icons, spots, a plant, a still scene) | `<ArtStill scene width height attrs t?>`, `<ArtIcon>` | Encoded once and shared, so a list of a hundred rows mounts no drawing surface |
| A small scene that moves (a sticker, a seed, a widget-sized stage) | `<ArtLoop scene width height attrs paused?>` | The whole scene as 12 frames on twos. Too big to loop whole (over a quarter of the cache: about 240×240 points at 3×) it is held still and says so once in development: use `LayeredScene` |
| A full-size scene that moves (the gate, a gesture scene, the farm) | `<LayeredScene scene width height attrs paused? tolerance? budget? frames?>` | A still, with only the parts that move looping over it. Below |
| A critter you move yourself | `useAvatarUri`, `ArtStore.avatarLayers`, `critterLayers` from `@kithfield/art` | Each slot (body and coat, marking, outfit, accessory) is its own cached layer |
| The fire alone, over a still you already have | `fireLoop(art, size, dpr)` from `@kithfield/art` | 24 frames, flame and sparks on a transparent square |

Every moving view is still under Reduce Motion, while `paused`, under a pushed screen, on a hidden
tab and in the background (`useArtVisible`).

## `LayeredScene`

```tsx
import { LayeredScene } from '../../ui/art/layered-scene';

<LayeredScene scene="gate" width={width} height={610} attrs={{ season }} />
```

- **What it draws.** The scene's still at the renderer's still moment (scene time 1.2, the same
  image `ArtStill` and `useArtStill(req, 1.2)` show, so nothing jumps when the loop starts), and
  over it, on the UI thread, a loop of only the rectangles whose pixels change: 12 frames on twos,
  copied in place (`BlendMode.Src`). The result is the scene exactly as its whole loop would be.
- **How it finds what moves.** `bakeSceneLayers` (in `@kithfield/art`) draws the loop once at 1×,
  marks the 8-point tiles that change (with 2 points kept around each change), joins them into
  rectangles, and only then draws the frames at the phone's density, keeping just those
  rectangles. It needs nothing from the scene's code, so every scene works, including ones whose
  foreground draws its own light (`night()`), rain or fireflies.
- **When it is ready.** It bakes one frame per idle moment of the JS thread (24 steps), so the
  screen's first frame and touches never wait; until then, and if it doesn't fit, the still shows.
  A bake is cached by the art: the next screen with the same scene starts moving at once.
- **Budget.** What moves may take a quarter of the cache (25 MB) by default. Over it the scene
  stays still and says so once in development, with its size. Pass `budget` (bytes) for a scene
  that has the screen to itself, or `tolerance` (0–255) to let pixels that drift by at most that
  much in any channel stay still: exact at 0 (the default), never off by more than
  `tolerance / 255` otherwise.
- **See it.** The art lab (`kithfield-dev://art-lab`, development builds) shows the gate in layers
  and a loop too big to draw whole, held still.
- **The hook.** `useSceneLayers(req, options, held)` answers the baked `SceneLayers` (pieces with
  their place and frames) for a view that draws them itself.

What moves, measured at 3× (iPhone 16, 12 frames), against the whole loop `ArtLoop` would need:

| Scene, as the lanes draw it | Layers | Whole loop | Fits by default |
|---|---|---|---|
| `gate` 393×610 (the way in) | 8.4 MB | 104 MB | yes |
| `welcome` 393×420 | 15.2 MB | 71 MB | yes |
| `spot` 300×216 (`name: 'offline'`) | 13.7 MB | 28 MB | yes |
| `farm` 393×852, day | 11.5 MB | 145 MB | yes |
| `farm` 393×430, night with a firefly (the firefly gesture) | 14.5 MB | 73 MB | yes |
| `window` 393×450 (knock) | 12.6 MB | 76 MB | yes |
| `slowpost` 393×560 | 17.6 MB | 95 MB | yes |
| `weather` 393×560: the rain cloud and its rain, a third of the scene | 39.3 MB; 24.2 MB at `tolerance={8}` | 95 MB | with `tolerance={8}`, or exact with `budget={40e6}` |
| `campfire` 393×600: the firelight flickers over two thirds of the scene | 72 MB; 68 MB at `tolerance={8}` | 102 MB | **no** |

**Scenes the art can't separate.** The `campfire` lights the whole circle with a flickering
radial glow (`night()` with a flickering radius in its foreground), so every frame relights most
of the scene: there is no small part that moves. Keep it as `ArtStill` (or `useArtStill`) with
`fireLoop` over the fire at `(0.5, 0.62)` of the scene, and put a cast of critters over it from
their cached layers (`Avatar`, `critterLayers`), as the hangout does. Its glow then holds still.

## What the art offers for doing it by hand

`LayeredScene` needs none of this, but a screen that moves parts itself (the farm home walks its
critters and drifts its clouds) can:

- **`bg` and `fg`.** Each scene in the renderer has a background drawn once per size (`bg`) and a
  foreground drawn every frame (`fg`); `Art.draw` keeps the background, as `<kf-art>` does.
- **`art.env.hidden`.** While set, drawing any canvas in `hidden.sources` is skipped and reports
  the transform it would have had (`hidden.drawn`). `art.critterCanvases` holds every critter
  sprite, so a scene drawn with it is the scene without its critters (`companionFrame` does this);
  the farm screen hides its clouds the same way, by their sprite keys, and draws them as sprites.
- **Attributes.** `state: 'nocast'` draws `farm` and `strip` without their critters; `cast`
  (`kind/coat/mark/outfit/colour/z`, comma-separated) sets the critters of `crowd`, `lineup`,
  `deco`, `porch`, `movein` and `icon2`; `night`, `lit`, `rain`, `firefly`, `fog` and `still`
  change a scene as in the design.
- **Loops.** `drawLoop(art, key, size, draw)` makes a loop of any drawing on a transparent canvas;
  `fireLoop` is the fire as the campfire draws it.

Never call the renderer (`art.image`, `art.draw`) from a frame callback: bake, then animate the
images.
