import type { ViCatalogue } from './catalogue-types';
import type { mediaEn } from './media.en';

export const mediaVi: ViCatalogue<typeof mediaEn> = {
  'media.status.slow': 'Đang gửi chậm · {done} trên {total}',
  'media.status.sending': 'Đang gửi · {done} trên {total}',
  'media.slow.body':
    'Sóng ở đây hơi yếu. Mấy tấm này vẫn tiếp tục gửi ngầm, kể cả khi bạn đóng ứng dụng.',
  'media.slow.smaller': 'Gửi bản nhỏ hơn',
  'media.slow.wifi': 'Đợi có Wi-Fi',
  'media.item.cancel': 'Thôi không gửi tấm này',
  'media.item.progress': 'Đã gửi {percent}%',
  'media.item.waiting': 'Đang chờ gửi',
  'media.failed.tooLarge': 'Tệp này lớn quá nên không gửi được. Tệp tối đa 100 MB.',
  'media.failed.notMember': 'Bạn không còn ở nông trại này nữa, nên không gửi tới đó được.',
  'media.failed.unreadable': 'Không đọc được tệp này trên điện thoại.',
  'media.failed.other': 'Chưa gửi được.',
  'media.retry': 'Thử lại',
  'media.lab.title': 'Phòng thử ảnh và tệp',
  'media.lab.subtitle':
    'Chỉ dành cho phát triển: tải lên qua API cục bộ, đọc lại bằng liên kết có ký.',
  'media.lab.farm': 'Nông trại {farm}',
  'media.lab.noFarm': 'Chưa có nông trại. Hãy gieo một nông trại trong phòng thử đồng bộ trước.',
  'media.lab.photos': 'Chọn ảnh',
  'media.lab.camera': 'Chụp ảnh hoặc quay video',
  'media.lab.video': 'Chọn video',
  'media.lab.file': 'Chọn tệp',
  'media.lab.voiceStart': 'Ghi lời nhắn thoại',
  'media.lab.voiceStop': 'Dừng và gửi',
  'media.lab.sent': 'Đã gửi và đọc lại',
};
