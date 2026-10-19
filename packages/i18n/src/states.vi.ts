import type { ViCatalogue } from './catalogue-types';
import type { statesEn } from './states.en';

export const statesVi: ViCatalogue<typeof statesEn> = {
  'states.farm.drawing': 'đang vẽ nông trại…',
  'states.farm.loading': 'Nông trại đang tự vẽ mình ra',

  'states.offline.title': 'Tạm thời mất sóng',
  'states.offline.body':
    'Nông trại đang chìm trong sương. Bạn gửi gì cũng sẽ nằm chờ trong túi thư.',
  'states.offline.back': 'Có sóng lại rồi. Túi thư đang lên đường.',
  'states.postBag.label': 'Trong túi thư',
  'states.postBag.message': '“{text}”',
  'states.postBag.messageNoText': 'Một tin nhắn',
  'states.postBag.messageTo': 'Gửi {farm} · sẽ đi khi bạn có sóng lại',
  'states.postBag.dewdrop': 'Một giọt sương',
  'states.postBag.firefly': 'Một con đom đóm',
  'states.postBag.wave': 'Một cái vẫy tay',
  'states.postBag.sticker': 'Một nhãn dán',
  'states.postBag.other': 'Một thứ gửi {farm}',
  'states.postBag.waiting': 'Đang chờ',

  'states.error.title': 'Con đường tạm bị nước cuốn',
  'states.error.body':
    'Chưa kết nối được tới nông trại. Tin nhắn của bạn vẫn an toàn, không mất gì cả.',
  'states.error.action': 'Thử lại',

  'states.alone.title': 'Tạm thời chỉ có mình bạn',
  'states.alone.body':
    'Những căn nhà phác thảo sẽ thành thật khi bạn bè dọn đến. Bạn thú của bạn sẽ đun sẵn ấm nước chờ họ.',
  'states.alone.slot': 'chỗ cho bạn',
  'states.alone.invite': 'Mời bạn bè',

  'states.hint.step': '{n} trên {total}',
  'states.hint.critter':
    'Chạm vào bạn thú nào cũng được để xem thẻ, gửi một con đom đóm hoặc ghé thăm.',
  'states.hint.message': 'Nhấn giữ một tin nhắn để trả lời, thả cảm xúc hoặc ghim lên bảng tin.',
  'states.hint.seed':
    'Gieo một hạt giống cho điều bạn muốn làm cùng nhau. Bạn bè sẽ thêm ngày và địa điểm.',
  'states.hint.skip': 'Bỏ qua gợi ý',
  'states.hint.ok': 'Đã hiểu',
};

/** Keys whose text is the same in both languages. */
export const statesSameInBoth = [
  'states.postBag.message',
] as const satisfies readonly (keyof typeof statesEn)[];
