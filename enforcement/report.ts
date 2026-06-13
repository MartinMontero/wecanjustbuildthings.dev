import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function writeJsonReport(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
function c(color: keyof typeof COLORS, text: string): string {
  return useColor ? `${COLORS[color]}${text}${COLORS.reset}` : text;
}

export function heading(text: string): void {
  console.log(`\n${c('bold', text)}`);
}

export function pass(text: string): void {
  console.log(`${c('green', '✓')} ${text}`);
}
export function block(text: string): void {
  console.log(`${c('red', '✗')} ${text}`);
}
export function warn(text: string): void {
  console.log(`${c('yellow', '!')} ${text}`);
}
export function dim(text: string): void {
  console.log(c('dim', text));
}
