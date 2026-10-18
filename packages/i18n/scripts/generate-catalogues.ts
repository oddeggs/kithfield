/**
 * Writes `src/catalogues.generated.ts` from the feature catalogues on disk. Run it after adding or
 * renaming a feature catalogue: `pnpm --filter @kithfield/i18n gen`.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  catalogueIndexSource,
  findCatalogueFiles,
  generatedFileName,
  sourceDir,
} from './catalogue-index';

const dir = sourceDir();
const features = findCatalogueFiles(dir);
writeFileSync(join(dir, generatedFileName), catalogueIndexSource(features));
console.log(`Wrote ${generatedFileName} with ${features.length} feature catalogues.`);
