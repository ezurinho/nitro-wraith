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
