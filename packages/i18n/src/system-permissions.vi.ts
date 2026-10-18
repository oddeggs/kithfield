import type { ViCatalogue } from './catalogue-types';
import type { systemPermissionsEn } from './system-permissions.en';

export const systemPermissionsVi: ViCatalogue<typeof systemPermissionsEn> = {
  'systemPermissions.camera':
    'Kithfield chỉ dùng máy ảnh khi bạn chụp ảnh để chia sẻ, quét mã để đăng nhập trên thiết bị khác, hoặc thắp đèn lồng bên lửa.',
  'systemPermissions.microphone':
    'Micro chỉ được dùng khi bạn ghi tin nhắn thoại hoặc ngồi bên lửa, và bạn luôn vào với micro đang tắt.',
  'systemPermissions.photos':
    'Để ảnh gần đây hiện trong khay khi bạn chia sẻ. Chỉ những ảnh bạn chọn mới được gửi đi.',
  'systemPermissions.photosAdd': 'Để bạn lưu ảnh và video từ các nông trại vào thư viện ảnh.',
  'systemPermissions.faceId':
    'Bạn sẽ xác nhận bằng Face ID trước khi xoá tài khoản hoặc cho một thiết bị mới vào.',
  'systemPermissions.contacts':
    'Để tìm bạn bè đã có Kithfield. Danh bạ được đối chiếu ngay trên điện thoại này bằng số đã mã hoá, và danh bạ của bạn không bao giờ được tải lên.',
  'systemPermissions.location':
    'Vào ngày hẹn, để chỉ đường từ chỗ bạn đang ở. Không có gì được chia sẻ với nông trại, không bao giờ.',
  'systemPermissions.calendar':
    'Để bạn thêm kế hoạch vào lịch. Kithfield chỉ ghi sự kiện và không bao giờ đọc lịch của bạn.',
};
