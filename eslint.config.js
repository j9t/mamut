import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['site/build/**']
  },
  js.configs.recommended,
  {
    rules: {
      curly: ['error', 'multi-line'],
      eqeqeq: ['error', 'smart'],
      'no-shadow': 'error',
      'no-var': 'error',
      'prefer-const': 'error'
    }
  },
  {
    // The site runs in browsers, tests and configuration in Node.js
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  }
];