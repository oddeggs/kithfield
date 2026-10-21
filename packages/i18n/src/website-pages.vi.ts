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
  'websitePages.waitlist.submit': 'Vào danh sách chờ',

  'websitePages.thanks.title': 'Trong lúc chờ, bạn là bé nào?',
  'websitePages.thanks.kicker': 'bạn đã có tên trong danh sách',
  'websitePages.thanks.pendingKicker': 'còn một bước nữa',
  'websitePages.thanks.pending': 'Mở hộp thư nhé: bấm vào link trong thư để giữ chỗ của bạn.',
  'websitePages.thanks.body':
    'Chọn bé của bạn ngay bây giờ, bé sẽ đợi sẵn khi cổng mở. Sau này đổi ý cũng được.',
  'websitePages.thanks.save': 'Giữ {name} con {kind} cho mình',
  'websitePages.thanks.saveSoon': 'Sắp có thể giữ bé trước.',

  'websitePages.letter.subject': 'Xác nhận chỗ của bạn ở cổng Kithfield',
  'websitePages.letter.greeting': 'Xin chào từ nông trại!',
  'websitePages.letter.ask': 'Bấm vào link này để giữ căn nhà cho bạn:',
  'websitePages.letter.once':
    'Tụi mình sẽ viết thêm đúng một lần, khi Kithfield mở cửa gần bạn. Không bản tin.',
  'websitePages.letter.notYou':
    'Nếu bạn không yêu cầu, cứ để lá thư này lại, tụi mình sẽ quên email của bạn.',
  'websitePages.letter.signOff': 'Bác cú ở Kithfield',
  'websitePages.confirm.title': 'Đang xác nhận chỗ của bạn',
  'websitePages.confirm.working': 'Đang kiểm tra link…',
  'websitePages.confirm.expired':
    'Link này đã hết hạn hoặc đã được dùng. Giữ chỗ lại nhé, tụi mình sẽ gửi link mới.',
  'websitePages.confirm.again': 'Giữ chỗ lại',
  'websitePages.confirm.error': 'Cổng chưa trả lời. Thử lại chút nữa nhé.',
  'websitePages.confirm.retry': 'Thử lại',
  'websitePages.notFound.title': 'Lối này chẳng dẫn tới đâu',
  'websitePages.notFound.body': 'Trang này có thể đã dời đi, hoặc link bị gõ nhầm.',
  'websitePages.notFound.home': 'Về lại nông trại',

  'websitePages.privacy.title': 'Lời hứa về quyền riêng tư',
  'websitePages.privacy.lead':
    'Cập nhật ngày 18 tháng 10 năm 2026. Nói ngắn gọn: tin nhắn là của bạn, và tụi mình không bao giờ bán hay dùng dữ liệu của bạn để quảng cáo.',
  'websitePages.privacy.keepTitle': 'Những gì tụi mình giữ',
  'websitePages.privacy.keep':
    'Tài khoản của bạn (email, hoặc đăng nhập Apple hay Google), ngày sinh hoặc lần xác nhận tuổi và lúc bạn đồng ý nội quy, bé của bạn, các nông trại bạn tham gia, và những gì bạn chia sẻ ở đó: tin nhắn, ảnh và tin thoại. Tụi mình cũng giữ mã thông báo đẩy của thiết bị, những gì bạn đã mua và những gì chúng mở khoá, cùng các báo cáo bạn gửi hoặc người khác gửi về bạn. Tất cả được mã hoá khi truyền đi và khi lưu trữ. Đây không phải mã hoá đầu cuối: máy chủ của tụi mình đọc được, để tìm kiếm, báo cáo an toàn và các tính năng bạn chọn hoạt động được.',
  'websitePages.privacy.neverTitle': 'Những gì tụi mình không bao giờ làm',
  'websitePages.privacy.never':
    'Không quảng cáo, không bán dữ liệu, không môi giới dữ liệu, không ghi âm bên đống lửa. Phụ đề và bản tóm tắt Chủ nhật luôn tắt cho tới khi bạn đồng ý, và chỉ khi đó lời của bạn mới rời nông trại cho các tính năng này.',
  'websitePages.privacy.partnersTitle': 'Ai giúp tụi mình',
  'websitePages.privacy.partners':
    'Cloudflare vận hành máy chủ và lưu dữ liệu của bạn. Expo chuyển thông báo tới Apple và Google. LiveKit truyền giọng nói bên đống lửa. RevenueCat ghi nhận các giao dịch mua. Apple và Google đăng nhập cho bạn khi bạn chọn họ. Mỗi bên chỉ nhận đúng những gì công việc của họ cần.',
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
    'Tụi mình không dung thứ nội dung phản cảm hay người cư xử tệ: không bắt nạt, thù ghét, quấy rối, đe doạ, làm phiền người khác, nội dung tình dục, bạo lực, cổ vũ tự làm hại bản thân hay bất cứ điều gì phạm pháp. Mọi hình thức xâm hại và bóc lột tình dục trẻ em đều bị cấm, và tụi mình báo cáo chúng cho cơ quan chức năng (xem {link}). Báo cáo ngay trong ứng dụng, tụi mình xử lý trong vòng một ngày: gỡ nội dung và đóng tài khoản đăng nó. Chủ nông trại cũng có thể mời các bé rời đi.',
  'websitePages.terms.childSafetyLink': 'tiêu chuẩn an toàn trẻ em',
  'websitePages.terms.purchasesTitle': 'Mua sắm',
  'websitePages.terms.purchases':
    'Plus và các món đồ được bán qua App Store và Google Play. Đồ bạn mua là của bạn chừng nào Kithfield còn hoạt động.',
  'websitePages.terms.leavingTitle': 'Rời đi',
  'websitePages.terms.leaving':
    'Bạn có thể lặng lẽ rời bất kỳ nông trại nào, hoặc xoá tài khoản. Xoá tài khoản bắt đầu 30 ngày chờ, trong thời gian đó đăng nhập lại là huỷ; sau đó tụi mình xoá dữ liệu của bạn.',

  'websitePages.childSafety.title': 'Tiêu chuẩn an toàn trẻ em',
  'websitePages.childSafety.lead':
    'Cập nhật ngày 21 tháng 10 năm 2026. Kithfield tuyệt đối không dung thứ việc xâm hại và bóc lột tình dục trẻ em (CSAE). Tụi mình gỡ bỏ nội dung đó, đóng các tài khoản đứng sau nó và báo cáo cho cơ quan chức năng.',
  'websitePages.childSafety.neverTitle': 'Những điều không bao giờ được phép',
  'websitePages.childSafety.never':
    'Xâm hại và bóc lột tình dục trẻ em dưới mọi hình thức: chia sẻ, xin hay gửi link tới tài liệu xâm hại tình dục trẻ em (CSAM), kể cả hình vẽ hay hình do AI tạo ra; tin nhắn tình dục gửi tới hoặc nói về người dưới 18 tuổi; dụ dỗ, tức là làm quen với người trẻ để xâm hại họ; tống tiền tình dục, tức là doạ phát tán hình ảnh của ai đó; và bất cứ điều gì khác tình dục hoá trẻ em. Dù chỉ là đùa, hay ai là người gửi, cũng vậy.',
  'websitePages.childSafety.ageTitle': 'Kithfield dành cho ai',
  'websitePages.childSafety.age':
    'Kithfield dành cho những nhóm bạn từ 13 tuổi trở lên, hoặc lớn hơn nếu luật nơi bạn ở quy định tuổi cao hơn (tới 16 tuổi). Tụi mình hỏi năm sinh khi bạn tham gia và không nhận người chưa đủ tuổi. Nếu biết một tài khoản thuộc về người dưới độ tuổi đó, tụi mình sẽ đóng tài khoản.',
  'websitePages.childSafety.reportTitle': 'Cách báo cáo',
  'websitePages.childSafety.report':
    'Trong ứng dụng, nhấn giữ tin nhắn, ảnh hay tin thoại, hoặc mở thẻ của bé và chạm Thêm, rồi Báo cáo, và chọn “Nội dung hoặc hành vi tình dục liên quan đến trẻ vị thành niên”. Những báo cáo này được đưa thẳng lên đầu hàng chờ của đội an toàn, với mục tiêu xem trong vòng một giờ, và người bị báo cáo không bao giờ biết ai đã báo cáo. Bạn cũng có thể viết tới {email}, dù bạn có dùng Kithfield hay không. Xin đừng gửi hình ảnh cho tụi mình: hãy cho biết nông trại, người đó và khoảng thời gian, tụi mình sẽ tự tìm.',
  'websitePages.childSafety.actTitle': 'Tụi mình làm gì',
  'websitePages.childSafety.act':
    'Một người trong đội an toàn xem xét từng báo cáo. Khi phát hiện xâm hại hay bóc lột tình dục trẻ em, tụi mình gỡ nội dung ngay, đưa các tài khoản liên quan ra khỏi Kithfield vĩnh viễn, và có thể đóng băng một nông trại trong lúc xem xét. Tin nhắn bị báo cáo được sao lại ngay lúc báo cáo, nên thu hồi tin nhắn không xoá được bằng chứng. Với một vụ việc về an toàn trẻ em, tụi mình giữ bản sao đó và ghi chú của người báo cáo trong suốt thời gian vụ việc còn mở và thêm một năm sau khi đóng, kể cả khi một tài khoản liên quan bị xoá, rồi mới xoá đi. Ảnh được cất riêng ở nơi mà thu hồi, xoá tài khoản hay xoá nông trại đều không chạm tới, và ở đó cho tới khi tụi mình tự tay xoá lúc luật không còn yêu cầu giữ. Tụi mình báo cáo những gì phát hiện cho Trung tâm Quốc gia về Trẻ em Mất tích và Bị bóc lột của Hoa Kỳ (NCMEC) cùng công an hoặc cơ quan chức năng nơi áp dụng. Tụi mình tuân thủ luật bảo vệ trẻ em ở mọi nơi Kithfield có mặt.',
  'websitePages.childSafety.scanTitle': 'Ảnh được kiểm tra',
  'websitePages.childSafety.scan':
    'Ảnh chia sẻ trong Kithfield được đối chiếu với dấu vân tay của các hình ảnh xâm hại tình dục trẻ em đã biết, bằng Công cụ quét CSAM của Cloudflare. Ảnh trùng khớp bị chặn ngay; sau đó tụi mình cất riêng ảnh làm bằng chứng và mở một vụ việc khẩn cấp cho đội an toàn.',
  'websitePages.childSafety.contactTitle': 'Liên hệ về an toàn trẻ em',
  'websitePages.childSafety.contact':
    'Viết tới {email} về bất cứ điều gì trên trang này. Thư tới thẳng những người phụ trách đội an toàn, những người có thể trả lời về cách Kithfield phòng ngừa và xử lý xâm hại, bóc lột tình dục trẻ em. Nếu một đứa trẻ đang gặp nguy hiểm ngay lúc này, hãy gọi số khẩn cấp ở nơi bạn trước.',

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
  'websitePages.press.wordmark': 'Chữ logo · PNG',
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
