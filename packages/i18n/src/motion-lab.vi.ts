import type { ViCatalogue } from './catalogue-types';
import type { motionLabEn } from './motion-lab.en';

export const motionLabVi: ViCatalogue<typeof motionLabEn> = {
  'motionLab.title': 'Phòng thử chuyển động',
  'motionLab.subtitle':
    'Chỉ dành cho phát triển: hình vẽ bay giữa các màn hình trên luồng giao diện. Bật Giảm chuyển động trong Cài đặt để xem từng cái thành một lần chuyển mờ.',
  'motionLab.pick': 'Chuyển cảnh',
  'motionLab.critter': 'Bạn thú',
  'motionLab.chat': 'Nông trại và trò chuyện',
  'motionLab.seed': 'Hạt giống',
  'motionLab.firefly': 'Đom đóm',
  'motionLab.back': 'Phát ngược lại',
  'motionLab.reset': 'Làm lại',
  'motionLab.critter.hint':
    'Chạm vào một khuôn mặt: bạn thú nhấc ra khỏi cuộc trò chuyện và đáp xuống nông trại. Chạm lần nữa khi đang bay để đi thẳng tới thẻ; phát ngược để thu nó lại vào bong bóng.',
  'motionLab.critter.card': 'Ở đây, trên nông trại',
  'motionLab.chat.hint':
    'Kéo tấm lên xuống: từng bạn thú theo ngón tay bạn vào đầu cuộc trò chuyện rồi trở lại. Thả tay ra, nó dừng ở đầu gần hơn.',
  'motionLab.seed.hint':
    'Giữ tin nhắn để gieo nó: tin nhắn cuộn thành hạt giống và rơi vào Luống hạt. Phát ngược để nhổ nó lên.',
  'motionLab.seed.message': 'đi dã ngoại trước khi trời lạnh nhé?',
  'motionLab.firefly.hint':
    'Gửi đom đóm tới một cánh cửa. Chọn cánh cửa kia khi nó đang bay để đổi hướng, hoặc gọi nó về.',
  'motionLab.firefly.send': 'Gửi đi',
  'motionLab.firefly.recall': 'Gọi về',
  'motionLab.firefly.left': 'Cửa bên trái',
  'motionLab.firefly.right': 'Cửa bên phải',
};
