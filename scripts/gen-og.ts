/** Rasterize the social-card SVG to public/og.png (1200×630) with sharp. */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

// Brand social card (Design Field Card): ink paper, forest-green mark, a coral
// rule, warm copy. The monospace eyebrow mirrors the site's editorial voice.
const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const sans = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#121613"/>
  <rect x="0" y="0" width="1200" height="10" fill="#FF6A4D"/>
  <g transform="translate(80,96)">
    <rect width="86" height="86" rx="18" fill="#168A5A"/>
    <path d="M22 46 l14 14 l30 -36" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="22" y="22" width="13" height="13" rx="3" fill="#fff" opacity="0.92"/>
    <rect x="41" y="22" width="13" height="13" rx="3" fill="#fff" opacity="0.92"/>
  </g>
  <text x="80" y="300" font-family="${mono}" font-size="26" letter-spacing="3" font-weight="700" fill="#46C088">WE CAN JUST BUILD THINGS</text>
  <text x="80" y="380" font-family="${sans}" font-size="54" font-weight="800" fill="#E7ECE3">Tell it what your community needs.</text>
  <text x="80" y="446" font-family="${sans}" font-size="32" font-weight="500" fill="#9FB0A4">An AI agent builds it — on foundations locked to your values.</text>
  <text x="80" y="556" font-family="${mono}" font-size="26" font-weight="600" fill="#FF8E78">Never Meta · OpenAI · xAI    ·    1,300+ vetted tools</text>
</svg>`;

mkdirSync('public', { recursive: true });
await sharp(Buffer.from(svg)).png().toFile('public/og.png');
console.log('Wrote public/og.png');
