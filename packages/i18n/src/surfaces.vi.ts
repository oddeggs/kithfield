import type { ViCatalogue } from './catalogue-types';
import type { surfacesEn } from './surfaces.en';

export const surfacesVi: ViCatalogue<typeof surfacesEn> = {
  'surfaces.native.list.comma': ', ',
  'surfaces.native.list.and': ' và ',

  'surfaces.native.widget.name': 'Nông trại của bạn',
  'surfaces.native.widget.description':
    'Ai đang thức, kế hoạch sắp tới, và đống lửa khi được nhóm.',
  'surfaces.native.widget.empty': 'Mở Kithfield để đưa nông trại của bạn ra đây.',
  'surfaces.native.widget.up': { other: '{names} đang thức' },
  'surfaces.native.widget.asleep': { other: '{names} đang ngủ' },
  'surfaces.native.widget.allAsleep': 'Mọi người đều đang ngủ',
  'surfaces.native.widget.firesLit': 'lửa đã nhóm',
  'surfaces.native.widget.byTheFire': { other: '{names} đang ngồi bên lửa' },
  'surfaces.native.widget.comeSit': 'Chạm để đến ngồi cùng',
  'surfaces.native.widget.byTheFireLabel': 'Bên lửa',
  'surfaces.native.widget.noPlan': 'Chưa có kế hoạch nào',

  'surfaces.native.plan.onTheWay': '{count} người đang đến',
  'surfaces.native.plan.from': 'từ {time}',
  'surfaces.native.plan.there': { other: '{names} đã đến nơi.' },
  'surfaces.native.plan.walking': { other: '{names} đang đi tới.' },
  'surfaces.native.plan.nobodyYet': 'Chưa ai đến nơi.',
  'surfaces.native.you': 'bạn',

  'surfaces.native.fire.title': 'Bên lửa',
  'surfaces.native.fire.talking': '{name} đang nói',
  'surfaces.native.fire.youTalking': 'bạn đang nói',
  'surfaces.native.fire.quiet': 'Yên ắng',
  'surfaces.native.fire.youreMuted': 'bạn đang tắt mic',
  'surfaces.native.fire.mute': 'Tắt mic',
  'surfaces.native.fire.unmute': 'Bật mic',
  'surfaces.native.fire.leave': 'Rời đi',

  'surfaces.native.action.imIn': 'Mình tham gia',
  'surfaces.native.action.cant': 'Lần này mình bận',
  'surfaces.native.action.dewdrop': 'Để lại một giọt sương',

  'surfaces.native.share.photos': { other: '{count} ảnh' },
  'surfaces.native.share.videos': { other: '{count} video' },
  'surfaces.native.share.files': { other: '{count} tệp' },
  'surfaces.native.share.things': { other: '{count} thứ' },
  'surfaces.native.share.link': 'Một đường dẫn',
  'surfaces.native.share.words': 'Vài lời',
  'surfaces.native.share.subtitle': 'Chia sẻ vào Kithfield',
  'surfaces.native.share.send': 'Gửi',
  'surfaces.native.share.cancel': 'Huỷ',
  'surfaces.native.share.sendTo': 'Gửi đến',
  'surfaces.native.share.placeholder': 'Thêm vài lời…',
  'surfaces.native.share.footer': 'Ảnh sẽ mọc thành hoa hướng dương trên nông trại bạn gửi đến.',
  'surfaces.native.share.critters': { other: '{count} bạn thú' },
  'surfaces.native.share.visit': 'ghé thăm',
  'surfaces.native.share.noFarms': 'Mở Kithfield một lần, rồi các nông trại của bạn sẽ hiện ở đây.',
  'surfaces.native.share.tooMany': 'Kithfield nhận tối đa 10 thứ mỗi lần.',

  'surfaces.share.failed': 'Không gửi được nội dung chia sẻ đó.',

  'surfaces.route.title': 'Nghe lửa ở đâu',
  'surfaces.route.connected': 'Đã kết nối',
  'surfaces.route.micOn': 'mic trên {name}',
  'surfaces.route.iphone': 'iPhone',
  'surfaces.route.earpiece': 'Loa trong',
  'surfaces.route.speaker': 'Loa ngoài',
  'surfaces.route.speakerNote': 'Cho cả một phòng đông người',
  'surfaces.route.airplay': 'AirPlay · chỉ nghe',
  'surfaces.route.footer':
    'Tháo một bên AirPod ra sẽ tạm dừng mic của bạn, không phải cả phòng. Đeo lại thì mọi thứ như cũ, vẫn tắt mic nếu bạn đang tắt.',
  'surfaces.route.nowIn': 'Đang phát qua {name}',
  'surfaces.route.micPaused': 'Mic của bạn đang tạm dừng',
  'surfaces.route.more': 'Thêm nơi để nghe',

  'surfaces.ask.kicker': 'trước khi bạn ngồi xuống',
  'surfaces.ask.mic.title': '{name} có nghe được bạn bên lửa không?',
  'surfaces.ask.mic.titleAnyone': 'Bạn bè có nghe được bạn bên lửa không?',
  'surfaces.ask.mic.body':
    'Mic chỉ được dùng khi bạn đang ở trong phòng, và bạn luôn vào phòng với mic tắt.',
  'surfaces.ask.mic.muted': 'Tắt mic cho đến khi bạn chạm Bật mic',
  'surfaces.ask.mic.notKept': 'Không ghi âm, không lưu lại gì',
  'surfaces.ask.mic.background': 'Không bao giờ dùng khi chạy nền',
  'surfaces.ask.mic.yes': 'Dùng mic của mình',
  'surfaces.ask.mic.no': 'Giờ mình chỉ nghe thôi',
  'surfaces.ask.camera.kicker': 'thắp đèn lồng',
  'surfaces.ask.camera.title': 'Cho mọi người thấy mặt bạn bên lửa?',
  'surfaces.ask.camera.body':
    'Chỉ khi bạn thắp đèn lồng. Tắt camera cũng được chào đón như nhau: {name} sẽ ngồi thay bạn.',
  'surfaces.ask.camera.offEachTime': 'Tắt mỗi lần bạn vào phòng',
  'surfaces.ask.camera.flip': 'Lật camera để khoe thứ trước mặt bạn',
  'surfaces.ask.camera.notKept': 'Không bao giờ chụp hay ghi lại',
  'surfaces.ask.camera.yes': 'Thắp đèn lồng',
  'surfaces.ask.camera.no': 'Cứ là {name}',
  'surfaces.ask.next': 'Tiếp theo, iPhone của bạn cũng sẽ hỏi.',
  'surfaces.ask.justListen': 'Chỉ nghe',
  'surfaces.ask.denied': 'Mic đang tắt với Kithfield.',
  'surfaces.ask.cameraDenied': 'Camera đang tắt với Kithfield.',
  'surfaces.ask.settings': 'Cài đặt',
};

/** Separators, product names and a word Vietnamese borrows as is. */
export const surfacesSameInBoth = [
  'surfaces.native.list.comma',
  'surfaces.route.iphone',
] as const satisfies readonly (keyof typeof surfacesEn)[];
