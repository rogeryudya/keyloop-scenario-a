/**
 * Markdown for the GitHub Actions run summary page (`$GITHUB_STEP_SUMMARY`). Pure functions over
 * Jest's `--json` output and istanbul's `json-summary` coverage; `test-summary.ts` does the I/O.
 * Unit-tested in `test/ci/`.
 */

/** The parts of Jest's `--json` report we use. */
export interface JestReport {
  readonly success: boolean;
  readonly startTime: number;
  readonly numTotalTestSuites: number;
  readonly numFailedTestSuites: number;
  readonly numTotalTests: number;
  readonly numPassedTests: number;
  readonly numFailedTests: number;
  readonly numPendingTests: number;
  readonly numTodoTests: number;
  readonly testResults: readonly JestSuite[];
}

export interface JestSuite {
  readonly name: string;
  readonly status: string;
  readonly message: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly assertionResults: readonly {
    readonly fullName: string;
    readonly status: string;
    readonly failureMessages: readonly string[];
  }[];
}

export interface CoverageMetric {
  readonly total: number;
  readonly covered: number;
}

/** One file's (or the total's) entry in istanbul's `coverage-summary.json`. */
export type CoverageEntry = Record<
  'statements' | 'branches' | 'functions' | 'lines',
  CoverageMetric
>;

const METRICS = ['statements', 'branches', 'functions', 'lines'] as const;
const MAX_FAILURE_LINES = 25;
const MAX_FAILURES_SHOWN = 20;
const SLOWEST_SHOWN = 5;

