import type { ViCatalogue } from './catalogue-types';
import type { onboardingEn } from './onboarding.en';

export const onboardingVi: ViCatalogue<typeof onboardingEn> = {
  'onboarding.back': 'Quay lại',
  'onboarding.skip': 'Bỏ qua',
  'onboarding.done': 'Xong',
  'onboarding.continue': 'Tiếp tục',
  'onboarding.step': 'Bước {step} trên {steps}',
  'onboarding.failed': 'Chưa được rồi. Thử lại sau một lát nhé.',

  'onboarding.welcome.body':
    'Một nông trại nhỏ bạn cùng chăm với bạn bè. Mỗi lời chào, tấm ảnh và cái vẫy tay đều giúp nó lớn lên.',
  'onboarding.welcome.start': 'Lập một nông trại',
  'onboarding.welcome.invite': 'Tôi có lời mời',

  'onboarding.invite.title': 'Bạn có đường dẫn nông trại?',
  'onboarding.invite.body': 'Dán đường dẫn bạn bè gửi, chúng mình sẽ đưa bạn đến cổng nhà họ.',
  'onboarding.invite.field': 'Đường dẫn',
  'onboarding.invite.placeholder': 'kithfield.com/i/…',
  'onboarding.invite.open': 'Mở lời mời',
  'onboarding.invite.notALink':
    'Có vẻ đây không phải đường dẫn nông trại. Kiểm tra lại rồi thử lần nữa nhé.',

  'onboarding.join.title': '{name} đã giữ cho bạn một căn nhà',
  'onboarding.join.titleNoName': 'Một căn nhà đang chờ bạn',
  'onboarding.join.body': 'Ở {farm}. Căn nhà đang sáng đèn là của bạn.',
  'onboarding.join.accept': 'Nhận căn nhà',
  'onboarding.join.full.title': 'Nông trại này đã đầy',
  'onboarding.join.full.body':
    '{farm} đã có đủ bạn thú rồi. Hỏi bạn của bạn xem sao, hoặc lập một nông trại của riêng bạn.',
  'onboarding.join.gone.title': 'Lời mời này đã ngủ yên',
  'onboarding.join.gone.body':
    'Đường dẫn đã bị thu lại, dùng hết hoặc hết hạn. Hãy xin bạn của bạn một đường dẫn mới.',
  'onboarding.join.startInstead': 'Lập nông trại của riêng mình',
  'onboarding.join.unreachable.title': 'Con đường tạm thời bị cuốn trôi',
  'onboarding.join.unreachable.body':
    'Chúng mình chưa đến được nông trại. Kiểm tra kết nối rồi thử lại nhé.',
  'onboarding.join.tryAgain': 'Thử lại',
  'onboarding.join.waiting.title': 'Bạn đã gõ cổng rồi',
  'onboarding.join.waiting.body':
    'Người giữ trại của {farm} sẽ mở cổng cho bạn thú mới. Căn nhà của bạn sẵn sàng ngay khi cổng mở.',

  'onboarding.signIn.title': 'Chìa khóa mở cổng',
  'onboarding.signIn.body':
    'Đăng nhập để nông trại theo bạn sang điện thoại mới. Chúng mình không bao giờ đăng gì, và bạn bè chỉ thấy bạn thú của bạn.',
  'onboarding.signIn.apple': 'Tiếp tục với Apple',
  'onboarding.signIn.google': 'Tiếp tục với Google',
  'onboarding.signIn.email': 'Tiếp tục với email',
  'onboarding.signIn.agree': 'Khi tiếp tục, bạn đồng ý với {rules} và {privacy}.',
  'onboarding.signIn.rules': 'nội quy',
  'onboarding.signIn.privacy': 'lời hứa về quyền riêng tư',
  'onboarding.signIn.failed': 'Chưa được rồi. Thử lại hoặc dùng email nhé.',

  'onboarding.email.title': 'Otis nên bay đến đâu?',
  'onboarding.email.body':
    'Chúng mình sẽ gửi mã sáu chữ số đến email của bạn. Email chỉ dùng để cho bạn vào.',
  'onboarding.email.field': 'Email',
  'onboarding.email.placeholder': 'ban@vidu.com',
  'onboarding.email.send': 'Gửi mã cho tôi',
  'onboarding.email.invalid': 'Có vẻ đây không phải địa chỉ email.',

  'onboarding.code.title': 'Xem hộp thư nhé',
  'onboarding.code.body': 'Otis đã mang mã sáu chữ số đến {email}.',
  'onboarding.code.field': 'Mã sáu chữ số',
  'onboarding.code.resendLead': 'Chưa nhận được?',
  'onboarding.code.resend': 'Gửi mã khác',
  'onboarding.code.otherEmail': 'Dùng email khác',
  'onboarding.code.note': 'Mã sẽ tự điền từ ứng dụng Mail. Mã dùng được trong 10 phút.',
  'onboarding.code.wrong': 'Mã chưa khớp. Thử lại nhé.',
  'onboarding.code.sent': 'Một mã mới đang trên đường đến.',

  'onboarding.age.title': 'Sinh nhật bạn là khi nào?',
  'onboarding.age.body':
    'Kithfield dành cho người từ 13 tuổi (16 tuổi ở một số nước). Chỉ ngày và tháng được hiện, và chỉ khi bạn bật hoa sinh nhật.',
  'onboarding.age.day': 'Ngày',
  'onboarding.age.month': 'Tháng',
  'onboarding.age.year': 'Năm',
  'onboarding.age.bloom': 'Nở hoa vào sinh nhật tôi',
  'onboarding.age.bloomBody': 'Bạn bè thấy một bông hồng trên căn nhà của bạn',
  'onboarding.age.note':
    'Nếu bạn chưa đủ tuổi ở nước mình, chúng mình sẽ nói nhẹ nhàng và không lưu gì cả.',
  'onboarding.month.1': 'Tháng 1',
  'onboarding.month.2': 'Tháng 2',
  'onboarding.month.3': 'Tháng 3',
  'onboarding.month.4': 'Tháng 4',
  'onboarding.month.5': 'Tháng 5',
  'onboarding.month.6': 'Tháng 6',
  'onboarding.month.7': 'Tháng 7',
  'onboarding.month.8': 'Tháng 8',
  'onboarding.month.9': 'Tháng 9',
  'onboarding.month.10': 'Tháng 10',
  'onboarding.month.11': 'Tháng 11',
  'onboarding.month.12': 'Tháng 12',

  'onboarding.tooYoung.title': 'Hẹn gặp lại khi bạn lớn hơn nhé',
  'onboarding.tooYoung.body':
    'Ở nơi bạn sống, Kithfield dành cho người lớn hơn một chút. Những gì bạn nhập không được lưu lại, và nông trại vẫn sẽ ở đây khi đến lượt bạn.',

  'onboarding.rules.title': 'Nội quy',
  'onboarding.rules.heading': 'Bản ngắn gọn',
  'onboarding.rules.kind.title': 'Tử tế ở mọi nông trại',
  'onboarding.rules.kind.body':
    'Không bắt nạt, thù ghét hay làm phiền. Người giữ trại và đội ngũ của chúng mình có thể mời ra những ai khiến nông trại thấy không an toàn.',
  'onboarding.rules.yours.title': 'Tin nhắn là của bạn',
  'onboarding.rules.yours.body':
    'Tin nhắn được mã hóa khi gửi đi và khi lưu trữ, và chúng mình không bao giờ bán hay quảng cáo bằng dữ liệu của bạn. Chúng không được mã hóa đầu cuối, để tìm kiếm và báo cáo an toàn hoạt động được.',
  'onboarding.rules.fire.title': 'Bên lửa không ghi lại gì',
  'onboarding.rules.fire.body':
    'Phòng thoại và đèn lồng không được ghi hay lưu lại. Phụ đề chỉ bật khi bạn đồng ý.',
  'onboarding.rules.leave.title': 'Rời đi bất cứ khi nào',
  'onboarding.rules.leave.body': 'Tải về những kỷ niệm của bạn và xóa mọi thứ.',
  'onboarding.rules.terms': 'Điều khoản dịch vụ',
  'onboarding.rules.termsBody': 'Nội quy đầy đủ · cập nhật {date}',
  'onboarding.rules.privacy': 'Chính sách quyền riêng tư',
  'onboarding.rules.privacyBody': 'Mọi thứ chúng mình thu thập và lý do',

  'onboarding.critter.title': 'Bạn là ai trên nông trại?',
  'onboarding.critter.next': 'Tiếp: biến bạn thú thành của bạn',

  'onboarding.look.title': 'Biến thành của bạn',
  'onboarding.look.your': '{critter} của bạn',
  'onboarding.look.name': 'Tên trên nông trại:',
  'onboarding.look.nameAdd': 'thêm tên',
  'onboarding.look.namePrompt': 'Tên của bạn trên nông trại',
  'onboarding.look.namePromptBody': 'Bạn bè thấy tên này cạnh bạn thú của bạn.',
  'onboarding.look.save': 'Lưu',
  'onboarding.look.cancel': 'Hủy',
  'onboarding.look.coat': 'Bộ lông',
  'onboarding.look.markings': 'Hoa văn',
  'onboarding.look.accessory': 'Phụ kiện',
  'onboarding.look.twinNamed':
    'Bạn trông giống hệt {name}, người đã sống ở đây. Thử bộ lông hay phụ kiện khác nhé?',
  'onboarding.look.twin':
    'Có người ở nông trại này trông giống hệt bạn. Thử bộ lông hay phụ kiện khác nhé?',
  'onboarding.look.alikeNamed':
    '{name} cũng là {critter} ở nông trại này. Hai bạn vẫn dễ phân biệt.',
  'onboarding.look.alike': 'Ở nông trại này cũng có một {critter} khác. Hai bạn vẫn dễ phân biệt.',
  'onboarding.look.moveIn': 'Dọn vào',
  'onboarding.look.needName': 'Thêm tên của bạn trên nông trại trước nhé.',

  'onboarding.notifications.eyebrow': 'một điều nhỏ thôi',
  'onboarding.notifications.title': 'Otis gõ cửa khi có chuyện quan trọng nhé?',
  'onboarding.notifications.body': 'Chỉ những điều một người bạn sẽ nói trực tiếp với bạn.',
  'onboarding.notifications.plan': 'Một kế hoạch đã có ngày và chờ bạn đồng ý',
  'onboarding.notifications.doorstep': 'Ai đó để lại gì đó trước cửa nhà bạn',
  'onboarding.notifications.fire': 'Lửa đã nhóm cho buổi gặp hôm nay',
  'onboarding.notifications.never': 'Không bao giờ “lâu rồi bạn chưa đăng gì”',
  'onboarding.notifications.yes': 'Được, gõ nhẹ thôi',
  'onboarding.notifications.no': 'Để sau',
  'onboarding.ask.next': 'Tiếp theo, iPhone cũng sẽ hỏi bạn.',

  'onboarding.farm.title': 'Giữ chỗ cho những người thân',
  'onboarding.farm.body':
    'Những căn nhà phác thảo sẽ thành thật khi bạn bè dọn vào. Ai đến cũng mang theo một bạn thú.',
  'onboarding.farm.name': 'Tên nông trại',
  'onboarding.farm.placeholder': 'Đặt tên nông trại',
  'onboarding.farm.message':
    '{name} đã lập một nông trại và giữ cho bạn một căn nhà. Đến làm bạn thú nhé?',
  'onboarding.farm.linkSoon': 'kithfield.com/i/…',
  'onboarding.farm.note':
    'Không chuỗi ngày, không thông báo đã đọc. Chỉ một nông trại vui vì bạn đến.',
  'onboarding.farm.copy': 'Sao chép',
  'onboarding.farm.share': 'Gửi lời mời',
  'onboarding.farm.copied': 'Đã sao chép đường dẫn',
  'onboarding.farm.needName': 'Đặt tên cho nông trại trước nhé.',

  'onboarding.contacts.eyebrow': 'tìm những người thân',
  'onboarding.contacts.title': 'Để Pim tìm bạn bè cho bạn nhé?',
  'onboarding.contacts.body':
    'Pim xem danh bạ ngay trên điện thoại này, để bạn mời từng người một. Không ai nhận được tin nhắn trừ khi bạn gửi lời mời.',
  'onboarding.contacts.stay': 'Danh bạ ở lại trên điện thoại này',
  'onboarding.contacts.choose': 'Bạn chọn mời ai, từng người một',
  'onboarding.contacts.never': 'Chúng mình không bao giờ tải danh bạ lên',
  'onboarding.contacts.yes': 'Tìm bạn bè',
  'onboarding.contacts.no': 'Gửi đường dẫn thay vào đó',

  'onboarding.friends.title': 'Tìm những người thân',
  'onboarding.friends.search': 'Tìm trong danh bạ',
  'onboarding.friends.notHere': 'Chưa có ở đây',
  'onboarding.friends.byText': 'Nhận đường dẫn qua tin nhắn',
  'onboarding.friends.invite': 'Mời',
  'onboarding.friends.invited': 'Đã mời',
  'onboarding.friends.done': 'Xong',
  'onboarding.friends.doneInvited': { other: 'Xong · đã mời {count}' },
  'onboarding.friends.none': 'Chưa có ai để hiện',
  'onboarding.friends.noneBody': 'Hãy gửi đường dẫn của nông trại, bạn bè ở đâu cũng nhận được.',
  'onboarding.friends.denied': 'Pim chưa xem được danh bạ',
  'onboarding.friends.deniedBody':
    'Bạn có thể cho phép trong Cài đặt bất cứ lúc nào, hoặc gửi đường dẫn của nông trại.',
  'onboarding.friends.shareLink': 'Gửi đường dẫn',

  'onboarding.photos.eyebrow': 'khi bạn chạm + ảnh',
  'onboarding.photos.title': 'Fig rất muốn được xem',
  'onboarding.photos.body': 'Chọn ảnh mỗi lần bạn chia sẻ. Kithfield chỉ thấy những tấm bạn chọn.',
  'onboarding.photos.picker': 'Chọn trong trình chọn ảnh, không cần quyền vào thư viện',
  'onboarding.photos.recent': 'Hoặc cho phép để ảnh gần đây hiện trong khay',
  'onboarding.photos.yes': 'Chọn ảnh',
  'onboarding.photos.no': 'Cho phép xem ảnh gần đây',

  'onboarding.location.eyebrow': 'chỉ khi bạn muốn',
  'onboarding.location.title': 'Cần một chiếc đèn lồng dẫn đường?',
  'onboarding.location.body':
    'Vào ngày gặp mặt, Rue có thể chỉ đường từ chỗ bạn đang đứng. Không có gì được chia sẻ với nông trại, không bao giờ.',
  'onboarding.location.heading': 'Chỉ khi bạn đang trên đường đến buổi gặp',
  'onboarding.location.off': 'Tự tắt khi bạn đến nơi',
  'onboarding.location.never': 'Không chia sẻ vị trí trực tiếp',
  'onboarding.location.yes': 'Cho phép khi dùng ứng dụng',
  'onboarding.location.no': 'Bỏ qua, tôi biết đường',
};

/** An email field and a link's shape read the same in both languages. */
export const onboardingSameInBoth = [
  'onboarding.email.field',
  'onboarding.invite.placeholder',
  'onboarding.farm.linkSoon',
] as const satisfies readonly (keyof typeof onboardingEn)[];
