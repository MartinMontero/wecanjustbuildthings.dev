/**
 * Accessibility gate: load canonical pages in headless Chromium and run axe-core.
 * Fails (exit 1) on any serious or critical WCAG 2.1 A/AA violation.
 *
 * Serves the built site with `astro preview`, so run `npm run build` first.
 * Run: node scripts/a11y-check.mjs
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const PORT = 4399;
const BASE = `http://localhost:${PORT}`;
const PATHS = [
  '/',
  '/start/',
  '/start/vs-harness/',
  '/pie/about/',
  '/pie/cooking/',
  '/policies/',
  '/policies/enforcement/',
  '/privacy/',
  '/security/',
  '/contribute/',
  '/catalog/',
  '/catalog/nostr-tools/',
  '/recipes/shakespeare-byok-configuration/',
];

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const server = spawn('npm', ['run', 'preview', '--', '--port', String(PORT)], {
  stdio: 'ignore',
  detached: false,
});

let exitCode = 0;
try {
  if (!(await waitForServer(`${BASE}/`))) {
    console.error('preview server did not start');
    process.exit(1);
  }
  const browser = await chromium.launch();
  for (const path of PATHS) {
    const page = await browser.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    if (serious.length > 0) {
      exitCode = 1;
      console.log(`✗ ${path}`);
      for (const v of serious) {
        console.log(`    [${v.impact}] ${v.id}: ${v.help} — ${v.nodes.length} node(s)`);
        console.log(`      ${v.helpUrl}`);
      }
    } else {
      console.log(`✓ ${path}`);
    }
    await page.close();
  }
  await browser.close();
} finally {
  server.kill();
}

console.log(exitCode === 0 ? '\nAccessibility: no serious/critical violations.' : '\nAccessibility: violations found.');
process.exit(exitCode);