// eslint-disable-next-line no-control-regex -- matching ANSI escape codes is the point
const ANSI = /\u001b\[[0-9;]*m/g;

export const stripAnsi = (text: string): string => text.replace(ANSI, '');

/** Repo-relative path with forward slashes, whatever the runner OS. */
export function relativePath(path: string, root: string): string {
  const normalized = path.replaceAll('\\', '/');
  const base = root.replaceAll('\\', '/').replace(/\/?$/, '/');
  return normalized.startsWith(base) ? normalized.slice(base.length) : normalized;
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** Keeps the start of a failure message: the assertion and the first stack frames. */
function excerpt(message: string): string {
  const lines = stripAnsi(message).trimEnd().split('\n');
  const kept = lines.slice(0, MAX_FAILURE_LINES);
  if (lines.length > kept.length)
    kept.push(`… ${lines.length - kept.length} more lines in the job log`);
  // A fence inside the message would close ours early.
  return kept.join('\n').replaceAll('```', "'''");
}

function details(summary: string, body: string): string {
  return `<details><summary>${summary}</summary>\n\n\`\`\`text\n${body}\n\`\`\`\n\n</details>`;
}

/** Results table, failures (expanded per test) and the slowest suites. */
export function renderJestReport(title: string, report: JestReport, root: string): string {
  const icon = report.success ? '✅' : '❌';
  const totalMs = Math.max(0, ...report.testResults.map((s) => s.endTime - report.startTime));
  const out: string[] = [
    `## ${icon} ${title}`,
    '',
    '| Suites | Tests | Passed | Failed | Skipped | Duration |',
    '|---:|---:|---:|---:|---:|---:|',
    `| ${report.numTotalTestSuites} | ${report.numTotalTests} | ${report.numPassedTests} | ` +
      `${report.numFailedTests} | ${report.numPendingTests + report.numTodoTests} | ${seconds(totalMs)} |`,
  ];

  const failures = report.testResults.flatMap((suite) => {
    const file = relativePath(suite.name, root);
    const failedTests = suite.assertionResults.filter((t) => t.status === 'failed');
    if (failedTests.length > 0) {
      return failedTests.map((t) =>
        details(`❌ <code>${file}</code> › ${t.fullName}`, excerpt(t.failureMessages.join('\n'))),
      );
    }
    // A suite can fail without a failed test: compile error, failing hook, open handles.
    return suite.status === 'failed' && suite.message.trim() !== ''
      ? [details(`❌ <code>${file}</code> (suite failed to run)`, excerpt(suite.message))]
      : [];
  });
  if (failures.length > 0) {
    out.push('', `### Failures (${failures.length})`, '', ...failures.slice(0, MAX_FAILURES_SHOWN));
    if (failures.length > MAX_FAILURES_SHOWN) {
      out.push('', `…and ${failures.length - MAX_FAILURES_SHOWN} more; see the job log.`);
    }
  }

  const slowest = [...report.testResults]
    .sort((a, b) => b.endTime - b.startTime - (a.endTime - a.startTime))
    .slice(0, SLOWEST_SHOWN);
  if (slowest.length > 0) {
    out.push(
      '',
      '<details><summary>Slowest suites</summary>',
      '',
      '| Suite | Duration |',
      '|---|---:|',
      ...slowest.map(
        (s) => `| \`${relativePath(s.name, root)}\` | ${seconds(s.endTime - s.startTime)} |`,
      ),
      '',
      '</details>',
    );
  }
  return out.join('\n') + '\n';
}

const pct = (m: CoverageMetric): number => (m.total === 0 ? 100 : (m.covered / m.total) * 100);

/**
 * Coverage of each gated folder, aggregated over its files the same way Jest's `coverageThreshold`
 * does for directory keys. `folders` are repo-relative with a trailing slash, e.g. `src/shared/domain/`.
 */
export function renderCoverageGate(
  summary: Readonly<Record<string, CoverageEntry>>,
  folders: readonly string[],
  threshold: number,
  root: string,
): string {
  const files = Object.entries(summary)
    .filter(([path]) => path !== 'total')
    .map(([path, entry]) => [relativePath(path, root), entry] as const);

  const rows = folders.map((folder) => {
    const inFolder = files.filter(([path]) => path.startsWith(folder));
    const cells = METRICS.map((metric) => {
      const sum = inFolder.reduce(
        (acc, [, entry]) => ({
          total: acc.total + entry[metric].total,
          covered: acc.covered + entry[metric].covered,
        }),
        { total: 0, covered: 0 },
      );
      const value = pct(sum);
      return { value, ok: value >= threshold };
    });
    return { folder, cells, ok: inFolder.length > 0 && cells.every((c) => c.ok) };
  });

  const allOk = rows.every((r) => r.ok);
  const cell = (c: { value: number; ok: boolean }) => `${c.value.toFixed(1)}%${c.ok ? '' : ' ❌'}`;
  const total = summary.total;
  return [
    `### ${allOk ? '✅' : '❌'} Coverage gate: every folder ≥ ${threshold}%`,
    '',
    '| Folder | Statements | Branches | Functions | Lines |',
    '|---|---:|---:|---:|---:|',
    ...rows.map((r) => `| \`${r.folder}\` | ${r.cells.map(cell).join(' | ')} |`),
    ...(total
      ? [
          `| **All files** (not gated) | ${METRICS.map((m) => `${pct(total[m]).toFixed(1)}%`).join(' | ')} |`,
        ]
      : []),
    '',
  ].join('\n');
}

export interface StepResult {
  readonly name: string;
  /** `steps.<id>.outcome`: success | failure | cancelled | skipped */
  readonly outcome: string;
}

const OUTCOME_ICON: Readonly<Record<string, string>> = {
  success: '✅',
  failure: '❌',
  cancelled: '⏹️',
  skipped: '⏭️',
};

/** A job's checks as one table, for jobs that run commands rather than Jest. */
export function renderSteps(title: string, steps: readonly StepResult[]): string {
  const ok = steps.every((s) => s.outcome === 'success' || s.outcome === 'skipped');
  return [
    `## ${ok ? '✅' : '❌'} ${title}`,
    '',
    '| Check | Result |',
    '|---|---|',
    ...steps.map(
      (s) => `| ${s.name} | ${OUTCOME_ICON[s.outcome] ?? '❔'} ${s.outcome || 'not run'} |`,
    ),
    '',
  ].join('\n');
}
