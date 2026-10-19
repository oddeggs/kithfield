import type { ViCatalogue } from './catalogue-types';
import type { layoutEn } from './layout.en';

export const layoutVi: ViCatalogue<typeof layoutEn> = {
  'layout.sidebar.search': 'Tìm kiếm',
  'layout.sidebar.farms': 'Nông trại',
  'layout.sidebar.visits': 'Ghé thăm',
  'layout.sidebar.lampOn': 'đèn đang sáng',
  'layout.sidebar.hibernating': 'đang ngủ đông, ấm áp',
  'layout.sidebar.you': 'Bạn và phần cài đặt',
  'layout.sidebar.somethingNew': 'có điều mới',
  'layout.sidebar.empty': 'Chưa có nông trại nào. Hãy gieo một nông trại từ trang nông trại.',

  'layout.chat.noticeboard': 'Bảng tin',
  'layout.chat.seedBed': 'Luống hạt',
  'layout.chat.more': 'Đã chia sẻ trên nông trại',
  'layout.chat.back': 'Nông trại và ghé thăm',
  'layout.chat.openBeside': 'Mở bên cạnh nông trại và ghé thăm',
  'layout.chat.open': 'Mở cuộc trò chuyện',

  'layout.farm.open': 'Mở nông trại toàn màn hình',
  'layout.farm.reacts': 'Nông trại phản ứng khi bạn trò chuyện: {name} vừa giơ lên “{text}”.',

  'layout.farm.seedBed': 'Luống hạt',
  'layout.farm.firefly': 'Để lại một con đom đóm',
  'layout.farm.fire': 'Ngồi bên lửa',
};
