import type { EnCatalogue } from './catalogue-types';

/**
 * The letter that carries the code confirming an account deletion asked for on the website. The
 * code is in the subject too, for autofill.
 */
export const deletionCodeEn = {
  'deletionCode.subject': 'Your Kithfield code to delete your account: {code}',
  'deletionCode.greeting': 'Hello from the farm.',
  'deletionCode.code':
    'Someone asked to delete the Kithfield account for this email. To go ahead, enter this code: {code}',
  'deletionCode.lifetime': 'It works for 10 minutes.',
  'deletionCode.wait':
    'After that you have 30 days to change your mind: signing in to Kithfield again cancels it.',
  'deletionCode.notYou':
    'If you didn’t ask, you can let this letter be. Nothing is deleted without the code.',
  'deletionCode.signOff': 'The owl at Kithfield',
} as const satisfies EnCatalogue;
