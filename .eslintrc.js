module.exports = {
  extends: ['@exodus/eslint-config/javascript'],
  overrides: [
    {
      files: ['*.{ts,tsx}'],
      parserOptions: {
        project: 'tsconfig.test.json',
      },
      extends: '@exodus/eslint-config/typescript',
      rules: {
        'unicorn/prefer-top-level-await': 'off',
      },
      parser: '@typescript-eslint/parser',
    },
  ],
}
