/**
 * Render the social card to public/og.png (1200×630).
 *
 * Uses headless Chromium (not sharp/librsvg) so the card can load the real
 * self-hosted display face, Bricolage Grotesque, embedded as a data URI. The
 * card echoes the homepage "Build Plate": dark green-ink paper, a structural
 * halftone, corner registration marks, the wordmark, and the marigold seal.
 * Run: node --import tsx scripts/gen-og.ts
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';

function findChromium(): string | undefined {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  const dir = readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
  if (!dir) return undefined;
  const bin = `${base}/${dir}/chrome-linux/chrome`;
  return existsSync(bin) ? bin : undefined;
}

const fontB64 = readFileSync('public/fonts/bricolage-grotesque-latin.woff2').toString('base64');

// Brand tokens (dark theme) — kept in sync with src/styles/tokens.css.
const BG = '#0F1814';
const INK = '#E7ECE4';
const INK_SOFT = '#9FB0A6';
const STRUCTURE = '#45B886';
const SIGNAL = '#F2B23E';
const EDGE = '#29342E';

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face {
    font-family: 'Bricolage Grotesque';
    font-weight: 200 800;
    font-style: normal;
    src: url(data:font/woff2;base64,${fontB64}) format('woff2');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  .card {
    position: relative; width: 1200px; height: 630px; overflow: hidden;
    background: ${BG}; color: ${INK}; padding: 76px 80px;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .halftone {
    position: absolute; inset: 0; pointer-events: none;
    background-image: radial-gradient(rgba(69,184,134,0.18) 1.4px, transparent 1.7px);
    background-size: 13px 13px;
    -webkit-mask-image: linear-gradient(125deg, #000, transparent 58%);
  }
  .reg { position: absolute; width: 26px; height: 26px; border: 3px solid ${STRUCTURE}; }
  .tl { top: 34px; left: 34px; border-right: 0; border-bottom: 0; }
  .tr { top: 34px; right: 34px; border-left: 0; border-bottom: 0; }
  .bl { bottom: 34px; left: 34px; border-right: 0; border-top: 0; }
  .br { bottom: 34px; right: 34px; border-left: 0; border-top: 0; }
  .brand { display: flex; align-items: center; gap: 18px; }
  .mark { position: relative; width: 62px; height: 62px; border-radius: 15px; background: #1E7A54;
    display: flex; align-items: center; justify-content: center; }
  .mark::after { content: ''; position: absolute; left: 0; bottom: -5px; width: 60%; height: 5px;
    border-radius: 999px; background: ${SIGNAL}; }
  .brandword { font-family: 'Bricolage Grotesque'; font-weight: 800; font-size: 30px;
    letter-spacing: -0.02em; color: ${INK}; }
  .rail { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 19px; letter-spacing: 0.14em;
    text-transform: uppercase; color: ${INK_SOFT}; margin-left: auto; }
  h1 { font-family: 'Bricolage Grotesque'; font-weight: 800; letter-spacing: -0.03em;
    line-height: 0.97; font-size: 96px; color: ${INK}; margin-top: 96px; max-width: 880px; }
  .tagline { font-size: 31px; line-height: 1.42; color: ${INK_SOFT}; margin-top: 30px; max-width: 760px; }
  .meta { position: absolute; left: 80px; bottom: 64px; font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 21px; letter-spacing: 0.1em; text-transform: uppercase; color: ${INK_SOFT}; }
  .meta b { color: ${STRUCTURE}; font-weight: 700; }
  .seal { position: absolute; right: 84px; top: 150px; transform: rotate(-7deg); }
</style></head><body>
  <div class="card">
    <div class="halftone"></div>
    <span class="reg tl"></span><span class="reg tr"></span><span class="reg bl"></span><span class="reg br"></span>

    <div class="brand">
      <span class="mark">
        <svg width="34" height="34" viewBox="0 0 34 34"><path d="M6 18 l7 7 l15 -17" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      <span class="brandword">We Can Just Build Things</span>
      <span class="rail">Build Plate · Rev 2026</span>
    </div>

    <h1>We can just<br/>build things.</h1>
    <p class="tagline">Tools that protect your community — built with an AI agent, grounded in verified freedom tech.</p>

    <div class="meta"><b>Verified freedom tech</b> · Nostr · AT Protocol · yours to fork</div>

    <div class="seal">
      <svg width="208" height="208" viewBox="0 0 132 132">
        <defs><path id="arc" d="M66,66 m-50,0 a50,50 0 1,1 100,0 a50,50 0 1,1 -100,0"/></defs>
        <circle cx="66" cy="66" r="62" fill="none" stroke="${SIGNAL}" stroke-width="2.5"/>
        <circle cx="66" cy="66" r="40" fill="none" stroke="${SIGNAL}" stroke-width="1.5"/>
        <text fill="${SIGNAL}" font-family="ui-monospace, Menlo, monospace" font-size="9.2" font-weight="700" letter-spacing="1.4">
          <textPath href="#arc" startOffset="0">· VERIFIED · FREEDOM TECH · BUILT TO OUTLAST&#160;</textPath>
        </text>
        <path d="M50 67 l11 11 l24 -28" fill="none" stroke="${SIGNAL}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  </div>
</body></html>`;

const executablePath = findChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
await page.waitForTimeout(200);
mkdirSync('public', { recursive: true });
await page.screenshot({ path: 'public/og.png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log('Wrote public/og.png');
