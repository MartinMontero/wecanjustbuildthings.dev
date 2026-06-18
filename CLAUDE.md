# CLAUDE.md — wecanjustbuildthings.dev

Astro Starlight site on Cloudflare Pages that guides non-developers through
agentic software development. Four components share ONE client-side build-session
object: Build Studio, Mentor Engine, Skills Creator, Catalog. Plus a Hosting Cost
Estimator module and a dataset-backed catalog pipeline (Astro 5 Content Layer Zod
schema, ~842 YAML entries).

## Non-negotiable constraints — YOU MUST follow these every session

1. MODEL-FREE "PATH A". The deployed platform makes ZERO inference/LLM API calls,
   with EXACTLY ONE permitted exception: the single deterministic structured-
   reflection step. NEVER add a new runtime inference/LLM call anywhere. If you
   find one beyond the permitted exception, flag it — do not add more.

2. VENDOR EXCLUSIONS. NEVER add dependencies, SDKs, endpoints, fonts, or
   references from Meta, OpenAI, or xAI. GOOGLE IS EXPLICITLY PERMITTED (Google
   Fonts, Analytics, reCAPTCHA, Maps, OSV-Scanner, Lighthouse). ONLY Meta/OpenAI/
   xAI are excluded.

3. CLOUDFLARE-NATIVE. Stay on Cloudflare Pages + existing D1/KV/R2/Workers
   bindings. NEVER propose migrating off Cloudflare. (Astro is now a Cloudflare
   company — prefer native features: built-in hash-based CSP, Secrets Store,
   bindings.)

4. PRESERVE `operational_advisory`. This blocking CI check MUST NOT be weakened,
   disabled, or bypassed. New CI steps must be ADDITIVE only (new workflow files).

5. EDITORIAL/ENGINEERING STANDARDS. Primary sources only. ZERO fabrication. ZERO
   inference of facts (file paths, env var names, config values, behavior). When
   information is missing or ambiguous, STOP AND ASK — never guess.

## Stop-and-ask triggers — halt and ask the human
- A task would require guessing missing or ambiguous information.
- A change would weaken or bypass `operational_advisory`.
- A change would add a Meta/OpenAI/xAI dependency, or a new runtime inference call.
- Any migration off Cloudflare is implied.

<!-- Build commands, scripts, and project layout: run `/init` to populate these
     from the actual repo, then keep them current here. -->
