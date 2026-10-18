import type { EnCatalogue } from './catalogue-types';

/**
 * Sending photos, video, voice notes and files: the progress over each item and the weak-signal
 * notice (the slow-upload state in `12 States`), and what the upload says when something can't go. "1 of 4" counts
 * items on their way, never care.
 */
export const mediaEn = {
  /** Under a group still going up on a weak signal: items done, of all of them. */
  'media.status.slow': 'Sending slowly · {done} of {total}',
  'media.status.sending': 'Sending · {done} of {total}',
  'media.slow.body':
    'The signal’s thin out here. These will keep sending in the background, even if you close the app.',
  /** Photos go again at 1600 px on the long side. */
  'media.slow.smaller': 'Send smaller copies',
  'media.slow.wifi': 'Wait for Wi-Fi',
  /** VoiceOver: the ✕ over an item on its way. */
  'media.item.cancel': 'Stop sending this one',
  /** VoiceOver: the ring's value. */
  'media.item.progress': '{percent}% sent',
  'media.item.waiting': 'Waiting to send',
  'media.failed.tooLarge': 'This one is too big to send. Files can be up to 100 MB.',
  'media.failed.notMember': 'This farm isn’t one you live on any more, so it can’t go there.',
  'media.failed.unreadable': 'This file couldn’t be read on this phone.',
  /** After this phone was signed out: nothing goes up until someone signs in again. */
  'media.failed.signedOut': 'Sign in again to send this.',
  'media.failed.other': 'This didn’t send.',
  'media.retry': 'Try again',
  /** The development media lab (left out of release builds). */
  'media.lab.title': 'Media lab',
  'media.lab.subtitle': 'Development only: uploads through the local API, read back signed.',
  'media.lab.farm': 'Farm {farm}',
  'media.lab.noFarm': 'No farm yet. Plant one in the sync lab first.',
  'media.lab.photos': 'Pick photos',
  'media.lab.camera': 'Take a photo or video',
  'media.lab.video': 'Pick a video',
  'media.lab.file': 'Pick a file',
  'media.lab.voiceStart': 'Record a voice note',
  'media.lab.voiceStop': 'Stop and send',
  'media.lab.sent': 'Sent and read back',
} as const satisfies EnCatalogue;
