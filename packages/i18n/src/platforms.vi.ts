import type { ViCatalogue } from './catalogue-types';
import type { platformsEn } from './platforms.en';

export const platformsVi: ViCatalogue<typeof platformsEn> = {
  'platforms.join.hello': 'vào đi, vào đi',
  'platforms.join.body':
    'Nông trại này đang chạy ngay trong trình duyệt của bạn. Chọn một bạn thú và chào mọi người. Tải ứng dụng sau cũng được.',
  'platforms.join.critters': { other: '{count} bạn thú' },
  'platforms.join.saved': 'căn nhà của bạn,\n{name} đã giữ cho',
  'platforms.join.savedNoName': 'căn nhà của bạn',
  'platforms.join.be': 'Làm {critter}',
  'platforms.join.name': 'Tên của bạn',
  'platforms.join.moveIn': 'Dọn vào làm {critter} {name}',
  'platforms.join.moveInNoName': 'Dọn vào làm {critter}',
  'platforms.join.needName': 'Thêm tên của bạn trước nhé.',
  'platforms.join.keep': 'Đăng nhập bằng Apple, Google hoặc email để giữ bạn thú của bạn.',
  'platforms.join.year': 'Năm bạn sinh',
  'platforms.join.yearBody':
    'Kithfield dành cho người từ 13 tuổi trở lên, hoặc lớn hơn ở nơi luật địa phương yêu cầu. Chỉ năm sinh được kiểm tra, và không được lưu lại.',
  'platforms.join.agree': 'Khi dọn vào, bạn đồng ý với {rules} và {privacy}.',
  'platforms.join.go': 'Dọn vào',
  'platforms.join.waiting': 'Bạn đang ở cổng. Người giữ trại sẽ mở cho bạn sớm thôi.',

  'platforms.getApp': 'Tải ứng dụng',

  'platforms.ask.nextBrowser': 'Tiếp theo, trình duyệt cũng sẽ hỏi bạn.',
  'platforms.ask.nextDesktop': 'Tiếp theo, máy tính cũng sẽ hỏi bạn.',

  'platforms.desk.search': 'Tìm kiếm',
  'platforms.desk.farms': 'Nông trại',
  'platforms.desk.visits': 'Ghé thăm',
  'platforms.desk.settings': 'Cài đặt',
  'platforms.desk.lampOn': 'đèn đang sáng',
  'platforms.desk.pick': 'Chọn một nông trại hoặc một chuyến ghé thăm để trò chuyện.',
  'platforms.desk.reacts': 'Nông trại phản ứng khi bạn trò chuyện: {name} vừa lên tiếng.',
  'platforms.desk.reactsQuiet': 'Nông trại phản ứng khi bạn trò chuyện.',

  'platforms.drop.title': { other: 'Thả vào để chia sẻ {count} tấm ảnh' },
  'platforms.drop.body': '{name} sẽ thích lắm',
  'platforms.drop.bodyFarm': 'mọi người sẽ thích lắm',
  'platforms.drop.notPhotos': 'Chỉ thả được ảnh và video vào đây.',

  'platforms.composer.placeholder': 'Nói gì đó, hoặc gõ : để chọn nhãn dán',
  'platforms.stickers.matching': 'Nhãn dán khớp với',
  'platforms.stickers.choose': 'chọn',
  'platforms.stickers.send': 'gửi',
  'platforms.stickers.none': 'Chưa có nhãn dán nào khớp. Gõ tiếp, hoặc bấm Esc.',

  'platforms.keys.title': 'Phím tắt',
  'platforms.keys.dewdrop': 'Để lại một giọt sương trên tin nhắn cuối',
  'platforms.keys.quickTend': 'Chăm nhanh: ba tấm thẻ để bắt kịp',
  'platforms.keys.stickers': 'Gõ : rồi một từ để chọn nhãn dán',
  'platforms.keys.search': 'Tìm nông trại, chuyến ghé thăm và tin nhắn',
  'platforms.keys.firefly': 'Để lại một con đom đóm cho ai đó',
  'platforms.keys.seed': 'Gieo tin nhắn đang chọn thành hạt giống',
  'platforms.keys.jump': 'Chuyển đến một nông trại',
  'platforms.keys.fire': 'Ngồi bên lửa',
  'platforms.keys.edit': 'Sửa tin nhắn cuối của bạn',
  'platforms.keys.list': 'Hiện danh sách này',
  'platforms.keys.mute': 'Tắt hoặc bật tiếng bên lửa',
  'platforms.keys.close': 'Đóng',

  'platforms.tray.firefly': '{name} để lại một con đom đóm',
  'platforms.tray.fireflyBody': 'trên bậc cửa nhà bạn · không cần trả lời',
  'platforms.tray.fireAlone': '{name} đang ngồi bên lửa',
  'platforms.tray.fire': { other: '{name} và {count} bạn nữa đang ngồi bên lửa' },
  'platforms.tray.fireBody': 'ra ngồi cùng nếu bạn muốn',
  'platforms.tray.open': 'Mở nông trại',
  'platforms.tray.sendBack': 'Gửi lại một con',
  'platforms.tray.sit': 'Ngồi bên lửa',
  'platforms.tray.quiet': 'Các nông trại của bạn đều yên ả',
  'platforms.tray.quit': 'Thoát Kithfield',
  'platforms.tray.show': 'Mở Kithfield',

  'platforms.menu.file': 'Tệp',
  'platforms.menu.edit': 'Sửa',
  'platforms.menu.farm': 'Nông trại',
  'platforms.menu.window': 'Cửa sổ',

  'platforms.notify.firefly': '{name} để lại một con đom đóm trên bậc cửa nhà bạn',
  'platforms.notify.dewdrop': 'đã để lại một giọt sương trên tin nhắn của bạn',
  'platforms.notify.from': '{name} · {farm}',
};

/** A name and a farm's name, joined by a dot, read the same in both. */
export const platformsSameInBoth = [
  'platforms.notify.from',
] as const satisfies readonly (keyof typeof platformsEn)[];
