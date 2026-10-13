// Runs inside the Playwright container (see render-diagrams.ts). Screenshots each diagram figure of
// docs/diagrams/blueprints.html in light and dark mode into docs/diagrams/<name>-<scheme>.png.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS script resolved via NODE_PATH in the container
const { chromium } = require('playwright');

const PAGE = 'file:///work/docs/diagrams/blueprints.html';
const OUT = '/work/docs/diagrams';
const SHOTS = [
  { tab: 'data', figure: 0, name: 'data-model' },
  { tab: 'traffic', figure: 0, name: 'request-pipeline' },
  { tab: 'traffic', figure: 1, name: 'happy-path-sequence' },
  { tab: 'stack', figure: 0, name: 'tech-stack' },
];

(async () => {
  const browser = await chromium.launch();
  try {
    for (const colorScheme of ['light', 'dark']) {
      const page = await browser.newPage({
        viewport: { width: 1180, height: 900 },
        deviceScaleFactor: 2,
        colorScheme,
      });
      await page.goto(PAGE, { waitUntil: 'networkidle' });
      await page.evaluate('document.fonts.ready'); // runs in the page: wait for the web fonts
      for (const shot of SHOTS) {
        // Switch tabs like a reader; a hash-only navigation doesn't reload the page.
        await page.click(`#tab-${shot.tab}`);
        const path = `${OUT}/${shot.name}-${colorScheme}.png`;
        await page.locator(`#${shot.tab} figure`).nth(shot.figure).screenshot({ path });
        console.log(`wrote ${path.replace('/work/', '')}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
