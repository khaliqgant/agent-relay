/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    // This repo intentionally uses a few tight loops (e.g., streaming parsers).
    'no-constant-condition': 'off',
    // Regex/string escaping in protocol/state templates can appear "redundant" to ESLint.
    'no-useless-escape': 'off',
    // Useful signal, but too noisy for this early release.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
  },
  ignorePatterns: ['dist/**', 'node_modules/**', 'coverage/**', '**/out/**'],
};
