import type { ViCatalogue } from './catalogue-types';
import type { fireEn } from './fire.en';

export const fireVi: ViCatalogue<typeof fireEn> = {
  'fire.title': 'Bên đống lửa',
  'fire.friend': 'một người bạn',
  'fire.back': 'Về nông trại',

  'fire.sub.unlit': '{farm} · chưa nhóm lửa',
  'fire.sub.count': { other: '{count} người bên lửa' },
  'fire.sub.countWith': { other: '{count} người bên lửa · {state}' },
  'fire.sub.listening': 'bạn đang nghe',
  'fire.sub.muted': 'bạn đang tắt mic',
  'fire.sub.full': 'đã đủ chỗ',
  'fire.sub.pair': '{name} và bạn',
  'fire.sub.settling': 'lửa đang lắng',
  'fire.sub.captions': 'Đang bật phụ đề · chỉ bạn thấy',
  'fire.sub.sharing': 'Bạn đang chia sẻ màn hình',
  'fire.sub.showing': '{name} đang cho bạn xem một thứ',
  'fire.names.two': '{a} và {b}',
  'fire.names.more': '{list}, {name}',

  'fire.unlit.eyebrow': 'lửa đã tắt',
  'fire.unlit.title': 'Nhóm lửa nhé?',
  'fire.unlit.body':
    'Bạn thú của bạn ngồi xuống và nông trại sáng lên. Bạn bè thấy điều đó trên nông trại và widget, và có thể ghé ngồi nếu muốn. Không điện thoại nào đổ chuông.',
  'fire.unlit.light': 'Nhóm lửa và ngồi xuống',
  'fire.unlit.notTonight': 'Để hôm khác',

  'fire.glow.one': '{name} đang ngồi bên lửa',
  'fire.glow.two': '{a} và {b} đang ngồi bên lửa',
  'fire.glow.many': '{name} và các bạn đang ngồi bên lửa',
  'fire.glow.body': 'Ghé ngồi nếu bạn muốn. Không cần nói gì đâu.',

  'fire.join.walking': '{name} đang đi tới',
  'fire.join.title': 'Kéo một khúc gỗ ngồi',
  'fire.join.body':
    'Dù chọn gì, bạn đến nơi với mic tắt. Đổi lúc nào cũng được. Không gì được ghi âm, và không ai thấy bạn ngồi bao lâu.',
  'fire.join.in': 'Cùng trò chuyện',
  'fire.join.listen': 'Chỉ nghe thôi',

  'fire.dock.listening': 'Bạn đang nghe',
  'fire.dock.listeningLine': 'không ai nghe thấy bạn tới khi bạn bật mic',
  'fire.dock.muted': 'Bạn đang tắt mic',
  'fire.dock.mutedLine': 'nói mà không cần lời',
  'fire.dock.talking': 'Bạn đang nói',
  'fire.dock.talkingLine': '{name} trông vui vì được ở đây',
  'fire.dock.unmuteToTalk': 'Bật mic để nói',
  'fire.dock.unmute': 'Bật mic',
  'fire.dock.mute': 'Tắt mic',
  'fire.dock.headHome': 'Về nhà',
  'fire.dock.lightLantern': 'Thắp đèn lồng',
  'fire.dock.putOutLantern': 'Tắt đèn lồng',
  'fire.dock.share': 'Chia sẻ màn hình',
  'fire.dock.stopSharing': 'Dừng chia sẻ',
  'fire.dock.flip': 'Xem cái này nè',
  'fire.dock.flipBack': 'Lật lại',

  'fire.gesture.wave': 'Vẫy tay',
  'fire.gesture.dewdrop': 'Giọt sương',
  'fire.gesture.hug': 'Ôm',
  'fire.gesture.sticker': 'Một nhãn dán',
  'fire.gesture.to': 'gửi {name}',
  'fire.gesture.fromYou': 'từ bạn',

  'fire.chip.you': 'Bạn',
  'fire.chip.youCameraOff': 'Bạn · tắt camera',
  'fire.chip.paused': 'tạm dừng',
  'fire.chip.justListening': 'chỉ đang nghe',
  'fire.chip.joining': '{name} đang tới',
  'fire.chip.talking': '{name}, đang nói',
  'fire.chip.mutedA11y': '{name}, đang tắt mic',
  'fire.chip.listeningA11y': '{name}, chỉ đang nghe',
  'fire.frame.a11y': '{who}; {lantern}',
  'fire.frame.lit': 'đèn lồng đang sáng',
  'fire.frame.cameraOff': 'tắt camera',

  'fire.weak.title': 'Kết nối của {name} đang yếu.',
  'fire.weak.body': 'Bạn thú của bạn ấy ngủ gật và tiếng tạm dừng tới khi kết nối trở lại.',

  'fire.leave.title': 'Về nhà thôi',
  'fire.leave.body':
    '{name} vẫy tay chúc ngủ ngon rồi đi ngược con đường mòn. Mọi người chỉ thấy {name} đi, như khi rời một đống lửa thật. Không thông báo, không có “{name} đã rời đi”.',
  'fire.leave.walk': 'Đi về',
  'fire.leave.stay': 'Ngồi thêm chút nữa',

  'fire.quiet.eyebrow': 'lửa đang lắng xuống',
  'fire.quiet.title': 'Mọi người đã thong thả về nhà',
  'fire.quiet.body': 'Than hồng còn sáng trên nông trại vài phút rồi tắt. Ai cũng có thể nhóm lại.',
  'fire.quiet.back': 'Về nông trại',

  'fire.lantern.welcome':
    '{name} đã thắp đèn lồng. Bạn ở đây là {you}, và vẫn được chào đón như thế.',
  'fire.lantern.lookAtThis': 'xem nè!',

  'fire.captions.button': 'Phụ đề',
  'fire.captions.cc': 'CC',
  'fire.captions.plus': 'PLUS',
  'fire.captions.title': 'Phụ đề',
  'fire.captions.pair': '{from} → {to}',
  'fire.captions.settings': 'Cài đặt',
  'fire.captions.withheld': '…',
  'fire.captions.waiting': 'Chữ sẽ hiện ở đây khi mọi người nói.',
  'fire.captions.lang.en': 'Tiếng Anh',
  'fire.captions.lang.vi': 'Tiếng Việt',
  'fire.captions.sheetEyebrow': 'với Kithfield+',
  'fire.captions.sheetTitle': 'Nghe được, đọc được',
  'fire.captions.lead':
    'Phụ đề hiện ra khi bạn bè trò chuyện, được dịch sang ngôn ngữ của bạn nếu muốn. Giọng của những người bạn đã đồng ý được gửi đến {processor} và trở về thành chữ: không gì được ghi âm hay lưu lại, và không ai được báo.',
  'fire.captions.processor':
    'Workers AI do Cloudflare vận hành, cũng là công ty đang vận hành máy chủ của Kithfield',
  'fire.captions.live': 'Phụ đề trực tiếp',
  'fire.captions.liveSub': 'Chữ hiện dưới đống lửa khi mọi người nói',
  'fire.captions.translate': 'Dịch sang',
  'fire.captions.translateSub': 'Tự nhận ra ngôn ngữ của từng người',
  'fire.captions.original': 'Hiện cả câu gốc',
  'fire.captions.expressions': 'Biểu cảm theo giọng nói',
  'fire.captions.expressionsSub':
    'Bạn thú của bạn cười, dịu lại hay ngạc nhiên theo bạn. Miễn phí cho mọi người, và bạn có thể tắt của mình.',
  'fire.captions.free':
    'Phụ đề miễn phí nếu bạn bật Phụ đề trực tiếp trong cài đặt trợ năng của iPhone.',
  'fire.captions.turnOn': 'Bật với Plus',
  'fire.captions.done': 'Xong',
  'fire.captions.notNow': 'Để sau',
  'fire.captions.yourVoice': 'Làm phụ đề cho giọng bạn nữa',

  'fire.error.connect': 'Chưa tới được đống lửa. Thử lại sau một chút nhé.',
  'fire.error.mic':
    'Kithfield chưa nghe được mic của bạn. Bạn có thể chỉ nghe, hoặc cho phép trong Cài đặt.',
  'fire.error.camera': 'Kithfield chưa dùng được camera. Bạn có thể cho phép trong Cài đặt.',
  'fire.error.share': 'Chia sẻ màn hình từ iPhone chưa sẵn sàng.',
};

/** Read the same in both languages: symbols and the template that joins translated names. */
export const fireSameInBoth = [
  'fire.names.more',
  'fire.captions.cc',
  'fire.captions.plus',
  'fire.captions.pair',
  'fire.captions.withheld',
] as const satisfies readonly (keyof typeof fireEn)[];
