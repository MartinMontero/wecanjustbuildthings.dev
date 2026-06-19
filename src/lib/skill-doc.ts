/**
 * skill-doc.ts — the Skills Creator's deterministic SKILL.md renderer (Movement 3).
 *
 * A builder captures a method they know (an intake process, a safety protocol) and
 * it is emitted as a SKILL.md in the knowledge-to-skills-pipeline format: YAML
 * frontmatter + a numbered method. Pure + framework-free so it is unit-testable
 * outside the Svelte island. No model, no network (Path A).
 */

/** A skill the builder authored or the BYOK agent drafted, before it becomes a SKILL.md. */
export interface DraftSkill {
  name: string;
  description: string;
  method: string[];
  source?: string;
}

/** Filesystem/registry-safe slug for a skill name: ASCII kebab-case, with a stable
 *  'skill' fallback for empty or non-Latin-only names (which collapse to ''). */
export function slugifySkill(name: string): string {
  return (name || 'skill').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skill';
}

/**
 * Encode a string as a safe YAML double-quoted scalar. The builder's `description`
 * and `source` are free text — a colon, `#`, quote, or backslash in them would break
 * naive `key: value` interpolation, so escape `\` and `"` and flatten any newline/tab
 * to a space. Keeps the generated frontmatter valid YAML for any input.
 */
export function yamlDoubleQuoted(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
  return `"${escaped}"`;
}

/**
 * Render a DraftSkill as a SKILL.md (frontmatter + numbered method). Deterministic;
 * the `name` slug is already YAML-safe (kebab ASCII), while `description` and
 * `source` are emitted as escaped double-quoted scalars.
 */
export function skillToMd(s: DraftSkill): string {
  const slug = slugifySkill(s.name);
  const title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const source = s.source || 'Described by the builder in the Build Studio';
  const steps = s.method.map((m, i) => `${i + 1}. ${m}`).join('\n');
  return `---\nname: ${slug}\ndescription: ${yamlDoubleQuoted(s.description)}\nattribution:\n  source: ${yamlDoubleQuoted(source)}\n  license: CC-BY-SA-4.0\n---\n\n# ${title}\n\n${steps}\n`;
}
