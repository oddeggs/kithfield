import type { ViCatalogue } from './catalogue-types';
import type { nativeLabEn } from './native-lab.en';

export const nativeLabVi: ViCatalogue<typeof nativeLabEn> = {
  'nativeLab.title': 'Phòng thử native',
  'nativeLab.subtitle':
    'Chỉ dành cho phát triển: từng mô-đun native đã có trong ứng dụng này chưa?',
  'nativeLab.calls': 'Gọi bên đống lửa: {state}',
  'nativeLab.purchases': 'Mua hàng: {state}',
  'nativeLab.purchasesKey': 'Khoá mua hàng: {state}',
  'nativeLab.network': 'Mạng: {state}',
  'nativeLab.appGroup': 'Nhóm ứng dụng: {state}',
  'nativeLab.activities': 'Hoạt động trực tiếp: {state}',
  'nativeLab.backgroundTasks': 'Tác vụ nền: {state}',
  'nativeLab.reloadWidgets': 'Tải lại tiện ích',
  'nativeLab.reloaded': 'Đã nhờ iOS tải lại các tiện ích',
  'nativeLab.state.ready': 'sẵn sàng',
  'nativeLab.state.missing': 'thiếu',
  'nativeLab.state.set': 'đã đặt',
  'nativeLab.state.unset': 'chưa đặt',
  'nativeLab.state.on': 'bật',
  'nativeLab.state.off': 'tắt',
  'nativeLab.state.checking': 'đang kiểm tra',
  'nativeLab.failed': 'Thất bại: {error}',
};
