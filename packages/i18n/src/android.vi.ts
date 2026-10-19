import type { ViCatalogue } from './catalogue-types';
import type { androidEn } from './android.en';

export const androidVi: ViCatalogue<typeof androidEn> = {
  'android.channel.plans.name': 'Kế hoạch & trước cửa',
  'android.channel.plans.description':
    'Kế hoạch cần bạn đồng ý, món đồ trước cửa nhà bạn, và lời @nhắc tên.',
  'android.channel.messages.name': 'Mọi tin nhắn',
  'android.channel.messages.description': 'Hầu hết mọi người để tắt.',

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
  'android.photos.notNow': 'Để sau',
  'android.shop.disclosure':
    ' với giá {month} một tháng, hoặc {year} một năm, cho đến khi bạn huỷ. Farm Plus gia hạn với giá {plus} một tháng. Tiền được trừ vào tài khoản Google Play khi bạn xác nhận. Gói tự gia hạn trừ khi bạn huỷ trước khi kỳ hiện tại kết thúc. Quản lý hoặc huỷ bất cứ lúc nào trong Google Play › Thanh toán và gói thuê bao › Gói thuê bao.',
  'android.shop.priceUnknown': 'giá của Google Play',
  'android.shop.grace': 'Google Play đang thử thanh toán lại. Quyền lợi vẫn giữ trong lúc đó.',
  'android.shop.cancel': 'Huỷ trong Google Play',
  'android.fire.captionsFree':
    'Phụ đề miễn phí nếu bạn bật Phụ đề trực tiếp trong cài đặt hỗ trợ tiếp cận của điện thoại.',
  'android.fire.share': 'Chia sẻ màn hình từ điện thoại này chưa sẵn sàng.',
};
