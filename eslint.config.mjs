import globals from 'globals';

export default [
  {
    files: ['nitro-wraith.user.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.greasemonkey,
        unsafeWindow: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      // El bundle es un solo IIFE: una declaracion que ya nadie lee es deuda
      // o el residuo de una extraccion. no-undef no la ve; esta regla si.
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
    },
  },
  {
    files: ['tools/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
    },
  },
  {
    files: ['tests/browsers/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
