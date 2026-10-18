// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const rootDir = import.meta.dirname;

/** Files that are allowed (or required by their framework) to use a default export. */
const defaultExportAllowed = [
  'apps/mobile/src/app/**',
  'apps/web/src/pages/**',
  'apps/api/src/index.ts',
  'apps/admin/src/index.ts',
  '**/*.config.{js,mjs,cjs,ts,mts}',
  '**/*.d.ts',
];

const namedExportsOnly = {
  selector: 'ExportDefaultDeclaration',
  message:
    'Use named exports. Default exports are only for route files, Astro pages, Worker entries and tool configs.',
};

/** Metro maps neither `./x.js` to `x.ts` nor such dynamic imports: bundled code imports relatives extensionless. */
const extensionlessRelativeImports = [
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
].map((node) => ({
  selector: `${node}[source.value=/^\\..*\\.js$/]`,
  message:
    'Import relative TypeScript modules without an extension (Metro cannot resolve `.js` to `.ts`).',
}));

const testFiles = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/test/**', '**/__tests__/**'];

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/.expo/',
    '**/.astro/',
    '**/.wrangler/',
    '**/coverage/',
    'apps/mobile/ios/',
    'apps/mobile/android/',
    'design/',
    'docs/',
    'plans/',
    '.claude/',
    '**/*.generated.*',
    '**/expo-env.d.ts',
  ]),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.js', '*.mjs', '*.cjs', '*.ts'] },
        tsconfigRootDir: rootDir,
      },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': ['error', namedExportsOnly],
      'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],
    },
  },

  // Plain JS config files and scripts: lint syntax only, no type information.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },

  // All workspace TypeScript imports relatives extensionless, so any of it can move into code Metro
  // bundles. Wrangler, Vite (Astro, Vitest) and tsx resolve it the same way; scripts in tools/ run
  // through tsx, not Node's own type stripping, which needs the extension.
  {
    files: ['**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', namedExportsOnly, ...extensionlessRelativeImports] },
  },

  // Files that may default-export still import relatives extensionless when they are TypeScript.
  { files: defaultExportAllowed, rules: { 'no-restricted-syntax': 'off' } },
  {
    files: defaultExportAllowed,
    ignores: ['**/*.{js,mjs,cjs}'],
    rules: { 'no-restricted-syntax': ['error', ...extensionlessRelativeImports] },
  },

  {
    files: testFiles,
    rules: {
      'max-lines': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  prettier,
]);
