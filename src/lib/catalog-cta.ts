/**
 * catalog-cta.ts — the Catalog Explorer's Build Studio hand-off, made pure so
 * the locale routing is testable (BACKLOG D3 / PLAN M3).
 *
 * The bug this guards: the explorer's hero CTA hardlinked `/build/` — an es/ar
 * reader landed on the ENGLISH Studio. The base must follow the island's lang.
 */

/** Locale-prefixed Build Studio root. English lives at the root (no prefix). */
export function catalogBuildBase(lang: string): string {
  const v = (lang ?? '').toLowerCase().slice(0, 2);
  return v === 'es' || v === 'ar' ? `/${v}/build/` : '/build/';
}

/**
 * Where the CTA/tray points: the Studio opened at the current seed if there is
 * one, else at the first staged tool, else the Studio root. Seed values are
 * catalog slugs — always encoded.
 */
export function catalogBuildHref(
  lang: string,
  seed: string | null,
  inBuild: Iterable<string>,
): string {
  const base = catalogBuildBase(lang);
  const target = seed ?? [...inBuild][0];
  return target ? `${base}?seed=${encodeURIComponent(target)}` : base;
}
