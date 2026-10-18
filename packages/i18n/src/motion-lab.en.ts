import type { EnCatalogue } from './catalogue-types';

/**
 * The development motion lab: the travelling transitions of `18 Motion and Transitions`, played
 * with real art on one screen. The screen is left out of release builds; this catalogue, like
 * every other, ships with the app.
 */
export const motionLabEn = {
  'motionLab.title': 'Motion lab',
  'motionLab.subtitle':
    'Development only: art travelling between screens on the UI thread. Turn on Reduce Motion in Settings to see each one as a cross-fade.',
  'motionLab.pick': 'Transition',
  'motionLab.critter': 'Critter',
  'motionLab.chat': 'Farm and chat',
  'motionLab.seed': 'Seed',
  'motionLab.firefly': 'Firefly',
  'motionLab.back': 'Play it back',
  'motionLab.reset': 'Start again',
  'motionLab.critter.hint':
    'Tap a face: the critter lifts out of the chat and lands on the farm. Tap again mid-flight to go straight to the card; play it back to shrink it into the bubble.',
  'motionLab.critter.card': 'Here, on the farm',
  'motionLab.chat.hint':
    'Drag the sheet up and down: each critter follows your finger into the chat header and back. Let go and it settles at the nearer end.',
  'motionLab.seed.hint':
    'Hold the message to plant it: it curls into a seed and drops into the Seed bed. Play it back to unplant it.',
  'motionLab.seed.message': 'picnic before it gets cold?',
  'motionLab.firefly.hint':
    'Send the firefly to a door. Pick the other door mid-flight to turn it, or call it back.',
  'motionLab.firefly.send': 'Send it',
  'motionLab.firefly.recall': 'Call it back',
  'motionLab.firefly.left': 'Left door',
  'motionLab.firefly.right': 'Right door',
  'motionLab.moveIn': 'Move in',
  'motionLab.moveIn.hint':
    'Pick a critter: it carries up to the stage and grows. Move in: it hops down the path to its cottage, and the window lights. Play it back to shrink it into its tile.',
  'motionLab.visit': 'Visit',
  'motionLab.visit.go': 'Visit the porch',
  'motionLab.visit.hint':
    'Visit: the farm pans to the door, which opens onto the porch; one critter walks in from the left, the other from the door, and both sit. Play it back to walk off the way you came.',
  'motionLab.dew': 'Dewdrop',
  'motionLab.dew.hint':
    'Tap the dewdrop: it swells and falls onto the photo, two ripples spread, and a clover sprouts in the farm above. Tap again to take it back: the ripples run inward and the sprout tucks away.',
  'motionLab.gift': 'Gift',
  'motionLab.gift.go': 'Wrap the scarf',
  'motionLab.gift.hint':
    'Wrap the scarf: the parcel ties up in two drawings and hops down the path to the step; on their phone the lid lifts and the scarf drops onto them.',
  'motionLab.fire': 'Fire',
  'motionLab.fire.home': 'Go home',
  'motionLab.fire.hint':
    'Tap the fire ring: the farm zooms into the fire. Go home: the flame shrinks up into the Dynamic Island. Tap the island to go back in.',
  'motionLab.photo': 'Photo',
  'motionLab.photo.press': 'Press a flower',
  'motionLab.photo.hint':
    'Tap the photo: it opens full screen from its bubble; tap again to put it back. Press a flower: the hangout’s photos fan out on a page, and the page closes on a pressed flower.',
  'motionLab.harvest': 'Harvest',
  'motionLab.harvest.go': 'Harvest',
  'motionLab.harvest.hint':
    'Harvest: the ripe crops hop out one by one into the basket, it wobbles once, and the recap rises under it. Play it back to send the basket home.',
  'motionLab.bouquet': 'Bouquet',
  'motionLab.bouquet.reply': 'Answer',
  'motionLab.bouquet.undo': 'Undo',
  'motionLab.bouquet.hint':
    'Answer the first card: it folds like paper, rolls into a stem and drops into the bouquet, which wiggles. Undo unrolls it back into its card.',
  'motionLab.sticker': 'Sticker',
  'motionLab.sticker.hint':
    'Tap a sticker: it lifts, tilts and grows along an arc and lands as a message with a two-drawing bounce.',
  'motionLab.reacts': 'Farm reacts',
  'motionLab.reacts.go': 'A message arrives',
  'motionLab.reacts.message': 'anyone up?',
  'motionLab.reacts.hint':
    'A message arrives: the lamp in its window lights in two drawings and a bubble pops above its critter. A burst of messages makes one lamp and one bubble, every 4 seconds at most.',
} as const satisfies EnCatalogue;
