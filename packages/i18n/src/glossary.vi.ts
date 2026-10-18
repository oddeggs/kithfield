import type { ViCatalogue } from './catalogue-types';
import type { glossaryEn } from './glossary.en';

/** The glossary's Vietnamese, exactly as `01 Foundations` gives it. */
export const glossaryVi: ViCatalogue<typeof glossaryEn> = {
  'glossary.farm': 'Nông trại',
  'glossary.critter': 'Bạn thú',
  'glossary.visit': 'Ghé thăm',
  'glossary.tending': 'Chăm sóc',
  'glossary.dewdrop': 'Giọt sương',
  'glossary.firefly': 'Đom đóm',
  'glossary.quietNote': 'Lời nhắn không cần trả lời',
  'glossary.seed': 'Hạt giống',
  'glossary.seedBed': 'Luống hạt',
  'glossary.sitByTheFire': 'Ngồi bên lửa',
  'glossary.lightYourLantern': 'Thắp đèn lồng',
  'glossary.dozing': 'Đang ngủ gật',
  'glossary.sleepy': 'Đang ngủ gật',
  'glossary.lampOn': 'Đèn đang sáng',
  'glossary.hibernate': 'Ngủ đông',
  'glossary.keeper': 'Người giữ trại',
  'glossary.goneWandering': 'Đã đi lang thang',
  'glossary.fieldGuide': 'Sổ tay cây cỏ',
  'glossary.harvestDay': 'Ngày thu hoạch',
  'glossary.kithfieldPlus': 'Kithfield+',
};

/** The membership's name is not translated. */
export const glossarySameInBoth = [
  'glossary.kithfieldPlus',
] as const satisfies readonly (keyof typeof glossaryEn)[];
