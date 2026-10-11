// Jest projects. `unit` only for now; `int` and `e2e` are added with the test infrastructure (M0).
/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      setupFiles: ['reflect-metadata'],
      roots: ['<rootDir>/src'],
      testMatch: ['**/*.spec.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
    },
  ],
};
