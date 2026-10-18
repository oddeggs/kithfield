# @kithfield/i18n

All Kithfield copy, in English and Vietnamese: one typed catalogue pair per feature, the glossary, the lookup (`t`), language and font-stack selection, and the tests that keep Vietnamese complete.

## How the catalogues are collected

Each feature has `src/<feature>.en.ts` and `src/<feature>.vi.ts`. The index has to gather them "with a glob" in four bundlers: Metro (the app), Vite (Astro, the website), esbuild (Wrangler, the API Worker's push copy) and Vitest. There is no glob all four understand: `import.meta.glob` is Vite-only and `require.context` is Metro-only.

So a small generator, `scripts/generate-catalogues.ts`, lists the files on disk and writes `src/catalogues.generated.ts`: plain static imports that every bundler reads, with no build step for consumers. A test regenerates it in memory and fails if the committed file differs, so a forgotten run is caught in CI. When two branches both add features the generated file may conflict; resolve it by re-running the generator. No hand-written file lists features, so lanes never collide on one.

The generator needs nothing installed: Node runs the TypeScript file directly.

## Adding a feature catalogue

1. Create `src/<feature>.en.ts` (kebab-case file name). Export `<feature>En` (camelCase), keys prefixed with `<feature>.` in camelCase, `as const` so placeholders are typed:

   ```ts
   import type { EnCatalogue } from './catalogue-types';

   export const seedBedEn = {
     'seedBed.empty.title': 'Nothing planted yet',
     'seedBed.sprouted': '{name}’s seed sprouted!',
     'seedBed.critters': { one: '{count} critter is in', other: '{count} critters are in' },
   } as const satisfies EnCatalogue;
   ```

2. Create `src/<feature>.vi.ts`, typed against the English file, so a missing or extra key is a type error. A plural keeps only `other` (Vietnamese has no plural forms):

   ```ts
   import type { ViCatalogue } from './catalogue-types';
   import type { seedBedEn } from './seed-bed.en';

   export const seedBedVi: ViCatalogue<typeof seedBedEn> = {
     'seedBed.empty.title': 'Chưa gieo hạt nào',
     'seedBed.sprouted': 'Hạt của {name} đã nảy mầm!',
     'seedBed.critters': { other: '{count} bạn thú tham gia' },
   };
   ```

   A key whose Vietnamese is deliberately the same as the English (a brand name) goes in an optional `export const seedBedSameInBoth = ['seedBed.x'] as const satisfies readonly (keyof typeof seedBedEn)[];`.

3. Run `pnpm --filter @kithfield/i18n gen`, then `pnpm --filter @kithfield/i18n test` and `typecheck`. Commit both catalogue files and the regenerated `catalogues.generated.ts`.

Use the glossary's words (`glossary.en.ts`: farm, critter, visit, dewdrop, seed bed, keeper…) and their Vietnamese exactly as the glossary gives them.

## Reading copy

```ts
import { pickLanguage, t, translator, fontLocaleFor } from '@kithfield/i18n';

const language = pickLanguage(deviceLocales, storedChoice); // 'en' | 'vi'
t(language, 'glossary.seedBed'); // typed key; params are required exactly when the text has placeholders
const tr = translator(language); // bound to one language, for a screen
fontLocaleFor(language); // 'default' | 'vi': the theme swaps Young Serif → Lora, Gaegu → Patrick Hand for 'vi'
```

A key the language lacks reads in English. The core has no React or Node dependency; the app holds the chosen language in its own state and passes it in.

## What the tests enforce

- Every feature's Vietnamese has exactly the English keys, none empty, the same `{placeholders}`, the same plural shape, and is not just the English text unless the key is listed as the same in both.
- Every key starts with its feature's prefix, so features never overwrite each other.
- The glossary matches the table in `design/01 Foundations.dc.html`, term for term.
- English copy avoids the words the glossary rules out (avatar, user, DM, admin, inactive, "left the group") and never counts care (`{count} dewdrops`, `{n} days in a row`).

## House rules

No streaks, no counts of care, no read receipts, nothing dies, care is always free. Plurals exist for things that are simply there (critters on a farm, plants in the field guide), never for care given, received or missed.
