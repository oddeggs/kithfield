import * as web from './http/web';
import { describeSchemas } from './schema-runner.test-data';

const token = 'T'.repeat(43);
const email = 'june@example.com';

describeSchemas('the website bodies', web, {
  WebToken: [
    [token, `${'a'.repeat(42)}_`],
    ['short', `${'a'.repeat(42)}=`, 'a'.repeat(44)],
  ],
  WaitlistRequest: [
    [
      { email, lang: 'en' },
      { email, lang: 'vi', platform: 'android' },
    ],
    [
      { email, lang: 'fr' },
      { email, lang: 'en', platform: 'windows' },
      { email: 'june', lang: 'en' },
    ],
  ],
  WaitlistResponse: [[{ pick: token }], [{}, { pick: 'abc' }]],
  WaitlistPickRequest: [
    [{ pick: token, species: 'hedgehog' }],
    [{ pick: token, species: 'dragon' }, { species: 'hedgehog' }],
  ],
  WaitlistConfirmRequest: [[{ token }], [{ token: 'x' }, {}]],
  DeletionRequest: [[{ email, lang: 'vi' }], [{ email: 'june', lang: 'en' }, { email }]],
  DeletionConfirmRequest: [
    [{ email, code: '042817' }],
    [{ email, code: '42817' }, { email, code: 'abcdef' }, { code: '042817' }],
  ],
});
