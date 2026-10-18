import type { ViCatalogue } from './catalogue-types';
import type { deletionCodeEn } from './deletion-code.en';

export const deletionCodeVi: ViCatalogue<typeof deletionCodeEn> = {
  'deletionCode.subject': 'Mã Kithfield để xoá tài khoản của bạn: {code}',
  'deletionCode.greeting': 'Xin chào từ nông trại.',
  'deletionCode.code':
    'Có người vừa yêu cầu xoá tài khoản Kithfield gắn với email này. Để tiếp tục, hãy nhập mã: {code}',
  'deletionCode.lifetime': 'Mã dùng được trong 10 phút.',
  'deletionCode.wait':
    'Sau đó bạn có 30 ngày để đổi ý: đăng nhập lại Kithfield là việc xoá được huỷ.',
  'deletionCode.notYou':
    'Nếu bạn không yêu cầu, cứ để lá thư này lại. Không có gì bị xoá nếu không có mã.',
  'deletionCode.signOff': 'Bác cú ở Kithfield',
};
