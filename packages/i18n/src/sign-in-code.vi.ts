import type { ViCatalogue } from './catalogue-types';
import type { signInCodeEn } from './sign-in-code.en';

export const signInCodeVi: ViCatalogue<typeof signInCodeEn> = {
  'signInCode.subject': 'Mã Kithfield của bạn: {code}',
  'signInCode.greeting': 'Xin chào từ nông trại!',
  'signInCode.code': 'Đây là mã để bạn vào: {code}',
  'signInCode.lifetime': 'Mã dùng được trong 10 phút.',
  'signInCode.notYou':
    'Nếu bạn không yêu cầu mã này, cứ để lá thư này lại. Không ai vào được nếu không có mã.',
  'signInCode.signOff': 'Bác cú ở Kithfield',
};
