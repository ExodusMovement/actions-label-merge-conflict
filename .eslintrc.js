module.exports = {
  extends: ['@exodus'],
  overrides: [
    {
      files: ['*.{ts,tsx}'],
      extends: [
        '@exodus',
        'plugin:@typescript-eslint/recommended',
        'plugin:import/typescript',
        'prettier',
      ],
      settings: {
        'import/parsers': {
          '@typescript-eslint/parser': ['.ts'],
        },
        'import/resolver': {
          typescript: {
            alwaysTryTypes: true,
          },
        },
      },
      parserOptions: {
        project: ['./tsconfig.test.json'],
      },
      plugins: ['@typescript-eslint'],
      rules: {
        // ...shared,
        'import/no-unresolved': 'off',
        'no-useless-constructor': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-unnecessary-condition': [
          'error',
          { allowConstantLoopConditions: true },
        ],
        '@typescript-eslint/no-extra-non-null-assertion': 'off',
        'no-use-before-define': 'off',
        '@typescript-eslint/no-use-before-define': [
          'error',
          { functions: false, classes: false, variables: false },
        ],
        'unicorn/prevent-abbreviations': 'off',
        'unicorn/no-array-callback-reference': 'off',
      },
      parser: '@typescript-eslint/parser',
    },
  ],
}
