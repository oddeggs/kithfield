import type { en } from './catalogues.generated';

export const languages = ['en', 'vi'] as const;
export type Language = (typeof languages)[number];

/**
 * A string that changes with a number, picked by `params.count`. `other` is always present; a
 * language adds only the categories its plural rules use (English adds `one`, Vietnamese none).
 *
 * Kithfield never counts care: no "3 dewdrops", no days in a row. Plurals are for things that
 * are simply there (critters on a farm, plants in the field guide), never for care given or missed.
 */
export type PluralForms = { readonly other: string } & {
  readonly [Category in Exclude<Intl.LDMLPluralRule, 'other'>]?: string;
};

export type Entry = string | PluralForms;

/** What every English feature catalogue satisfies: keys to strings or plural forms. */
export type EnCatalogue = Readonly<Record<string, Entry>>;

/**
 * A Vietnamese feature catalogue, typed against its English file: exactly the same keys (a
 * missing or extra key is a type error), a string where English has a string, and a plural with
 * only `other`, since Vietnamese has no plural forms.
 */
export type ViCatalogue<Source extends EnCatalogue> = {
  readonly [Key in keyof Source]: Source[Key] extends string ? string : { readonly other: string };
};

/** One feature's pair of catalogues, as the generated index lists them. */
export interface FeatureCatalogues {
  /** The key prefix and the stem of the export names: `seedBed` for `seed-bed.en.ts`. */
  readonly name: string;
  /** The file stem: `seed-bed`. */
  readonly file: string;
  readonly en: EnCatalogue;
  readonly vi: EnCatalogue;
  /** Keys whose Vietnamese is deliberately the same as the English (a brand name, say). */
  readonly sameInBoth: readonly string[];
}

export type StringKey = keyof typeof en;

/** Every language carries exactly the English key set. */
export type Catalogue = { readonly [Key in StringKey]: Entry };

type ParamNames<Text extends string> = Text extends `${string}{${infer Name}}${infer Rest}`
  ? Name | ParamNames<Rest>
  : never;

type EntryParamNames<E> = E extends string
  ? ParamNames<E>
  : E extends PluralForms
    ? 'count' | ParamNames<Extract<E[keyof E], string>>
    : never;

/** The parameters a key needs, read from the `{name}` placeholders of its English text. */
export type ParamsOf<Key extends StringKey> = {
  readonly [Name in EntryParamNames<(typeof en)[Key]>]: Name extends 'count'
    ? number
    : string | number;
};

/** Keys with no placeholders take no params argument; the others require it. */
export type ParamsArgument<Key extends StringKey> = [keyof ParamsOf<Key>] extends [never]
  ? []
  : [params: ParamsOf<Key>];
