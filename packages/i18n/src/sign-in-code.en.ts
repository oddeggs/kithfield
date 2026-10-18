import type { EnCatalogue } from './catalogue-types';

/** The letter that carries a sign-in code (`03-03`). The code is in the subject too, for autofill. */
export const signInCodeEn = {
  'signInCode.subject': 'Your Kithfield code: {code}',
  'signInCode.greeting': 'Hello from the farm!',
  'signInCode.code': 'Here is your code to come in: {code}',
  'signInCode.lifetime': 'It works for 10 minutes.',
  'signInCode.notYou':
    'If you didn’t ask for it, you can let this letter be. Nobody comes in without the code.',
  'signInCode.signOff': 'The owl at Kithfield',
} as const satisfies EnCatalogue;
