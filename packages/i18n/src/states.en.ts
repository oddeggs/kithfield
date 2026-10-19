import type { EnCatalogue } from './catalogue-types';

/**
 * The farm's own states (`12 States`): drawing itself in, just you, the fog of no signal and the
 * post bag, the path washed out, and the first-run hints. An empty state never shames, and a hint
 * shows once, one at a time.
 */
export const statesEn = {
  /** Over the farm while it draws itself in, in the hand face. */
  'states.farm.drawing': 'drawing the farm…',
  /** VoiceOver, for the farm while it loads. */
  'states.farm.loading': 'The farm is drawing itself in',

  /** The ink banner over the farm in a fog. */
  'states.offline.title': 'No signal right now',
  'states.offline.body': 'The farm’s in a fog. Anything you send waits in the post bag.',
  /** Said politely by VoiceOver when the fog lifts. */
  'states.offline.back': 'Back online. The post bag is on its way.',
  'states.postBag.label': 'In the post bag',
  /** A message waiting to go: its words in quotes. */
  'states.postBag.message': '“{text}”',
  'states.postBag.messageNoText': 'A message',
  'states.postBag.messageTo': 'To {farm} · goes when you’re back',
  'states.postBag.dewdrop': 'A dewdrop',
  'states.postBag.firefly': 'A firefly',
  'states.postBag.wave': 'A wave',
  'states.postBag.sticker': 'A sticker',
  'states.postBag.other': 'Something for {farm}',
  'states.postBag.waiting': 'Waiting',

  /** The farm couldn't load and nothing of it is on the phone. */
  'states.error.title': 'The path washed out for a moment',
  'states.error.body': 'We couldn’t reach the farm. Your messages are safe, and nothing was lost.',
  'states.error.action': 'Try again',

  /** A brand-new farm with only you on it. */
  'states.alone.title': 'It’s just you for now',
  'states.alone.body':
    'Sketched cottages turn real when friends move in. Your critter will keep the kettle on until then.',
  /** Under each empty cottage spot, in the hand face. */
  'states.alone.slot': 'for a friend',
  'states.alone.invite': 'Invite friends',

  /** Which tip of the few, in the hand face. Counts tips, never care. */
  'states.hint.step': '{n} of {total}',
  'states.hint.critter': 'Tap any critter to see their card, leave a firefly or start a visit.',
  'states.hint.message': 'Press and hold a message to reply, react or pin it to the noticeboard.',
  'states.hint.seed':
    'Plant a seed for anything you’d like to do together. Friends add a day and a place.',
  'states.hint.skip': 'Skip tips',
  'states.hint.ok': 'Got it',
} as const satisfies EnCatalogue;
