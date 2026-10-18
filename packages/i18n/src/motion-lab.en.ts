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
} as const satisfies EnCatalogue;
