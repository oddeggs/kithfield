import type { ViCatalogue } from './catalogue-types';
import type { safetyEn } from './safety.en';

export const safetyVi: ViCatalogue<typeof safetyEn> = {
  'safety.cancel': 'Huỷ',
  'safety.failed': 'Chưa gửi được. Thử lại sau một chút nhé.',
  'safety.friend': 'một người bạn',

  'safety.report.title': 'Báo cáo',
  'safety.report.aboutMessage': 'Tin nhắn này có vấn đề gì?',
  'safety.report.aboutPerson': 'Có chuyện gì với {name}?',
  'safety.report.unkind': 'Không tử tế hoặc bắt nạt',
  'safety.report.unwanted_contact': 'Liên lạc không mong muốn',
  'safety.report.sexual_content': 'Khoả thân hoặc nội dung tình dục',
  'safety.report.child_safety': 'Nội dung hoặc hành vi tình dục liên quan đến trẻ vị thành niên',
  'safety.report.violence': 'Bạo lực hoặc đe doạ',
  'safety.report.self_harm': 'Tự làm hại bản thân hoặc tự tử',
  'safety.report.spam': 'Thư rác hoặc lừa đảo',
  'safety.report.something_else': 'Chuyện khác',
  'safety.report.notePlaceholder': 'Kể thêm một chút, nếu bạn muốn',
  'safety.report.alsoBlock': 'Chặn {name} luôn',
  'safety.report.alsoBlockSub': 'Bạn cũng có thể làm sau',
  'safety.report.footMessage':
    'Đội an toàn sẽ xem tin nhắn này và vài tin quanh nó. {name} sẽ không biết ai đã báo cáo.',
  'safety.report.footPerson': 'Đội an toàn sẽ xem xét. {name} sẽ không biết ai đã báo cáo.',
  'safety.report.send': 'Gửi báo cáo',
  'safety.report.sent':
    'Cảm ơn bạn đã cho chúng mình biết. Đội an toàn sẽ xem trong vòng một ngày.',
  'safety.report.gone': 'Tin nhắn đó đã được gỡ xuống rồi.',

  'safety.block.title': 'Chặn {name}?',
  'safety.block.hidden': 'Tin nhắn của họ bị ẩn với bạn ở mọi nông trại hai bạn cùng ở',
  'safety.block.visits': 'Họ không thể ghé thăm bạn hay để lại gì trước cửa nhà bạn',
  'safety.block.stay': 'Cả hai vẫn ở nông trại. Người giữ trại có thể mời họ rời đi nếu cần',
  'safety.block.untold': 'Họ không được báo. Với họ, căn nhà của bạn chỉ trông yên ắng',
  'safety.block.action': 'Chặn {name}',
  'safety.block.done': 'Đã chặn {name}. Bạn có thể bỏ chặn trong Cài đặt › Đã chặn.',
  'safety.blocked.title': 'Đã chặn',
  'safety.blocked.none': 'Chưa chặn ai. Nếu bạn chặn ai đó, họ sẽ hiện ở đây.',
  'safety.blocked.note': 'Họ không được báo khi bị chặn, hay khi được bỏ chặn.',
  'safety.blocked.since': 'Đã chặn {day}',
  'safety.blocked.unblock': 'Bỏ chặn',
  'safety.blocked.undone': 'Đã bỏ chặn {name}.',

  'safety.porch.eyebrow': 'hiên nhà đang vắng',
  'safety.porch.title': 'Hiên nhà {name} đang yên ắng',
  'safety.porch.body': '{name} đang không nhận khách ghé thăm. Hai bạn vẫn ở chung nông trại.',
  'safety.porch.back': 'Về nông trại',

  'safety.removed.title': 'Bạn không còn ở {farm}',
  'safety.removed.byKeeper':
    'Một người giữ trại ở đó đã thay đổi điều này. Nông trại đôi khi đổi khác. Các nông trại và lần ghé thăm khác của bạn vẫn y nguyên.',
  'safety.removed.bySafety':
    'Đội an toàn đã thay đổi điều này. Các nông trại và lần ghé thăm khác của bạn vẫn y nguyên.',
  'safety.removed.card':
    'Những lần ghé thăm với người ở nông trại đó vẫn như bình thường, và bạn thú của bạn giữ mọi thứ mình có.',
  'safety.removed.go': 'Đến nông trại của mình',
  'safety.removed.rules': 'Đọc nội quy',

  'safety.notes.title': 'Lời nhắn từ đội an toàn',
  'safety.notes.none': 'Chưa có lời nhắn. Khi đội an toàn viết cho bạn, nó sẽ hiện ở đây.',
  'safety.answered.eyebrow': 'từ đội an toàn Kithfield',
  'safety.answered.title': 'Chúng mình đã xem điều bạn báo cáo',
  'safety.answered.message': 'Tin nhắn của {name} từ {day}',
  'safety.answered.thing': 'Thứ {name} chia sẻ vào {day}',
  'safety.answered.person': 'Điều bạn kể về {name}',
  'safety.answered.removed': 'đã gỡ',
  'safety.answered.kept': 'vẫn còn',
  'safety.answered.removedBody':
    'Cảm ơn bạn đã cho chúng mình biết. Nó vi phạm nội quy, nên chúng mình đã gỡ xuống. Để bảo vệ quyền riêng tư của mọi người, chúng mình không chia sẻ điều gì khác xảy ra với một tài khoản.',
  'safety.answered.keptBody':
    'Cảm ơn bạn đã cho chúng mình biết. Chúng mình đã xem kỹ, và nó không vi phạm nội quy, nên nó vẫn ở đó. Để bảo vệ quyền riêng tư của mọi người, chúng mình không chia sẻ điều gì khác xảy ra với một tài khoản.',
  'safety.answered.unsafe':
    'Vẫn thấy không an toàn? Chặn chỉ cần một chạm, và bạn có thể viết cho {email} bất cứ lúc nào.',
  'safety.answered.thanks': 'Cảm ơn',
  'safety.answered.block': 'Chặn {name} luôn',

  'safety.removedNote.eyebrow': 'lời nhắn từ đội an toàn',
  'safety.removedNote.message': 'Chúng mình đã gỡ một tin nhắn của bạn',
  'safety.removedNote.thing': 'Chúng mình đã gỡ một thứ bạn chia sẻ',
  'safety.removedNote.where': '{farm} · {day}',
  'safety.removedNote.visit': 'Một lần ghé thăm · {day}',
  'safety.removedNote.hidden': 'Được ẩn ở đây để không làm đau thêm lần nữa.',
  'safety.removedNote.show': 'Hiện ra',
  'safety.removedNote.rule': 'Nội quy nào',
  'safety.removedNote.account': 'Tài khoản của bạn',
  'safety.removedNote.unchanged': 'Vẫn là của bạn, và không có gì khác thay đổi.',
  'safety.removedNote.warned': 'Vẫn là của bạn. Hãy xem đây là một lời nhắc nhẹ nhàng.',
  'safety.removedNote.paused':
    'Bạn vẫn đọc được các nông trại, nhưng chưa đăng được cho đến {day}.',
  'safety.removedNote.removed': 'Bạn không còn ở {farm}. Các nông trại khác vẫn như cũ.',
  'safety.removedNote.appealText':
    'Nếu bạn nghĩ chúng mình đã sai, hãy cho biết vì sao. Một người không tham gia quyết định đầu tiên sẽ đọc trong vòng 7 ngày.',
  'safety.removedNote.appeal': 'Xin xem xét lại',
  'safety.removedNote.okay': 'Được rồi',
  'safety.rule.number': 'Nội quy số {n}.',
  'safety.rule.3': 'Nội quy số 3: hãy tử tế. Không bắt nạt hay quấy rối.',
  'safety.rule.4': 'Nội quy số 4: không thù ghét.',
  'safety.rule.6': 'Nội quy số 6: không thư rác hay lừa đảo.',
  'safety.rule.child_safety': 'Giữ an toàn cho trẻ em.',
  'safety.rule.self_harm': 'Quan tâm đến những người có thể gặp nguy hiểm.',
  'safety.rule.credible_threat': 'Không đe doạ sự an toàn của bất kỳ ai.',
  'safety.rule.legal': 'Pháp luật nơi bạn sống.',
  'safety.appeal.title': 'Xin xem xét lại',
  'safety.appeal.lead':
    'Cho chúng mình biết vì sao bạn nghĩ chúng mình đã sai. Một người khác sẽ đọc trong vòng 7 ngày.',
  'safety.appeal.placeholder': 'Chúng mình nên biết điều gì?',
  'safety.appeal.send': 'Gửi',
  'safety.appeal.sent': 'Đã gửi. Một người mới sẽ đọc trong vòng 7 ngày.',
  'safety.appeal.already': 'Bạn đã xin xem xét lại điều này rồi.',
  'safety.appealed.title': 'Chúng mình đã xem lại',
  'safety.appealed.undone': 'Bạn đã đúng, và chúng mình đã đưa nó trở lại.',
  'safety.appealed.kept': 'Chúng mình đã xem lại, và quyết định vẫn giữ nguyên.',
};

/** A place and a day, joined the same way in both languages. */
export const safetySameInBoth = [
  'safety.removedNote.where',
] as const satisfies readonly (keyof typeof safetyEn)[];
