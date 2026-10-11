// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { boundariesConfig } from './eslint.boundaries.mjs';

export default tseslint.config(
  {
    ignores: ['dist/', 'coverage/', 'node_modules/', 'eslint.config.mjs', 'eslint.boundaries.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // CLAUDE.md hard rule 2: no `any`, no `@ts-ignore`, no unexplained non-null `!`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      // conventions.md: explicit return types on exported functions.
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Nest modules are decorated empty classes.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  ...boundariesConfig,
);
