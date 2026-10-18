import type { ViCatalogue } from './catalogue-types';
import type { pushEn } from './push.en';

export const pushVi: ViCatalogue<typeof pushEn> = {
  'push.app': 'Kithfield',
  'push.aFriend': 'Một người bạn',
  'push.doorstep.firefly':
    '{name} để lại một con đom đóm trước cửa nhà bạn. Không cần trả lời đâu.',
  'push.doorstep.gift': '{name} để lại một món quà trước cửa nhà bạn.',
  'push.doorstep.slowPost':
    'Một lá thư chậm từ {name} vừa đến trước cửa nhà bạn. Mở ra cùng một tách trà nhé.',
  'push.doorstep.few': 'Có vài thứ đang chờ trước cửa nhà bạn.',
  'push.mention': '{name}:',
  'push.forYou': '{name} để lại một điều cho bạn.',
  'push.joined': '{name} vừa dọn đến. Vẫy tay chào nhé?',
  'push.knock': '{name} đang gõ cửa hiên nhà bạn.',
  'push.farm.few': 'Có vài điều mới trên nông trại.',
  'push.birthday': 'Hôm nay là sinh nhật của {name}. Hoa hồng của bạn ấy đang nở.',
  'push.rareBloom': 'Một bông {bloom} vừa nở trên nông trại.',
  'push.nudge.wave':
    '{name} vừa tỉnh dậy sau giấc ngủ dài. Một cái vẫy tay sẽ làm bạn ấy vui cả ngày.',
  'push.nudge.last': 'Mình sẽ thôi gõ cửa. Nông trại vẫn chờ bạn.',
  'push.remember': 'Bạn đã gieo một hạt giống: {title}. Hỏi thăm xem mọi chuyện thế nào nhé?',
};

/** The brand name, and a friend's name ahead of their own words. */
export const pushSameInBoth = [
  'push.app',
  'push.mention',
] as const satisfies readonly (keyof typeof pushEn)[];
