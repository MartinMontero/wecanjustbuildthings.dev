// audit/shoot.mjs — Phase-1 design-audit screenshots (3 widths per flow).
// Serves nothing itself: expects `npx astro preview` (or any static server) on
// PORT (default 4321). Output: audit/screens/<slug>-<width>.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SHOOT_BASE ?? 'http://localhost:4321';
const OUT = new URL('./screens/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ['landing', '/'],
  ['build-studio', '/build/'],
  ['cost-estimator', '/build/cost/'],
  ['model-compass', '/build/models/'],
  ['catalog-explorer', '/catalog/'],
  ['catalog-entry', '/catalog/nostr-tools/'],
  ['checker', '/check/'],
  ['method', '/method/'],
  ['pie-flow', '/pie/baking-pie/'],
  ['guides', '/guides/get-started-with-goose/'],
  ['console', '/console/'],
  ['landing-es', '/es/'],
  ['landing-ar', '/ar/'],
];
const WIDTHS = [[375, 812, 'mobile'], [768, 1024, 'tablet'], [1366, 900, 'desktop']];

// This environment pre-installs Chromium at a fixed path; never download browsers.
const browser = await chromium.launch({ executablePath: process.env.SHOOT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
let shot = 0;
const failures = [];
for (const [slug, path] of ROUTES) {
  for (const [w, h, label] of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    try {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
      if (!res || res.status() >= 400) { failures.push(`${path} ${label}: HTTP ${res?.status()}`); await page.close(); continue; }
      await page.waitForTimeout(600); // islands settle
      await page.screenshot({ path: `${OUT}${slug}-${label}.png`, fullPage: true });
      shot += 1;
    } catch (e) {
      failures.push(`${path} ${label}: ${e.message.split('\n')[0]}`);
    }
    await page.close();
  }
}
await browser.close();
console.log(`shots: ${shot}`);
if (failures.length) { console.log('failures:'); for (const f of failures) console.log(' -', f); }
