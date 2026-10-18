// English and Vietnamese copy. Feature catalogues are collected by the generated index
// (`catalogues.generated.ts`), so adding a feature never edits this file.
export { languages } from './catalogue-types';
export type {
  Entry,
  EnCatalogue,
  Language,
  ParamsArgument,
  ParamsOf,
  PluralForms,
  StringKey,
  ViCatalogue,
} from './catalogue-types';
export {
  defaultLanguage,
  fontLocaleFor,
  fontLocales,
  isLanguage,
  pickLanguage,
} from './pick-language';
export type { FontLocale } from './pick-language';
export { t, translator } from './translate';
export type { Translate } from './translate';
