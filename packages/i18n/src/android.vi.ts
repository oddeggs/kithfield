import type { ViCatalogue } from './catalogue-types';
import type { androidEn } from './android.en';

export const androidVi: ViCatalogue<typeof androidEn> = {
  'android.channel.plans.name': 'Kế hoạch & trước cửa',
  'android.channel.plans.description':
    'Kế hoạch cần bạn đồng ý, món đồ trước cửa nhà bạn, và lời @nhắc tên.',
  'android.channel.messages.name': 'Mọi tin nhắn',
  'android.channel.messages.description': 'Hầu hết mọi người để tắt.',
  'android.channel.quiet.name': 'Vài điều nho nhỏ',
  'android.channel.quiet.description':
    'Lời tóm tắt nhẹ nhàng khi nông trại có nhiều chuyện. Không bao giờ có tiếng.',

  'android.widget.nextPlan.name': 'Kế hoạch tới',
  'android.widget.nextPlan.description':
    'Kế hoạch sắp tới, hoặc ai đang ngồi bên lửa khi lửa cháy.',
  'android.widget.dewdrop.name': 'Giọt sương nhanh',
  'android.widget.dewdrop.description':
    'Để lại một giọt sương ở nông trại của bạn bè chỉ với một chạm.',
  'android.widget.dewdrop.title': 'Giọt sương nhanh',
  'android.widget.dewdrop.row': 'Để lại một giọt sương cho {name}',
  'android.widget.dewdrop.empty': 'Bạn bè sẽ hiện ở đây khi nông trại của bạn có người.',

  'android.back.toFarm': 'về nông trại',

  'android.share.pick': 'Chia sẻ đến nông trại nào?',
  'android.share.cancel': 'Huỷ',

  'android.ask.next': 'Tiếp theo, điện thoại cũng sẽ hỏi bạn.',
  'android.code.note': 'Mã dùng được trong 10 phút.',
  'android.store.unavailable': 'Điện thoại này chưa kết nối được Google Play lúc này.',
  'android.delete.purchases': 'Những gì đã mua vẫn ở với tài khoản Google nếu bạn quay lại',
  'android.delete.biometric': 'Bạn sẽ xác nhận bằng vân tay, khuôn mặt hoặc khoá màn hình.',
};
