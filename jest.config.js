// Jest projects: unit (no I/O), int (Testcontainers Postgres), e2e (full app + Testcontainers).
// See docs/testing/README.md. Run via the package.json scripts: they add --experimental-vm-modules,
// which Jest needs to load the ESM-only Nest 12 packages.

const base = {
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
};

const withDatabase = {
  globalSetup: '<rootDir>/test/helpers/global-setup.ts',
  globalTeardown: '<rootDir>/test/helpers/global-teardown.ts',
};

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      ...base,
      displayName: 'unit',
      roots: ['<rootDir>/src', '<rootDir>/test'],
      testMatch: ['**/*.spec.ts'],
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.spec.ts',
        '!src/**/*.int-spec.ts',
        '!src/generated/**',
        '!src/main.ts',
      ],
    },
    {
      ...base,
      ...withDatabase,
      displayName: 'int',
      roots: ['<rootDir>/src', '<rootDir>/test'],
      testMatch: ['**/*.int-spec.ts'],
    },
    {
      ...base,
      ...withDatabase,
      displayName: 'e2e',
      roots: ['<rootDir>/test/e2e'],
      testMatch: ['**/*.e2e-spec.ts'],
    },
  ],
};
