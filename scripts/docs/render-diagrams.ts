/**
 * Renders the diagrams in docs/diagrams/blueprints.html to PNG (light + dark, 2x) for the README.
 *
 *   pnpm docs:diagrams
 *
 * Runs headless Chromium in Playwright's official image, so it needs only Docker: no browser or npm
 * dependency on the host. The in-container script is render-diagrams.inner.cjs.
 */
import { spawnSync } from 'node:child_process';

const PLAYWRIGHT_VERSION = '1.58.2'; // image tag and npm package must match
const image = `mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble`;

const result = spawnSync(
  'docker',
  [
    'run', '--rm',
    '-v', `${process.cwd()}:/work`,
    '-w', '/work',
    image,
    'sh', '-c',
    `cd /tmp && npm install --silent --no-audit --no-fund playwright@${PLAYWRIGHT_VERSION} >/dev/null && ` +
      'NODE_PATH=/tmp/node_modules node /work/scripts/docs/render-diagrams.inner.cjs',
  ], // prettier-ignore
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
