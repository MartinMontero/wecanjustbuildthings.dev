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

### Not yet localized
- **Catalog entries** (~2,182): chrome to be localized; per-entry prose to be
  machine-translated via a pipeline (code/identifiers left intact), then
  native-reviewed.
