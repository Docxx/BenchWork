import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src-tauri/target', 'src-tauri/gen', 'playwright-report', 'test-results'] },
  tseslint.configs.eslintRecommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Modules talk to the core only through the public API. Their tests
    // may set the app up from core internals.
    files: ['src/modules/**'],
    ignores: ['src/modules/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@core/(?!api$)',
              message: 'Modules may import only from @core/api.',
            },
            {
              regex: '(^|/)core/',
              message: 'Modules may import only from @core/api, not by relative path.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
