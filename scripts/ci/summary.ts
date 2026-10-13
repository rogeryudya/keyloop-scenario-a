/**
 * Writes a job's section of the GitHub Actions run summary (`$GITHUB_STEP_SUMMARY`; stdout when unset).
 *
 *   tsx scripts/ci/summary.ts jest  "<title>" <jest-report.json> [coverage-summary.json]
 *   tsx scripts/ci/summary.ts steps "<title>" "<check>=<outcome>" ...
 *
 * Never fails the job: a missing report is reported in the summary, and the job's own steps decide
 * pass or fail.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  CoverageEntry,
  JestReport,
  renderCoverageGate,
  renderJestReport,
  renderSteps,
} from './summary-render';

const root = resolve(__dirname, '../..');

function readJson<T>(path: string): T | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : undefined;
}

/** Gated folders and threshold, read from `coverageThreshold` in jest.config.js (single source). */
function coverageGate(): { folders: string[]; threshold: number } {
  const config = createRequire(__filename)(resolve(root, 'jest.config.js')) as {
    coverageThreshold?: Record<string, Partial<Record<string, number>>>;
  };
  const entries = Object.entries(config.coverageThreshold ?? {});
  return {
    folders: entries.map(([dir]) => dir.replace(/^\.\//, '')),
    threshold: Math.min(...entries.flatMap(([, t]) => Object.values(t).map(Number))),
  };
}

function render([mode, title = 'Results', ...rest]: string[]): string {
  if (mode === 'jest') {
    const [reportPath = '', coveragePath] = rest;
    const report = readJson<JestReport>(resolve(reportPath));
    if (!report) {
      return `## ❌ ${title}\n\nNo test report was written: the tests didn't run to completion. See the job log.\n`;
    }
    let markdown = renderJestReport(title, report, root);
    const coverage = coveragePath
      ? readJson<Record<string, CoverageEntry>>(resolve(coveragePath))
      : undefined;
    if (coverage) {
      const { folders, threshold } = coverageGate();
      markdown += '\n' + renderCoverageGate(coverage, folders, threshold, root);
    }
    return markdown;
  }
  if (mode === 'steps') {
    const steps = rest.map((arg) => {
      const at = arg.lastIndexOf('=');
      return { name: arg.slice(0, at), outcome: arg.slice(at + 1) };
    });
    return renderSteps(title, steps);
  }
  throw new Error(`unknown mode "${mode ?? ''}": use jest or steps`);
}

try {
  const markdown = render(process.argv.slice(2));
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) appendFileSync(target, markdown + '\n');
  else process.stdout.write(markdown + '\n');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
}
