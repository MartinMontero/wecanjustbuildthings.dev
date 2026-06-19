import { readFileSync } from 'node:fs';
import type { DocEntry } from '../frontmatter.ts';
import type { ProviderSignals } from '../types.ts';
import { compileSignals, scanText, type CompiledSignal } from './scanner.ts';

export interface SkillFinding {
  skill_file: string;
  status: 'pass' | 'block';
  errors: string[];
  warnings: string[];
}

export interface SkillValidationContext {
  signals: ProviderSignals[];
  /** Pre-compiled signals, so a batch of skills compiles the regex set once. */
  compiled?: CompiledSignal[];
}

/**
 * Validate a contributed skill (entry_type: 'skill'). A skill is a reusable method the
 * agent follows VERBATIM and that ships in the build, so it must never route the builder
 * to an excluded provider. The Zod schema (src/schema/catalog.ts) already enforces the
 * structural shape at `astro check`; this is the provider-exclusion floor the schema
 * cannot express — the same Layer-3 signal scan recipes and source trees get:
 *
 *  - provider-string scan over the WHOLE file (frontmatter method + markdown body) for any
 *    Meta/OpenAI/xAI endpoint, SDK import, or config key → block (a skill is published as-is,
 *    so a provider reference in it is a silent excluded-vendor leak);
 *  - structural defence-in-depth: a skill needs ≥1 method step and a license, so a skill
 *    that somehow bypassed the schema still fails the blocking enforcement gate.
 *
 * `rawContent` is the file's full text, so the body is scanned, not just the frontmatter.
 * Pure (no I/O) — the caller reads the file; `validateSkillFile` is the disk-backed wrapper.
 */
export function validateSkill(
  entry: DocEntry,
  rawContent: string,
  ctx: SkillValidationContext,
): SkillFinding {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fm = entry.frontmatter;

  const method = Array.isArray(fm.skill_method) ? fm.skill_method : [];
  if (method.length === 0) errors.push('a skill requires at least one skill_method step');
  if (typeof fm.skill_license !== 'string' || !fm.skill_license.trim()) {
    errors.push('a skill requires skill_license (e.g. CC-BY-SA-4.0)');
  }

  const compiled = ctx.compiled ?? compileSignals(ctx.signals);
  for (const f of scanText(rawContent, entry.file, compiled)) {
    errors.push(
      `excluded-provider ${f.signal_kind} "${f.matched_text}" (${f.org_key}) at line ${f.line} — ` +
        'a skill ships verbatim and must never route to Meta/OpenAI/xAI',
    );
  }

  return { skill_file: entry.file, status: errors.length > 0 ? 'block' : 'pass', errors, warnings };
}

/** Disk-backed wrapper: read the skill file and validate its full text. */
export function validateSkillFile(entry: DocEntry, ctx: SkillValidationContext): SkillFinding {
  let raw = '';
  try {
    raw = readFileSync(entry.file, 'utf8');
  } catch {
    return { skill_file: entry.file, status: 'block', errors: ['could not read skill file'], warnings: [] };
  }
  return validateSkill(entry, raw, ctx);
}
