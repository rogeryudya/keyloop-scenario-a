import {
  CoverageEntry,
  JestReport,
  JestSuite,
  relativePath,
  renderCoverageGate,
  renderJestReport,
  renderSteps,
  stripAnsi,
} from '../../scripts/ci/summary-render';

const ROOT = '/home/runner/work/repo';

const suite = (overrides: Partial<JestSuite> = {}): JestSuite => ({
  name: `${ROOT}/src/a.spec.ts`,
  status: 'passed',
  message: '',
  startTime: 1_000,
  endTime: 2_000,
  assertionResults: [{ fullName: 'A works', status: 'passed', failureMessages: [] }],
  ...overrides,
});

const report = (overrides: Partial<JestReport> = {}): JestReport => ({
  success: true,
  startTime: 1_000,
  numTotalTestSuites: 1,
  numFailedTestSuites: 0,
  numTotalTests: 1,
  numPassedTests: 1,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults: [suite()],
  ...overrides,
});

describe('renderJestReport', () => {
  it('shows a passing run as a results table', () => {
    const md = renderJestReport('Unit tests', report(), ROOT);

    expect(md).toContain('## ✅ Unit tests');
    expect(md).toContain('| 1 | 1 | 1 | 0 | 0 | 1.0 s |');
    expect(md).not.toContain('Failures');
  });

  it('lists each failed test with its file and a cleaned message', () => {
    const failed = suite({
      status: 'failed',
      assertionResults: [
        { fullName: 'A works', status: 'passed', failureMessages: [] },
        {
          fullName: 'A rejects',
          status: 'failed',
          failureMessages: ['\u001b[31mexpected 1\u001b[39m\n```\nat a.ts:3'],
        },
      ],
    });
    const md = renderJestReport(
      'Integration tests',
      report({ success: false, numFailedTests: 1, testResults: [failed] }),
      ROOT,
    );

    expect(md).toContain('## ❌ Integration tests');
    expect(md).toContain('### Failures (1)');
    expect(md).toContain('❌ <code>src/a.spec.ts</code> › A rejects');
    expect(md).toContain('expected 1');
    expect(md).not.toContain('\u001b[');
    expect(md.match(/```/g)).toHaveLength(2); // the message's own fence is neutralised
  });

  it('reports a suite that failed to run without any failed test', () => {
    const broken = suite({
      status: 'failed',
      message: 'Cannot find module x',
      assertionResults: [],
    });

    const md = renderJestReport(
      'Unit tests',
      report({ success: false, testResults: [broken] }),
      ROOT,
    );

    expect(md).toContain('(suite failed to run)');
    expect(md).toContain('Cannot find module x');
  });

  it('truncates long failure messages', () => {
    const long = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    const failed = suite({
      status: 'failed',
      assertionResults: [{ fullName: 'A', status: 'failed', failureMessages: [long] }],
    });

    const md = renderJestReport('T', report({ success: false, testResults: [failed] }), ROOT);

    expect(md).toContain('line 24');
    expect(md).not.toContain('line 25');
    expect(md).toContain('… 15 more lines in the job log');
  });

  it('ranks the slowest suites', () => {
    const md = renderJestReport(
      'T',
      report({
        testResults: [
          suite({ name: `${ROOT}/fast.spec.ts`, endTime: 1_100 }),
          suite({ name: `${ROOT}/slow.spec.ts`, endTime: 9_000 }),
        ],
      }),
      ROOT,
    );

    expect(md.indexOf('slow.spec.ts')).toBeLessThan(md.indexOf('fast.spec.ts'));
    expect(md).toContain('| `slow.spec.ts` | 8.0 s |');
  });
});

describe('renderCoverageGate', () => {
  const entry = (covered: number, total: number): CoverageEntry => ({
    statements: { covered, total },
    branches: { covered, total },
    functions: { covered, total },
    lines: { covered, total },
  });

  it('aggregates files per folder and flags folders below the threshold', () => {
    const md = renderCoverageGate(
      {
        total: entry(17, 20),
        [`${ROOT}/src/domain/a.ts`]: entry(9, 10),
        [`${ROOT}/src/domain/b.ts`]: entry(10, 10),
        [`${ROOT}/src/application/c.ts`]: entry(8, 10),
        [`${ROOT}/src/other/d.ts`]: entry(0, 10),
      },
      ['src/domain/', 'src/application/'],
      90,
      ROOT,
    );

    expect(md).toContain('### ❌ Coverage gate: every folder ≥ 90%');
    expect(md).toContain('| `src/domain/` | 95.0% | 95.0% | 95.0% | 95.0% |');
    expect(md).toContain('| `src/application/` | 80.0% ❌ |');
    expect(md).toContain('| **All files** (not gated) | 85.0% |');
  });

  it('passes when every folder meets the threshold', () => {
    const md = renderCoverageGate(
      { [`${ROOT}/src/domain/a.ts`]: entry(10, 10) },
      ['src/domain/'],
      90,
      ROOT,
    );

    expect(md).toContain('### ✅ Coverage gate');
  });

  it('fails a gated folder with no covered files, as Jest does', () => {
    expect(renderCoverageGate({}, ['src/empty/'], 90, ROOT)).toContain('❌ Coverage gate');
  });
});

describe('renderSteps', () => {
  it('passes when every step succeeded or was skipped', () => {
    const md = renderSteps('Lint', [
      { name: 'ESLint', outcome: 'success' },
      { name: 'Build', outcome: 'skipped' },
    ]);

    expect(md).toContain('## ✅ Lint');
    expect(md).toContain('| ESLint | ✅ success |');
  });

  it('fails on any failed step and marks steps that never ran', () => {
    const md = renderSteps('Smoke', [
      { name: 'Start stack', outcome: 'failure' },
      { name: 'Health', outcome: '' },
    ]);

    expect(md).toContain('## ❌ Smoke');
    expect(md).toContain('| Start stack | ❌ failure |');
    expect(md).toContain('| Health | ❔ not run |');
  });
});

describe('helpers', () => {
  it('strips ANSI colour codes', () => {
    expect(stripAnsi('\u001b[1m\u001b[31mred\u001b[39m\u001b[22m')).toBe('red');
  });

  it('makes paths repo-relative on Linux and Windows', () => {
    expect(relativePath('/home/runner/work/repo/src/a.ts', '/home/runner/work/repo')).toBe(
      'src/a.ts',
    );
    expect(relativePath('C:\\repo\\src\\a.ts', 'C:\\repo')).toBe('src/a.ts');
    expect(relativePath('/elsewhere/a.ts', ROOT)).toBe('/elsewhere/a.ts');
  });
});
