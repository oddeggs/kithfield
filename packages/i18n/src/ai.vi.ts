import type { aiEn } from './ai.en';
import type { ViCatalogue } from './catalogue-types';

export const aiVi: ViCatalogue<typeof aiEn> = {
  'ai.provider': 'Cloudflare',
  'ai.consent.processor':
    'Workers AI do {provider} vận hành, cũng là công ty đang vận hành máy chủ của Kithfield',
  'ai.consent.terms':
    '{provider} không bao giờ dùng nó để huấn luyện AI và không giữ lại gì khi đã xong việc.',

  'ai.consent.captions.lead':
    'Để làm phụ đề và dịch bên đống lửa, giọng nói được gửi đến {processor}. Đây là chính xác những gì xảy ra.',
  'ai.consent.captions.staysText':
    'Trò chuyện, ảnh, danh bạ và vị trí của bạn không bao giờ được gửi. Phụ đề không bao giờ được lưu: chúng biến mất khi lửa tắt.',

  'ai.consent.recap.lead':
    'Để viết một lá thư ngắn về tuần qua ở {farm}, tin nhắn của nông trại được gửi đến {processor}.',
  'ai.consent.recap.leadAll':
    'Để viết một lá thư ngắn về tuần qua ở các nông trại của bạn, tin nhắn ở đó được gửi đến {processor}.',
  'ai.consent.recap.sent':
    'Chữ trong tin nhắn tuần này và những kiểu chăm sóc đã trao, chỉ từ những người bạn đã đồng ý. Tên không bao giờ được gửi: chúng được điền vào ở đây. Không có ảnh, tin nhắn thoại hay lần ghé thăm nào được gửi.',
  'ai.consent.recap.kept':
    'Lá thư được giữ cùng tuần đó của nông trại. Khi bạn rút lời của mình lại, mọi lá thư có lời bạn đều bị xoá.',

  'ai.consent.voiceNotes.eyebrow': 'trước khi bật',
  'ai.consent.voiceNotes.title': 'Phụ đề tin nhắn thoại dùng một AI bên ngoài',
  'ai.consent.voiceNotes.lead':
    'Khi một người bạn muốn đọc tin nhắn thoại của bạn, âm thanh của nó được gửi đến {processor}. Đây là chính xác những gì xảy ra.',
  'ai.consent.voiceNotes.sent':
    'Âm thanh của một tin nhắn thoại của bạn, chỉ khi một người bạn ở nông trại đó muốn đọc nó. Tin nhắn thoại bạn chuyển tiếp không bao giờ được gửi.',
  'ai.consent.voiceNotes.use': 'Chuyển thành chữ, và dịch sang ngôn ngữ của bạn ấy.',
  'ai.consent.voiceNotes.stays': 'Những gì ở lại đây',
  'ai.consent.voiceNotes.staysText':
    'Phụ đề ở cùng tin nhắn thoại trong nông trại, và biến mất khi bạn thu hồi tin nhắn.',
  'ai.consent.voiceNotes.others':
    'Nếu bạn nói không, tin nhắn thoại của bạn sẽ không bao giờ có phụ đề. Bạn bè chỉ thấy một dấu “…” lặng lẽ.',
  'ai.consent.voiceNotes.yes': 'Làm phụ đề cho tin nhắn thoại của mình',
  'ai.consent.voiceNotes.no': 'Để sau',

  'ai.data.voiceNotes': 'Phụ đề tin nhắn thoại',
  'ai.data.voiceNotesOn': 'Cho phép · tin nhắn thoại của bạn, khi bạn bè muốn đọc',
  'ai.data.voiceNotesOff': 'Không cho phép · tin nhắn thoại của bạn không bao giờ có phụ đề',
  'ai.data.takeBackText':
    'Tắt một mục là ngừng gửi ngay lập tức. {provider} không giữ lại gì khi đã xong việc, và bạn có thể nhờ chúng mình xoá phụ đề và lá thư chúng mình đã giữ.',
  'ai.data.forgotten':
    'Chúng mình đang xoá những gì đã giữ cho mục này. Mọi thứ sẽ biến mất trong vòng một ngày.',

  'ai.letter.theFarm': 'nông trại',

  'ai.fire.captionsLead':
    'Phụ đề hiện ra khi bạn bè trò chuyện, được dịch sang ngôn ngữ của bạn nếu muốn. Giọng của những người bạn đã đồng ý được gửi đến {processor} và trở về thành chữ: không gì được ghi âm hay lưu lại, và không ai được báo.',
};

/** The provider's name is the same in both languages. */
export const aiSameInBoth = ['ai.provider'] as const satisfies readonly (keyof typeof aiEn)[];
