# The fire room

A drop-in voice room per farm on LiveKit (`16 Fire Room and Calls`). The route is
`/fire-room?farm=<id>`; `FireGlowCard` and `useFireOnFarm` are for the farm screen.

- `fire-session.ts`: one sitting, a LiveKit room read as the people by the fire.
- `fire-scene.tsx`: the campfire still, the fire's loop and the critters, all moved on the UI thread.
- `caption-sender.ts`: your own voice for captions, through LiveKit's audio sink on the mic you
  already publish. Only while you said yes, your mic is open, someone has captions on, captions are
  available here, and the app is in front.

## Checks on a real phone

The simulator has no camera and no real audio route, so these are checked on a device (two phones,
or one phone and a Node participant from `@livekit/rtc-node`):

1. **Voices.** Join in, unmute, talk: the other phone hears you, your critter leans and bobs, the
   chip turns honey with moving bars. Mute: they stop hearing you at once.
2. **Listening.** Just listen: the mic indicator never lights. "Unmute to talk" lights it without
   reconnecting (your critter stays on its log).
3. **Interruptions.** Take a phone call and Siri mid-sitting: when it ends, the dock's mute state
   matches what the other phone hears. Lock the phone: voices carry on (background audio); captions
   stop sending while the app is in the background and resume in front.
4. **Routes.** Plug in and pull out wired headphones, connect and drop AirPods: voices follow, and
   if captions were on, they keep coming (the sink follows the mic's new track).
5. **Weak connection.** With Network Link Conditioner at 20% loss on one phone: on the other, that
   critter dozes, the moon chip says "paused", their audio pauses and comes back on its own.
6. **Lanterns.** Light a lantern with 2, 4 and 6–8 people: the layouts follow; turning a camera off
   cross-fades to the critter. Tap your own lit frame to turn the camera round, and "Flip back".
7. **Leaving.** Head home with someone still there: the other phone sees your critter wave and walk
   home, with no word about it. Be the last: the fire settles, and goes out on the farm 3 minutes later.
8. **Removed or banned.** Remove someone (or ban them from the safety desk) while they sit: they are
   taken out of the room within a few seconds and can't sit again.
9. **Captions** (with the AI and shop seams filled): a consenting speaker's lines arrive within a few
   seconds in the listener's language; a speaker who said no shows "…"; nothing is kept after.
10. **60 fps.** With 8 people and lanterns lit, the Perf Monitor holds 60 on the UI thread.

Measured: turning a 6-second piece of 48 kHz audio into 16 kHz WAV takes about 1 ms in Node (decode
0.2 ms, resample and wrap 1 ms); Hermes, without a JIT, is expected around ten times that, once
every 6 seconds. The sink itself sends about 100 small events a second over the bridge while
captions are being sent; throttling that needs a change to LiveKit's native sink.
