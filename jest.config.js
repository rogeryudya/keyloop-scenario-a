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

// Coverage gate (M5, run by `pnpm test:cov` in CI): business rules and use cases. Directory keys are
// aggregated per directory; every domain/ and application/ folder with code is listed (customers has none
// yet, and Jest fails on a threshold path without coverage data).
const RULES_THRESHOLD = { statements: 90, branches: 90, functions: 90, lines: 90 };
const RULES_DIRECTORIES = [
  './src/shared/domain/',
  './src/shared/application/',
  './src/modules/appointments/domain/',
  './src/modules/appointments/application/',
  './src/modules/dealerships/domain/',
  './src/modules/dealerships/application/',
];

/** @type {import('jest').Config} */
module.exports = {
  coverageThreshold: Object.fromEntries(RULES_DIRECTORIES.map((dir) => [dir, RULES_THRESHOLD])),
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
