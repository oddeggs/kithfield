import type { ViCatalogue } from './catalogue-types';
import type { shellEn } from './shell.en';

export const shellVi: ViCatalogue<typeof shellEn> = {
  'shell.appName': 'Kithfield',
  'shell.tab.farm': 'Nông trại',
  'shell.tab.chat': 'Trò chuyện',
  'shell.tab.seedBed': 'Luống hạt',
  'shell.tab.you': 'Bạn',
  'shell.tab.somethingNew': 'Có điều mới',
  'shell.sheet.handle': 'Tay nắm của bảng',
  'shell.sheet.handleHint': 'Vuốt lên hoặc xuống để đổi kích thước',
  'shell.sheet.close': 'Đóng',
  'shell.action.more': 'Tuỳ chọn khác',
  'shell.bubble.quietNote': '{name} · không cần trả lời',
  'shell.bubble.failed': 'Chưa gửi được · Thử lại',
  'shell.bubble.writing': '{name} đang viết thư…',
  'shell.error.code': '{code} · bọn mình đã được báo',
  'shell.notFound.title': 'Lối này không dẫn đến đâu cả',
  'shell.notFound.body': 'Trang bạn tìm không có trên nông trại này.',
  'shell.notFound.action': 'Về nông trại',
};

/** The brand name. */
export const shellSameInBoth = [
  'shell.appName',
] as const satisfies readonly (keyof typeof shellEn)[];
