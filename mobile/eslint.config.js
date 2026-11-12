import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'android/**'] },
  js.configs.recommended,
  { files: ['**/*.{js,jsx}'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module',
    globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly', __APP_VERSION_CODE__: 'readonly' }, parserOptions: { ecmaFeatures: { jsx: true } } },
  rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z]', argsIgnorePattern: '^_' }] } },
];
