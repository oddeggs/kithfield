import type { Translate } from '@kithfield/i18n';

type LooseTranslate = (key: string, params?: Readonly<Record<string, string | number>>) => string;

/** A key chosen at run time (a reason, a weather, a step of progress), with its parameters. */
export const say = (
  t: Translate,
  key: string,
  params?: Readonly<Record<string, string | number>>,
): string => (t as unknown as LooseTranslate)(key, params);
