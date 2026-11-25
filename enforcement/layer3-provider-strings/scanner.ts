import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { IGNORE_DIRS, walkFiles } from '../fs-walk.ts';
import { firstLine, type InputError } from '../input-errors.ts';
import type { Layer3Finding, LayerReport, ProviderSignals } from '../types.ts';

/**
 * Portable, dependency-free provider-string scanner. The original plan reached
 * for ripgrep; a pure-JS line scanner is fully deterministic, needs no external
 * binary, and is trivial to unit-test. At our scale (a single tool's source
 * tree) the performance difference is irrelevant.
 */

const CODE_EXT = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts',
  '.py', '.rs', '.go', '.rb', '.ex', '.exs', '.kt', '.kts', '.dart', '.php', '.swift',
]);
const CONFIG_EXT = new Set([
  '.env', '.yaml', '.yml', '.json', '.toml', '.ini', '.sh', '.bash',
  '.cfg', '.conf', '.properties', '.xml', '.gradle',
]);
const MAX_BYTES = 2 * 1024 * 1024;

export interface CompiledSignal {
  org_key: string;
  kind: Layer3Finding['signal_kind'];
  re: RegExp;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function compileSignals(signals: ProviderSignals[]): CompiledSignal[] {
  const compiled: CompiledSignal[] = [];
  for (const s of signals) {
    for (const ep of s.endpoints) {
      // Endpoints are DNS hostnames, which are case-insensitive by spec, so the
      // match must be too — otherwise an upper/mixed-case spelling of the host
      // evades a case-sensitive pattern. Config keys (env-var names) and import
      // patterns stay case-sensitive: those identifiers are case-significant.
      compiled.push({ org_key: s.key, kind: 'endpoint', re: new RegExp(escapeRegExp(ep), 'i') });
    }
    for (const ck of s.config_keys) {
      compiled.push({ org_key: s.key, kind: 'config_key', re: new RegExp(`\\b${escapeRegExp(ck)}\\b`) });
    }
    for (const patterns of Object.values(s.imports)) {
      for (const p of patterns ?? []) {
        // import patterns are authored as regular expressions already
        compiled.push({ org_key: s.key, kind: 'import', re: new RegExp(p) });
      }
    }
  }
  return compiled;
}

/** Scan a single file's text. Exposed for unit tests without touching disk. */
export function scanText(content: string, file: string, compiled: CompiledSignal[]): Layer3Finding[] {
  const findings: Layer3Finding[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    for (const sig of compiled) {
      const m = sig.re.exec(line);
      if (m) {
        findings.push({
          file,
          line: i + 1,
          column: m.index + 1,
          signal_kind: sig.kind,
          org_key: sig.org_key,
          matched_text: m[0],
        });
      }
    }
  }
  return findings;
}

export function runLayer3OnTree(root: string, signals: ProviderSignals[]): LayerReport<Layer3Finding> {
  const compiled = compileSignals(signals);
  const findings: Layer3Finding[] = [];
  const warnings: string[] = [];
  // Fail closed: a directory or file that cannot be read is a named error, not
  // a silent skip (a --tree that does not exist used to report "0 files clean").
  const errors: InputError[] = [];
  let scanned = 0;

  const onUnreadableDir = (dir: string, err: unknown) =>
    errors.push({ file: dir, reason: 'unreadable_directory', detail: `could not list directory: ${firstLine(err)}` });

  for (const file of walkFiles(root, IGNORE_DIRS, onUnreadableDir)) {
    const ext = extname(file);
    if (!CODE_EXT.has(ext) && !CONFIG_EXT.has(ext)) continue;
    let size = 0;
    try {
      size = statSync(file).size;
    } catch (err) {
      errors.push({ file, reason: 'unreadable_file', detail: `could not stat file: ${firstLine(err)}` });
      continue;
    }
    if (size > MAX_BYTES) {
      // A visible, named skip (not silent): scanning very large generated bundles is a policy choice.
      warnings.push(`${file}: skipped (exceeds ${MAX_BYTES} bytes)`);
      continue;
    }
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch (err) {
      errors.push({ file, reason: 'unreadable_file', detail: `could not read file: ${firstLine(err)}` });
      continue;
    }
    scanned += 1;
    findings.push(...scanText(text, file, compiled));
  }

  // Imports are the strongest signal; endpoints/config keys can appear in
  // negative contexts, so a tree with only those is reported as block but the
  // caller is reminded to review.
  const onlySoft = findings.length > 0 && findings.every((f) => f.signal_kind !== 'import');
  if (onlySoft) {
    warnings.push('Only endpoint/config-key signals matched (no SDK imports). Review for negative contexts (e.g. "we do NOT call …").');
  }

  return {
    layer: 3,
    status: findings.length > 0 || errors.length > 0 ? 'block' : 'pass',
    findings,
    warnings,
    errors,
    scanned,
    generated_at: new Date().toISOString(),
  };
}
