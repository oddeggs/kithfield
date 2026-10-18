import type { ViCatalogue } from './catalogue-types';
import type { websitePagesEn } from './website-pages.en';

export const websitePagesVi: ViCatalogue<typeof websitePagesEn> = {
  'websitePages.switch': 'EN · VI',

  'websitePages.invite.title': 'Lời mời vào Kithfield',
  'websitePages.invite.kicker': 'bạn được mời',
  'websitePages.invite.headline': 'Một căn nhà đang chờ bạn ở {farm}',
  'websitePages.invite.members': {
    other: '{count} bé đang sống ở đây. Vào ngay trên trình duyệt, hoặc tải ứng dụng.',
  },
  'websitePages.invite.approval':
    'Chủ nông trại sẽ mở cổng cho bạn mới, nên có thể bạn phải đợi ở cổng một chút.',
  'websitePages.invite.browser': 'Vào bằng trình duyệt →',
  'websitePages.invite.appStore': 'App Store',
  'websitePages.invite.googlePlay': 'Google Play',
  'websitePages.invite.private':
    'Đường link này chỉ dành cho nông trại. Chỉ bạn bè của chủ nhà mới có.',
  'websitePages.invite.loading': 'Đang mở cổng…',
  'websitePages.invite.full': 'Các căn nhà ở {farm} đã kín chỗ. Nhờ bạn mình dọn chỗ nhé.',
  'websitePages.invite.closedTitle': 'Cổng này đã đóng',
  'websitePages.invite.closedBody':
    'Đường link đã hết hạn hoặc đã được thu lại. Xin bạn mình link mới, hoặc tự giữ một chỗ ở cổng.',
  'websitePages.invite.closedCta': 'Giữ chỗ cho mình',
  'websitePages.invite.error': 'Cổng chưa trả lời. Kiểm tra kết nối rồi thử lại nhé.',
  'websitePages.invite.retry': 'Thử lại',

  'websitePages.waitlist.title': 'Giữ một chỗ ở cổng',
  'websitePages.waitlist.kicker': 'vào đi, vào đi',
  'websitePages.waitlist.body':
    'Tụi mình sẽ viết đúng một lần khi Kithfield mở cửa gần bạn. Không bản tin.',
  'websitePages.waitlist.email': 'Email',
  'websitePages.waitlist.iphone': 'Mình dùng iPhone',
  'websitePages.waitlist.submit': 'Vào danh sách chờ',

  'websitePages.thanks.title': 'Trong lúc chờ, bạn là bé nào?',
  'websitePages.thanks.kicker': 'bạn đã có tên trong danh sách',
  'websitePages.thanks.body':
    'Chọn bé của bạn ngay bây giờ, bé sẽ đợi sẵn khi cổng mở. Sau này đổi ý cũng được.',
  'websitePages.thanks.save': 'Giữ {name} con {kind} cho mình',
  'websitePages.thanks.saveSoon':
    'Sắp có thể giữ bé trước. Thư xác nhận email đang trên đường tới bạn.',
  'websitePages.thanks.share':
    'Rủ bạn bè: ai vào từ link của bạn sẽ có một căn nhà ngay cạnh nhà bạn.',
  'websitePages.thanks.confirmed': 'Email của bạn đã được xác nhận. Hẹn gặp ở cổng.',

  'websitePages.letter.subject': 'Xác nhận chỗ của bạn ở cổng Kithfield',
  'websitePages.letter.greeting': 'Xin chào từ nông trại!',
  'websitePages.letter.ask': 'Bấm vào link này để giữ căn nhà cho bạn:',
  'websitePages.letter.once':
    'Tụi mình sẽ viết thêm đúng một lần, khi Kithfield mở cửa gần bạn. Không bản tin.',
  'websitePages.letter.notYou':
    'Nếu bạn không yêu cầu, cứ để lá thư này lại, tụi mình sẽ quên email của bạn.',
  'websitePages.letter.signOff': 'Bác cú ở Kithfield',

  'websitePages.privacy.title': 'Lời hứa về quyền riêng tư',
  'websitePages.privacy.lead':
    'Cập nhật ngày 1 tháng 10 năm 2026. Nói ngắn gọn: tin nhắn là của bạn, và tụi mình không bao giờ bán hay dùng dữ liệu của bạn để quảng cáo.',
  'websitePages.privacy.keepTitle': 'Những gì tụi mình giữ',
  'websitePages.privacy.keep':
    'Tài khoản của bạn (email, hoặc đăng nhập Apple hay Google), bé của bạn, các nông trại bạn tham gia, và những gì bạn chia sẻ ở đó: tin nhắn, ảnh và tin thoại. Tất cả được mã hoá khi truyền đi và khi lưu trữ. Đây không phải mã hoá đầu cuối: máy chủ của tụi mình đọc được, để tìm kiếm, báo cáo an toàn và các tính năng bạn chọn hoạt động được.',
  'websitePages.privacy.neverTitle': 'Những gì tụi mình không bao giờ làm',
  'websitePages.privacy.never':
    'Không quảng cáo, không bán dữ liệu, không môi giới dữ liệu, không ghi âm bên đống lửa. Phụ đề và bản tóm tắt Chủ nhật luôn tắt cho tới khi bạn đồng ý, và chỉ khi đó lời của bạn mới rời nông trại cho các tính năng này.',
  'websitePages.privacy.waitlistTitle': 'Danh sách chờ',
  'websitePages.privacy.waitlist':
    'Nếu bạn giữ chỗ, tụi mình giữ email của bạn để viết đúng một lần khi Kithfield mở cửa, rồi xoá đi. Email không được xác nhận sẽ bị xoá sau một tuần. Tụi mình chỉ giữ lại một dấu vân tay có khoá của email, để bé bạn chọn trước tìm được bạn khi bạn đăng ký.',
  'websitePages.privacy.choicesTitle': 'Lựa chọn của bạn',
  'websitePages.privacy.choices':
    'Tải kỷ niệm về hoặc xoá tài khoản bất cứ lúc nào, trong ứng dụng hoặc {link}.',
  'websitePages.privacy.onTheWeb': 'trên web',

  'websitePages.terms.title': 'Nội quy',
  'websitePages.terms.lead':
    'Kithfield dành cho những nhóm bạn đã quen biết nhau. Bạn phải từ 13 tuổi trở lên (16 tuổi nếu luật nơi bạn ở yêu cầu).',
  'websitePages.terms.kindTitle': 'Tử tế ở mọi nông trại',
  'websitePages.terms.kind':
    'Không bắt nạt, thù ghét, quấy rối hay làm phiền người khác. Chủ nông trại có thể mời các bé rời đi; tụi mình có thể đóng tài khoản vi phạm nội quy.',
  'websitePages.terms.purchasesTitle': 'Mua sắm',
  'websitePages.terms.purchases':
    'Plus và các món đồ được bán qua App Store và Google Play. Đồ bạn mua là của bạn chừng nào Kithfield còn hoạt động.',
  'websitePages.terms.leavingTitle': 'Rời đi',
  'websitePages.terms.leaving':
    'Bạn có thể lặng lẽ rời bất kỳ nông trại nào, hoặc xoá tài khoản. Tụi mình xoá dữ liệu của bạn trong vòng 30 ngày.',

  'websitePages.support.title': 'Trợ giúp và câu hỏi',
  'websitePages.support.search': 'Tìm trợ giúp',
  'websitePages.support.farms': 'Nông trại và các bé',
  'websitePages.support.chats': 'Trò chuyện và ghé thăm',
  'websitePages.support.fire': 'Bên đống lửa',
  'websitePages.support.plans': 'Hẹn hò và hạt giống',
  'websitePages.support.patrons': 'Ủng hộ và mua sắm',
  'websitePages.support.safety': 'Quyền riêng tư và an toàn',
  'websitePages.support.popular': 'Hay được hỏi',
  'websitePages.support.asleepQ': 'Sao bé của mình lại ngủ?',
  'websitePages.support.asleepA':
    'Các bé ngủ gật khi chủ của mình im lặng một thời gian. Không mất gì cả và chẳng ai đếm: mở nông trại hay chào một tiếng là bé thức dậy, được đón thật ấm.',
  'websitePages.support.moveQ': 'Làm sao để rủ bạn về nông trại của mình?',
  'websitePages.support.moveA':
    'Mở nông trại, chạm vào cổng và gửi link mời. Bạn của bạn chọn một bé rồi dọn vào một căn nhà. Mỗi nông trại có chỗ cho 24 bé.',
  'websitePages.support.webQ': 'Dùng Kithfield mà không cần ứng dụng được không?',
  'websitePages.support.webA':
    'Được. Link mời cũng mở nông trại ngay trên trình duyệt, nên bạn có thể vào từ máy tính rồi tải ứng dụng sau.',
  'websitePages.support.stickersQ': 'Làm sao đưa sticker vào WhatsApp?',
  'websitePages.support.stickersA':
    'Trong ứng dụng, mở một bộ sticker và chạm Thêm vào WhatsApp. Bộ sticker được lưu ở đó với đúng các bé ấy.',
  'websitePages.support.empty': 'Chưa có gì khớp. Viết cho người thật ở dưới nhé.',
  'websitePages.support.stuck': 'Vẫn chưa xong? Viết cho một người thật →',

  'websitePages.delete.title': 'Yêu cầu xoá tài khoản',
  'websitePages.delete.lead':
    'Bạn có thể làm việc này trong ứng dụng (Bạn › Cài đặt › Xoá tài khoản). Nếu không mở được ứng dụng, hãy yêu cầu ở đây và tụi mình sẽ xác nhận qua email trước.',
  'websitePages.delete.label': 'Email của tài khoản',
  'websitePages.delete.critter': 'Bé, tin nhắn, ảnh và sticker của bạn bị xoá',
  'websitePages.delete.cottages': 'Nhà của bạn trở lại thành bản phác thảo ở mọi nông trại',
  'websitePages.delete.days': 'Bạn có 30 ngày để đổi ý',
  'websitePages.delete.purchases': 'Đồ đã mua vẫn ở trong tài khoản Apple hoặc Google của bạn',
  'websitePages.delete.submit': 'Gửi mã xác nhận cho mình',
  'websitePages.delete.foot':
    'Theo yêu cầu của App Store và Google Play. Tụi mình trả lời trong 2 ngày làm việc và hoàn tất trong 30 ngày.',
  'websitePages.delete.sent':
    'Nếu email này có tài khoản, thư kèm mã xác nhận đang trên đường tới. Chưa có gì bị xoá cho tới khi bạn xác nhận.',
  'websitePages.delete.invalid': 'Email này có vẻ chưa đúng.',
  'websitePages.delete.busy': 'Đang có nhiều yêu cầu. Thử lại sau một phút nhé.',
  'websitePages.delete.unreachable':
    'Chưa gửi được lúc này. Thử lại, hoặc viết cho safety@kithfield.com.',

  'websitePages.contact.title': 'Gửi lời chào',
  'websitePages.contact.lead': 'Một người thật đọc từng tin nhắn, thường trong vòng một ngày.',
  'websitePages.contact.name': 'Tên của bạn',
  'websitePages.contact.email': 'Email',
  'websitePages.contact.topic': 'Bạn muốn hỏi về gì?',
  'websitePages.contact.topicHelp': 'Giúp mình với nông trại',
  'websitePages.contact.topicAccount': 'Tài khoản của mình',
  'websitePages.contact.topicPurchases': 'Ủng hộ và mua sắm',
  'websitePages.contact.topicSafety': 'Có điều không an toàn',
  'websitePages.contact.topicOther': 'Chuyện khác',
  'websitePages.contact.message': 'Kể tụi mình nghe chuyện gì đã xảy ra…',
  'websitePages.contact.send': 'Gửi',
  'websitePages.contact.press': 'Báo chí: {email}',
  'websitePages.contact.safety': 'An toàn: {email}',

  'websitePages.press.title': 'Kithfield, cho người viết và bạn bè của nông trại',
  'websitePages.press.kicker': 'tài liệu báo chí',
  'websitePages.press.download': 'Tải tất cả (ZIP)',
  'websitePages.press.blurb':
    'Kithfield là nhóm chat ấm áp, nơi bạn bè là các bé trên một nông trại chung. Làm bởi oddeggs studio. Ra mắt mùa xuân 2027 trên iPhone và Android. Liên hệ {email}.',
  'websitePages.press.wordmark': 'Chữ logo · SVG, PNG',
  'websitePages.press.icon': 'Biểu tượng ứng dụng · 1024 px',
  'websitePages.press.critters': '16 bé · PNG nền trong',
  'websitePages.press.screenshots': 'Ảnh chụp màn hình',
  'websitePages.press.rules':
    'Xin đừng đổi màu các bé hay vẽ lại hình. Đặt hình trên màu giấy #F5EEE2 hoặc màu đêm #1b1f3d.',
};

/** The language switch, store names and the email label read the same in both languages. */
export const websitePagesSameInBoth = [
  'websitePages.switch',
  'websitePages.invite.appStore',
  'websitePages.invite.googlePlay',
  'websitePages.waitlist.email',
  'websitePages.contact.email',
] as const satisfies readonly (keyof typeof websitePagesEn)[];
