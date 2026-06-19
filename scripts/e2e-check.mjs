/**
 * Behavioral E2E gate for the interactive islands. Boots the built site with
 * `astro preview` and drives the REAL hydrated components in headless Chromium —
 * coverage the in-process unit suite (node:test) can't give, because the islands only
 * exist after Astro hydration. Mirrors scripts/a11y-check.mjs (same preview + browser
 * pattern, no new dependencies; uses node:assert for checks).
 *
 * Run `npm run build` first, then `node scripts/e2e-check.mjs` (or `npm run test:e2e`).
 * Add a new island spec by pushing onto TESTS — each gets a fresh context (so
 * localStorage is isolated) and a page.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const PORT = 4398;
const BASE = `http://localhost:${PORT}`;
const SESSION_KEY = 'wcb.build-session.v1';

/** Use a preinstalled Chromium if present (matches a11y-check.mjs), else Playwright's. */
function findChromium() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  const dir = readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
  if (!dir) return undefined;
  const bin = `${base}/${dir}/chrome-linux/chrome`;
  return existsSync(bin) ? bin : undefined;
}

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

/** Read + parse the shared build session out of the page's localStorage. */
const readSession = (page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), SESSION_KEY);

// ---- specs (extend this list as islands gain behavior) --------------------------
const TESTS = [
  {
    name: 'Catalog: "Add to build" stages a tool, shows the tray, and seeds the Studio link',
    async run(browser) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE}/catalog/`, { waitUntil: 'load' });
        const btn = page.locator('.card-build').first(); // only tool cards have it
        await btn.waitFor({ state: 'visible', timeout: 20000 });
        assert.equal(await btn.getAttribute('aria-pressed'), 'false', 'starts un-pressed');
        assert.equal(await page.locator('.build-tray').count(), 0, 'tray hidden until something is staged');

        await btn.click();

        assert.equal(await btn.getAttribute('aria-pressed'), 'true', 'toggles to pressed');
        const tray = page.locator('.build-tray');
        await tray.waitFor({ state: 'visible', timeout: 5000 });
        assert.match(await tray.locator('.build-tray__count').innerText(), /\b1\b/, 'tray shows count 1');

        const session = await readSession(page);
        assert.ok(session, 'session persisted to localStorage');
        assert.equal(session.adjustments.extra.length, 1, 'one tool staged');
        const tool = session.adjustments.extra[0];
        assert.equal(session.seededTool, tool, 'adding seeds the tool (the Studio opens at it)');

        const href = await tray.locator('.build-tray__cta').getAttribute('href');
        assert.ok(href.includes('/build/?seed='), `CTA opens the Studio oriented: ${href}`);
        assert.ok(href.includes(encodeURIComponent(tool)), 'CTA seeds the staged tool');
      } finally {
        await ctx.close();
      }
    },
  },
  {
    name: 'Catalog: toggling off removes the tool and hides the tray',
    async run(browser) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE}/catalog/`, { waitUntil: 'load' });
        const btn = page.locator('.card-build').first();
        await btn.waitFor({ state: 'visible', timeout: 20000 });
        await btn.click(); // add
        assert.equal(await btn.getAttribute('aria-pressed'), 'true');
        await btn.click(); // remove
        assert.equal(await btn.getAttribute('aria-pressed'), 'false', 'toggles back off');
        await page.locator('.build-tray').waitFor({ state: 'detached', timeout: 5000 });
        const session = await readSession(page);
        assert.equal(session.adjustments.extra.length, 0, 'nothing staged');
        assert.equal(session.seededTool, null, 'removing the seed clears it');
      } finally {
        await ctx.close();
      }
    },
  },
  {
    name: 'Catalog: staged selection survives a reload (reads the session on mount)',
    async run(browser) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE}/catalog/`, { waitUntil: 'load' });
        const btn = page.locator('.card-build').first();
        await btn.waitFor({ state: 'visible', timeout: 20000 });
        await btn.click();
        const staged = (await readSession(page)).adjustments.extra[0];

        await page.reload({ waitUntil: 'load' });
        const again = page.locator('.card-build').first(); // stable sort ⇒ same first tool
        await again.waitFor({ state: 'visible', timeout: 20000 });
        assert.equal(await again.getAttribute('aria-pressed'), 'true', 'still shows "in your build" after reload');
        assert.match(await page.locator('.build-tray__count').innerText(), /\b1\b/, 'tray restored');
        assert.equal((await readSession(page)).adjustments.extra[0], staged, 'same tool persisted');
      } finally {
        await ctx.close();
      }
    },
  },
  {
    name: 'Build Studio: "Open in Goose" renders an explain panel + a goose:// recipe deeplink',
    async run(browser) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE}/build/`, { waitUntil: 'load' });
        // Jump to the hand-off step (its nav button is only disabled while loading).
        await page.waitForFunction(
          () => {
            const b = document.querySelector('ol.steps li:nth-child(3) button');
            return b && !b.disabled;
          },
          { timeout: 20000 },
        );
        await page.locator('ol.steps li:nth-child(3) button').click();
        await page.getByText('Run it with Goose', { exact: true }).click();

        // Explain-before-launch is shown, and the one-click deeplink is a goose:// recipe URL.
        await page.locator('.goose-explain').waitFor({ state: 'visible', timeout: 5000 });
        const link = page.locator('a.primary[href^="goose://recipe?config="]');
        await link.waitFor({ state: 'visible', timeout: 5000 });
        const href = await link.getAttribute('href');
        assert.ok(href && href.startsWith('goose://recipe?config='), 'deeplink is a goose recipe URL');
        assert.ok(href.length > 'goose://recipe?config='.length + 40, 'config payload is non-trivial');
      } finally {
        await ctx.close();
      }
    },
  },
];

const server = spawn('npm', ['run', 'preview', '--', '--port', String(PORT)], { stdio: 'ignore', detached: false });
let exitCode = 0;
try {
  if (!(await waitForServer(`${BASE}/`))) {
    console.error('preview server did not start');
    process.exit(1);
  }
  const executablePath = findChromium();
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    for (const test of TESTS) {
      try {
        await test.run(browser);
        console.log(`✓ ${test.name}`);
      } catch (err) {
        exitCode = 1;
        console.log(`✗ ${test.name}`);
        console.log(`    ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}

console.log(exitCode === 0 ? '\nE2E: all island behaviors pass.' : '\nE2E: failures found.');
process.exit(exitCode);
