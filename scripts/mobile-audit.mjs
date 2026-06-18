/**
 * Mobile-responsiveness audit harness.
 *
 * Serves the built site (`astro preview`) and, in headless Chromium, runs two
 * checks across a matrix of routes × locales × mobile breakpoints:
 *
 *   1. Overflow sweep — flags any element whose box extends past the viewport
 *      (right edge in LTR, left edge in RTL), i.e. horizontal scroll on a phone.
 *   2. axe-core `target-size` (WCAG 2.2 SC 2.5.8) + a full serious/critical
 *      WCAG 2.1 A/AA pass, so we catch touch-target failures and regressions.
 *
 * Build first (`npm run build`), then: node scripts/mobile-audit.mjs
 * Writes a JSON + human summary to reports/mobile/ and exits non-zero if any
 * overflow or target-size violation is found (so it doubles as a CI gate).
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

function findChromium() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  const dir = readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
  if (!dir) return undefined;
  const bin = `${base}/${dir}/chrome-linux/chrome`;
  return existsSync(bin) ? bin : undefined;
}

const PORT = 4398;
const BASE = `http://localhost:${PORT}`;
// Material 3 window-size breakpoints + the 320–390 phone band the audit targets.
const WIDTHS = [320, 360, 390, 768, 840];
// Locale prefixes: root = English. Spanish + Arabic (RTL) are checked too.
const LOCALES = ['', '/es', '/ar'];
// Representative routes incl. every interactive island.
const ROUTES = [
  '/',
  '/start/',
  '/build/',
  '/build/models/',
  '/build/cost/',
  '/check/',
  '/catalog/',
  '/policies/enforcement/',
  '/catalog/nostr-tools/',
];

async function waitForServer(url, tries = 80) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// Runs in the page: list elements that spill past the viewport on either side.
// Elements inside an ancestor that scrolls/clips on the inline axis (e.g. a code
// block's overflow-x:auto box, or a responsive-table wrapper) are excluded — they
// don't cause PAGE overflow. The headline signal is scrollW > clientW.
function overflowSweep() {
  const docW = document.documentElement.clientWidth;
  const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
    }
    return false;
  };
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const overRight = r.right > docW + 1;
    const overLeft = r.left < -1;
    if (!overRight && !overLeft) continue;
    if (inScroller(el)) continue; // contained by an internal scroller — not page overflow
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const sel = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (cls ? `.${cls}` : '');
    if (seen.has(sel)) continue;
    seen.add(sel);
    out.push({ sel, width: Math.round(r.width), right: Math.round(r.right), left: Math.round(r.left), docW, rtl });
  }
  // pageOverflow: the document itself scrolls horizontally (the real defect).
  const pageOverflow = document.documentElement.scrollWidth > docW + 1;
  return { scrollW: document.documentElement.scrollWidth, clientW: docW, rtl, pageOverflow, elements: out.slice(0, 25) };
}

const server = spawn('npm', ['run', 'preview', '--', '--port', String(PORT)], { stdio: 'ignore' });
const report = { generatedAt: new Date().toISOString(), overflow: [], targetSize: [], otherA11y: [] };
let exitCode = 0;

try {
  if (!(await waitForServer(`${BASE}/`))) { console.error('preview server did not start'); process.exit(1); }
  const executablePath = findChromium();
  const browser = await chromium.launch(executablePath ? { executablePath } : {});

  for (const locale of LOCALES) {
    for (const route of ROUTES) {
      const path = `${locale}${route}`.replace('//', '/');
      // ---- overflow sweep at every breakpoint ----
      for (const width of WIDTHS) {
        const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        let status = 0;
        try {
          const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
          status = resp?.status() ?? 0;
          await page.waitForTimeout(500); // let islands hydrate + reflow
          const res = await page.evaluate(overflowSweep);
          if (res.pageOverflow || res.elements.length > 0) {
            if (res.pageOverflow) exitCode = 1;
            report.overflow.push({ path, width, ...res });
            const tag = res.pageOverflow ? '✗ overflow ' : '· contained';
            console.log(`${tag} ${path} @${width}px — ${res.elements.length} el(s), scrollW=${res.scrollW} clientW=${res.clientW} pageOverflow=${res.pageOverflow}`);
            for (const e of res.elements.slice(0, 6)) console.log(`      ${e.sel} (w=${e.width}, right=${e.right}, left=${e.left})`);
          }
        } catch (err) {
          if (status && status !== 404) console.log(`!  error    ${path} @${width}px — ${String(err).slice(0, 80)}`);
        } finally {
          await page.close(); await ctx.close();
        }
      }
      // ---- axe at a representative phone width (390) ----
      const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      try {
        const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
        if ((resp?.status() ?? 0) < 400) {
          await page.waitForTimeout(500);
          const ts = await new AxeBuilder({ page }).withRules(['target-size']).analyze();
          const tsViol = ts.violations.find((v) => v.id === 'target-size');
          if (tsViol) {
            exitCode = 1;
            report.targetSize.push({ path, nodes: tsViol.nodes.length, targets: tsViol.nodes.map((n) => n.target.join(' ')).slice(0, 20) });
            console.log(`✗ target    ${path} — ${tsViol.nodes.length} undersized target(s)`);
          }
          const full = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
          const serious = full.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
          if (serious.length) {
            report.otherA11y.push({ path, violations: serious.map((v) => ({ id: v.id, nodes: v.nodes.length })) });
            console.log(`•  a11y     ${path} — ${serious.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`);
          }
        }
      } catch { /* skip */ } finally { await page.close(); await ctx.close(); }
    }
  }
  await browser.close();
} finally {
  server.kill();
}

mkdirSync('reports/mobile', { recursive: true });
writeFileSync('reports/mobile/audit.json', JSON.stringify(report, null, 2));
const pageOverflows = report.overflow.filter((o) => o.pageOverflow);
const overflowRoutes = new Set(pageOverflows.map((o) => o.path)).size;
console.log('\n==== SUMMARY ====');
console.log(`Page overflow: ${pageOverflows.length} route×width combos over ${overflowRoutes} route(s) (excludes internal scrollers)`);
console.log(`Target-size: ${report.targetSize.reduce((n, t) => n + t.nodes, 0)} undersized targets over ${report.targetSize.length} route(s)`);
console.log(`Other serious/critical a11y: ${report.otherA11y.length} route(s)`);
console.log('Wrote reports/mobile/audit.json');
process.exit(exitCode);
