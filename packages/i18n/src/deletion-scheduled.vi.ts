import type { ViCatalogue } from './catalogue-types';
import type { deletionScheduledEn } from './deletion-scheduled.en';

export const deletionScheduledVi: ViCatalogue<typeof deletionScheduledEn> = {
  'deletionScheduled.subject': 'Tài khoản Kithfield của bạn sẽ bị xoá vào {date}',
  'deletionScheduled.greeting': 'Xin chào từ nông trại.',
  'deletionScheduled.when':
    'Bạn đã yêu cầu xoá tài khoản Kithfield. Tài khoản sẽ bị xoá vào {date}, cùng với bé, tin nhắn, ảnh và sticker của bạn.',
  'deletionScheduled.cancel':
    'Đổi ý rồi? Hãy đăng nhập lại Kithfield trước ngày đó, sẽ không có gì bị xoá.',
  'deletionScheduled.notYou':
    'Nếu bạn không yêu cầu, hãy đăng nhập ngay để giữ tài khoản và viết cho safety@kithfield.com.',
  'deletionScheduled.signOff': 'Bác cú ở Kithfield',
};
