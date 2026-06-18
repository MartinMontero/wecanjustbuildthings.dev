# Translations & i18n status

The site ships in three locales: **English** (root, no prefix), **Spanish** (`es`),
and **Arabic** (`ar`, RTL). Untranslated pages fall back to English automatically,
so the site stays usable while translation proceeds.

## Conventions (read before adding a translation)

A translated page lives at `src/content/docs/<locale>/<same path as English>`.

1. **Frontmatter** — translate the `title`, `description`, and `sidebar.label`
   *values* only. Quote any value containing a colon (`description: "…: …"`),
   or YAML will reject it.
2. **Relative imports** — locale files sit one directory deeper than the English
   original, so every relative import needs **one extra `../`**
   (`../../../components/X` → `../../../../components/X`).
3. **Interactive components** — pass `lang="es"` / `lang="ar"` (Build Studio,
   Cost Estimator, Policy Checker, Model Compass already read it).
4. **Internal links** — prefix with the locale (`/build/` → `/es/build/`).
   Leave external `https://` links and `#anchors` untouched.
5. **Never translate** code, identifiers, filenames, shell commands, or brand
   names (Goose, Claude Code, Nostr, AT Protocol, npm, …).
6. **Arabic** — Modern Standard Arabic; don't add `dir` attributes (the site
   handles RTL); flip directional arrows (`→` ↔ `←`) where they aid reading.

## Status

### Human-authored / reviewed
- `index` (home), `build/cost`, `build/models`, `policies/supply-chain-security`
  — es + ar
- Interactive tools (Build Studio, Cost Estimator, Model Compass) via the
  in-code `Record<Lang, …>` string tables.

### AI-translated — pending native review
All other narrative pages were machine-translated (es + ar) and need a native
speaker's pass for tone and idiom before being considered final:

- `start/how-it-works`, `start/index`, `start/vs-harness`, `start/quickstart`
- `policies/index`, `policies/enforcement`, `privacy`, `security`
- `method/index`, `method/ten-questions`
- `recipes/index`, `recipes/shakespeare-byok-configuration`
- `pie/about`, `pie/kitchen-prep`, `pie/baking-pie`, `pie/cooking`,
  `pie/appendix`, `pie/other-flavors`
- `guides/connect-github`, `guides/get-started-with-goose`,
  `guides/knowledge-to-skills`
- `about`, `build`, `check`, `contribute/index`

### Catalog
- **Chrome — done (es + ar).** The catalog UI/frame is fully localized: the
  explorer (`CatalogExplorer.svelte`) via a `Record<Lang, …>` string table, the
  list view, the "Build with this" button, and the catalog landing pages.
- **Entry prose (~2,182 entries) — pipeline built, run pending.** A standalone
  generator translates each entry's free text (`description`, `what_it_does`) and
  body prose into es + ar, preserving all markup, code, identifiers, URLs, and
  metadata values, localizing internal links, and stamping
  `machine_translated: true` for native review. See below.

## Catalog translation pipeline (`scripts/translate-catalog.ts`)

A **separate** generator from the Astro build — the build stays offline and
deterministic; this script emits committed `.mdx` files that override Starlight's
English fallback for `es`/`ar`. The translation engine is **Claude** (Anthropic);
excluded providers (OpenAI, xAI, Meta) are deliberately not used, in keeping with
the catalog's own policy.

```sh
npm run translate:catalog                      # dry-run (identity, no network) — verifies plumbing
npm run translate:catalog -- --tag             # dry-run with [es]/[ar] markers to inspect segmentation
npm run translate:catalog -- --provider anthropic            # real translation (needs ANTHROPIC_API_KEY)
npm run translate:catalog -- --provider anthropic --lang es --limit 50   # a first wave
```

**In CI (recommended):** the `Translate catalog` workflow
(`.github/workflows/translate-catalog.yml`) runs the pipeline on demand
(`workflow_dispatch`) using an `ANTHROPIC_API_KEY` repository secret, then opens a
pull request with the generated entries for native review — translations are
never merged automatically. Inputs let you pick languages, a per-run `limit`
(translate in waves), the model, and `force`. Because the generator skips entries
that already have output files, each run continues where the last left off.

- **Requirements to run for real:** `ANTHROPIC_API_KEY` (a repo secret for CI, or
  in the environment for a local run; optionally `ANTHROPIC_BASE_URL`), plus
  network access to the API.
- **Resumable / incremental:** skips entries whose output already exists (use
  `--force` to overwrite) and caches every distinct string in
  `.cache/catalog-i18n.<lang>.json`, so the repeated boilerplate is translated
  once and re-runs only touch new/changed entries. Safe to run in waves.
- **What it preserves:** all MDX/JSX/HTML tags + attributes, `<code>` and
  fenced/inline code, URLs, and the data values inside `<dl class="wcb-meta">`
  and the badges. Internal links get the locale prefix; `title` and every other
  frontmatter field are copied verbatim.
- Generated entries carry `machine_translated: true` and still need a native
  speaker's pass before being considered final.
