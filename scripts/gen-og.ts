/** Rasterize the social-card SVG to public/og.png (1200×630) with sharp. */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#241152"/>
      <stop offset="1" stop-color="#0b0717"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g transform="translate(80,90)">
    <rect width="86" height="86" rx="18" fill="#6d3bd6"/>
    <path d="M22 46 l14 14 l30 -36" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="80" y="300" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="74" font-weight="800" fill="#ffffff">We Can Just Build Things</text>
  <text x="80" y="372" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="34" font-weight="500" fill="#c9b6f5">The orchestration layer above your AI agent.</text>
  <text x="80" y="430" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="30" font-weight="400" fill="#b9b2cf">Verified open-source tools · a guided flow · a policy engine with teeth.</text>
  <text x="80" y="560" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="26" font-weight="600" fill="#7c5fd3">Nostr · AT Protocol · freedom tech — built with Goose &amp; Claude Code</text>
</svg>`;

mkdirSync('public', { recursive: true });
await sharp(Buffer.from(svg)).png().toFile('public/og.png');
console.log('Wrote public/og.png');
