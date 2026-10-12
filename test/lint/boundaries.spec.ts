import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ESLint as ESLintType } from 'eslint';

/**
 * Regression test for the layer rules (eslint.boundaries.mjs, ADR-0005): "a boundary violation fails lint".
 * Builds a throwaway src/ tree in a temp dir and lints it with only the boundary config (no type info).
 */

// [file, import, should fail]
const CASES: readonly [string, string, boolean][] = [
  ['src/modules/appointments/domain/a.ts', "import { x } from '../application/x.handler';", true],
  ['src/modules/appointments/domain/b.ts', "import { Injectable } from '@nestjs/common';", true],
  ['src/modules/appointments/domain/c.ts', "import { PrismaClient } from '@prisma/client';", true],
  ['src/modules/appointments/domain/d.ts', "import { IsString } from 'class-validator';", true],
  [
    'src/modules/appointments/domain/e.ts',
    "import { x } from '../../customers/domain/customer.entity';",
    true,
  ],
  [
    'src/modules/appointments/domain/f.ts',
    "import { x } from '../../../../test/fakes/fake';",
    true,
  ],
  [
    'src/modules/appointments/domain/g.ts',
    "import { x } from '../../../shared/domain/domain-error';",
    false,
  ],
  ['src/modules/appointments/domain/h.ts', "import { x } from './appointment.entity';", false],
  [
    'src/modules/appointments/domain/i.spec.ts',
    "import { x } from '../../../../test/fakes/fake';",
    false,
  ],
  [
    'src/modules/appointments/application/a.ts',
    "import { x } from '../domain/appointment.entity';",
    false,
  ],
  [
    'src/modules/appointments/application/b.ts',
    "import { PrismaClient } from '@prisma/client';",
    true,
  ],
  [
    'src/modules/appointments/application/c.ts',
    "import { Injectable, Inject } from '@nestjs/common';",
    false,
  ],
  [
    'src/modules/appointments/application/d.ts',
    "import { NotFoundException } from '@nestjs/common';",
    true,
  ],
  [
    'src/modules/appointments/application/e.ts',
    "import { CommandHandler } from '@nestjs/cqrs';",
    false,
  ],
  [
    'src/modules/appointments/application/f.ts',
    "import { ApiProperty } from '@nestjs/swagger';",
    true,
  ],
  [
    'src/modules/appointments/application/g.ts',
    "import { x } from '../infrastructure/prisma-x.repository';",
    true,
  ],
  [
    'src/modules/appointments/application/h.ts',
    "import { x } from '../../customers/application/get-customer.query';",
    false,
  ],
  [
    'src/modules/appointments/application/i.ts',
    "import { x } from '../../customers/domain/customer.entity';",
    true,
  ],
  [
    'src/modules/appointments/application/j.ts',
    "import { x } from '../../../generated/prisma/client';",
    true,
  ],
  [
    'src/modules/appointments/infrastructure/a.ts',
    "import { x } from '../domain/appointment.entity';",
    false,
  ],
  [
    'src/modules/appointments/infrastructure/b.ts',
    "import { x } from '../../customers/infrastructure/prisma-customer.repository';",
    true,
  ],
  [
    'src/modules/appointments/infrastructure/c.ts',
    "import { x } from '../presentation/x.controller';",
    true,
  ],
  [
    'src/modules/appointments/infrastructure/d.ts',
    "import { x } from '../../../generated/prisma/client';",
    false,
  ],
  [
    'src/modules/appointments/presentation/a.ts',
    "import { x } from '../domain/appointment.entity';",
    true,
  ],
  [
    'src/modules/appointments/presentation/b.ts',
    "import { x } from '../application/x.handler';",
    false,
  ],
  [
    'src/modules/appointments/presentation/c.ts',
    "import { x } from '../infrastructure/prisma-x.repository';",
    true,
  ],
  [
    'src/modules/appointments/presentation/d.ts',
    "import { PrismaClient } from '@prisma/client';",
    true,
  ],
  [
    'src/modules/appointments/a.module.ts',
    "import { x } from './infrastructure/prisma-x.repository';",
    false,
  ],
  [
    'src/modules/appointments/b.module.ts',
    "import { x } from '../customers/infrastructure/prisma-customer.repository';",
    true,
  ],
  [
    'src/shared/domain/a.ts',
    "import { x } from '../../modules/appointments/domain/appointment.entity';",
    true,
  ],
  ['src/shared/presentation/a.ts', "import { x } from '../domain/domain-error';", false],
  [
    'src/a.ts',
    "import { x } from './modules/appointments/infrastructure/prisma-x.repository';",
    false,
  ],
];

const TARGETS = [
  'src/modules/appointments/domain/appointment.entity.ts',
  'src/modules/appointments/application/x.handler.ts',
  'src/modules/appointments/infrastructure/prisma-x.repository.ts',
  'src/modules/appointments/presentation/x.controller.ts',
  'src/modules/customers/domain/customer.entity.ts',
  'src/modules/customers/application/get-customer.query.ts',
  'src/modules/customers/infrastructure/prisma-customer.repository.ts',
  'src/shared/domain/domain-error.ts',
  'src/generated/prisma/client.ts',
  'test/fakes/fake.ts',
];

const RULES = new Set(['boundaries/dependencies', 'no-restricted-imports']);

describe('layer boundary lint', () => {
  let root: string;
  let results: ESLintType.LintResult[];

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'keyloop-boundaries-'));
    const write = (file: string, content: string): void => {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), content);
    };
    TARGETS.forEach((file) => write(file, 'export const x = 1;\n'));
    CASES.forEach(([file, line]) => write(file, `${line}\n`));

    const { ESLint } = (await import('eslint')) as typeof import('eslint');
    const tseslint = (await import('typescript-eslint')).default;
    const { boundariesConfig } = await import('../../eslint.boundaries.mjs');
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: [
        { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
        ...boundariesConfig,
        { settings: { 'boundaries/root-path': root } },
      ],
    });
    results = await eslint.lintFiles(CASES.map(([file]) => file));
  }, 60_000);

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it.each(CASES)('%s: %s → fails=%s', (file, _line, shouldFail) => {
    const result = results.find((r) => r.filePath === join(root, file));
    const violations = (result?.messages ?? []).filter(
      (m) => m.fatal === true || (m.ruleId !== null && RULES.has(m.ruleId)),
    );

    expect(result).toBeDefined();
    expect(violations.length > 0).toBe(shouldFail);
  });
});
