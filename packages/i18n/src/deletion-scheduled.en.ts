import type { EnCatalogue } from './catalogue-types';

/** The letter sent when an account's deletion is scheduled, from the app or the website. */
export const deletionScheduledEn = {
  'deletionScheduled.subject': 'Your Kithfield account will be deleted on {date}',
  'deletionScheduled.greeting': 'Hello from the farm.',
  'deletionScheduled.when':
    'You asked to delete your Kithfield account. It will be deleted on {date}, with your critter, messages, photos and stickers.',
  'deletionScheduled.cancel':
    'Changed your mind? Sign in to Kithfield again before then and nothing is deleted.',
  'deletionScheduled.notYou':
    'If you didn’t ask for this, sign in now to keep your account, and write to safety@kithfield.com.',
  'deletionScheduled.signOff': 'The owl at Kithfield',
} as const satisfies EnCatalogue;
