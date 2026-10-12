// @ts-check
// Layer rules from docs/architecture/README.md, enforced at lint time.
// - Local imports between our own folders: eslint-plugin-boundaries (elements + policies below).
// - Third-party packages per layer: core `no-restricted-imports`, scoped by file glob.
import boundaries from 'eslint-plugin-boundaries';

const LAYERS = ['domain', 'application', 'infrastructure', 'presentation'];

/** @type {import('eslint-plugin-boundaries').Settings['boundaries/elements']} */
const elements = [
  // Module layers: `src/modules/<module>/<layer>/**`. Module name is captured for same-module rules.
  ...LAYERS.map((layer) => ({
    type: layer,
    pattern: `src/modules/*/${layer}`,
    capture: ['module'],
  })),
  // Module wiring files sitting directly in the module folder (`appointments.module.ts`).
  { type: 'module-root', pattern: 'src/modules/*', capture: ['module'] },
  ...LAYERS.map((layer) => ({
    type: `shared-${layer}`,
    pattern: `src/shared/${layer}`,
  })),
  { type: 'config', pattern: 'src/config' },
  { type: 'health', pattern: 'src/health' },
  // Generated Prisma client (`prisma generate`). Importable from infrastructure only.
  { type: 'prisma-client', pattern: 'src/generated/prisma' },
  { type: 'test-support', pattern: 'test' },
];

const sameModule = (type) => ({
  element: { type, captured: { module: '{{ from.element.captured.module }}' } },
});
// Every classified element plus classified non-element files (composition root, tests).
const anything = [
  { element: { type: '*' } },
  { file: { categories: { anyOf: ['composition-root', 'test'] } } },
];
const anyOf = (...types) => ({ element: { types: { anyOf: types } } });

/** @type {import('eslint-plugin-boundaries').DependenciesRuleOptions['policies']} */
const policies = [
  // Third-party and Node built-ins are governed by `no-restricted-imports` below.
  { allow: { to: { module: { origin: 'external' } } } },
  { allow: { to: { module: { origin: 'core' } } } },

  // Composition root (`src/main.ts`, `src/app.module.ts`), config and health may wire anything.
  { from: { file: { categories: 'composition-root' } }, allow: { to: anything } },
  { from: anyOf('config', 'health'), allow: { to: anything } },

  // domain → same-module domain, shared/domain.
  {
    from: { element: { type: 'domain' } },
    allow: { to: [sameModule('domain'), anyOf('shared-domain')] },
  },
  // application → same-module domain, any module's application (commands/queries, exported ports), shared.
  {
    from: { element: { type: 'application' } },
    allow: {
      to: [sameModule('domain'), anyOf('application', 'shared-domain', 'shared-application')],
    },
  },
  // infrastructure → same-module domain/infrastructure, any application (ports), shared non-presentation, config.
  {
    from: { element: { type: 'infrastructure' } },
    allow: {
      to: [
        sameModule('domain'),
        sameModule('infrastructure'),
        anyOf(
          'application',
          'shared-domain',
          'shared-application',
          'shared-infrastructure',
          'config',
          'prisma-client',
        ),
      ],
    },
  },
  // presentation → application (commands, queries, views), same-module presentation, shared app/presentation.
  {
    from: { element: { type: 'presentation' } },
    allow: {
      to: [
        sameModule('presentation'),
        anyOf('application', 'shared-application', 'shared-presentation'),
      ],
    },
  },
  // Module wiring binds ports to adapters inside its own module.
  {
    from: { element: { type: 'module-root' } },
    allow: {
      to: [...LAYERS.map(sameModule), anyOf(...LAYERS.map((l) => `shared-${l}`), 'config')],
    },
  },

  { from: { element: { type: 'shared-domain' } }, allow: { to: anyOf('shared-domain') } },
  {
    from: { element: { type: 'shared-application' } },
    allow: { to: anyOf('shared-domain', 'shared-application') },
  },
  {
    from: { element: { type: 'shared-infrastructure' } },
    allow: {
      to: anyOf(
        'shared-domain',
        'shared-application',
        'shared-infrastructure',
        'config',
        'prisma-client',
      ),
    },
  },
  // The exception filter maps DomainError → HTTP, so shared presentation may see shared domain errors.
  {
    from: { element: { type: 'shared-presentation' } },
    allow: { to: anyOf('shared-domain', 'shared-application', 'shared-presentation') },
  },

  // Tests may import anything; production code must never import test files or test support.
  { from: { file: { categories: 'test' } }, allow: { to: anything } },
  { from: { element: { type: 'test-support' } }, allow: { to: anything } },
];

const restrict = (paths, patterns = []) => ({
  'no-restricted-imports': ['error', { paths, patterns }],
});
const NEST = { group: ['@nestjs/*'], message: 'domain/ must not depend on Nest.' };
const VALIDATION = [
  { name: 'class-validator', message: 'Validation belongs in presentation DTOs.' },
  { name: 'class-transformer', message: 'Validation belongs in presentation DTOs.' },
];
const PRISMA_PATTERN = {
  group: ['@prisma/*', '**/generated/prisma/**'],
  message: 'Prisma belongs in infrastructure/ only.',
};

/** @type {import('eslint').Linter.Config[]} */
export const boundariesConfig = [
  {
    files: ['**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { alwaysTryTypes: true } },
      'boundaries/elements': elements,
      'boundaries/files': [
        { category: 'composition-root', pattern: 'src/*.ts' },
        {
          category: 'test',
          pattern: ['**/*.spec.ts', '**/*.int-spec.ts', '**/*.e2e-spec.ts', 'test/**'],
        },
      ],
      'boundaries/legacy-templates': false,
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', policies }],
    },
  },
  {
    files: ['src/modules/*/domain/**/*.ts', 'src/shared/domain/**/*.ts'],
    rules: restrict(VALIDATION, [NEST, PRISMA_PATTERN]),
  },
  {
    files: ['src/modules/*/application/**/*.ts', 'src/shared/application/**/*.ts'],
    rules: restrict(
      [
        ...VALIDATION,
        {
          name: '@nestjs/common',
          allowImportNames: ['Injectable', 'Inject'],
          message:
            'application/ may only use Injectable/Inject from @nestjs/common (no HTTP exceptions).',
        },
      ],
      [
        PRISMA_PATTERN,
        {
          group: ['@nestjs/*', '!@nestjs/common', '!@nestjs/cqrs'],
          message:
            'application/ may only use @nestjs/cqrs and Injectable/Inject from @nestjs/common.',
        },
      ],
    ),
  },
  {
    files: ['src/modules/*/presentation/**/*.ts', 'src/shared/presentation/**/*.ts'],
    rules: restrict([], [PRISMA_PATTERN]),
  },
];
