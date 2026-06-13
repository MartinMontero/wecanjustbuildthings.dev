<script lang="ts">
  import { onMount } from 'svelte';
  import { zipSync, strToU8 } from 'fflate';

  interface Item {
    name: string; url: string; ecosystem: string; category: string;
    protocols: string[]; license: string; verification: string; uses: number; desc: string; repo: string | null;
  }

  let items = $state<Item[]>([]);
  let loading = $state(true);
  let step = $state(1);

  // Step 1 — intent
  let projectName = $state('');
  let problem = $state('');
  let protocols = $state<Set<string>>(new Set(['nostr']));
  let focus = $state('social');

  // Step 2 — stack
  let chosen = $state<Set<string>>(new Set());
  let addQuery = $state('');

  const ALL_PROTOCOLS = ['nostr', 'atproto', 'lightning', 'cashu', 'general'];
  const FOCI: Record<string, { label: string; categories: string[] }> = {
    social: { label: 'Social / feed client', categories: ['Frameworks & Libraries', 'Dev Environment & Tooling'] },
    relay: { label: 'Relay / backend service', categories: ['Hosting Infra & Deploy', 'Databases & Storage', 'Monitoring & Observability'] },
    wallet: { label: 'Wallet / payments', categories: ['Bitcoin Lightning Nostr', 'Security & Privacy'] },
    safety: { label: 'Moderation / safety', categories: ['Security & Privacy', 'Auth Identity & Keys'] },
    general: { label: 'General app', categories: ['Frameworks & Libraries', 'Dev Environment & Tooling', 'Testing & QA'] },
  };

  onMount(async () => {
    try {
      const res = await fetch('/catalog.json');
      items = await res.json();
    } catch { /* offline */ }
    loading = false;
  });

  const slug = $derived((projectName || 'my-app').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'my-app');

  // Suggested stack: tools matching chosen protocols (or the focus categories), verified-leaning, top by adoption.
  const suggested = $derived.by(() => {
    if (!items.length) return [] as Item[];
    const cats = new Set(FOCI[focus]?.categories ?? []);
    const wantProto = protocols.size > 0;
    const scored = items
      .map((it) => {
        let score = it.uses;
        if (wantProto && it.protocols.some((p) => protocols.has(p))) score += 1000;
        if (cats.has(it.category)) score += 200;
        if (it.verification === 'verified') score += 50;
        return { it, score };
      })
      .filter((s) => s.score > 0 && (!wantProto || s.it.protocols.some((p) => protocols.has(p)) || cats.has(s.it.category)))
      .sort((a, b) => b.score - a.score)
      .slice(0, 14)
      .map((s) => s.it);
    return scored;
  });

  // Default-select the top suggestions once data + step 2 are reached.
  let seeded = false;
  $effect(() => {
    if (step === 2 && items.length && !seeded) {
      chosen = new Set(suggested.slice(0, 6).map((i) => i.name));
      seeded = true;
    }
  });

  const addResults = $derived.by(() => {
    const q = addQuery.trim().toLowerCase();
    if (!q) return [] as Item[];
    return items.filter((it) => `${it.name} ${it.desc}`.toLowerCase().includes(q)).slice(0, 8);
  });

  const chosenItems = $derived(items.filter((it) => chosen.has(it.name)));

  function toggleProto(p: string) {
    const n = new Set(protocols); n.has(p) ? n.delete(p) : n.add(p); protocols = n; seeded = false;
  }
  function toggleTool(name: string) {
    const n = new Set(chosen); n.has(name) ? n.delete(name) : n.add(name); chosen = n;
  }

  // ---------- generated artifacts ----------
  const protoList = $derived([...protocols].filter((p) => p !== 'general'));

  const constitution = $derived(`# Project constitution — ${projectName || slug}

Binding on every spec, plan, and task. Agents read this first and do not override
it without explicit human consent.

## Article I — Provider exclusion (non-negotiable)
No dependency, directly or transitively, may be owned by **Meta, OpenAI, or xAI**,
and no code may call their endpoints. Enforce before every commit:

    npx tsx ./enforcement/cli.ts all --tree .

Any AI assistance must use a permitted, bring-your-own-key provider (Anthropic,
DeepSeek, Kimi, OpenRouter, or local Ollama).

## Article II — Licensing
Every dependency carries an OSI-approved license, verified at a commit.

## Article III — Protocol correctness
${protoList.length ? protoList.map((p) => `- ${p}: follow its spec/NIPs; surface auth failures; use audited crypto.`).join('\n') : '- Follow each protocol\'s spec; surface auth failures; use audited crypto.'}

## Article IV — Operational discipline (the long-tail rules)
- Rate limiting on every public endpoint, from day one.
- Authentication paths are tested.
- No silent failures on the trust path (signing, auth, key handling).
- Minimize user data; store keys client-side; never route user content through a
  third-party model.

## Article V — Verifiability
Ship a stable, auditable artifact: pinned, license-verified dependencies, a real
license, and a green enforcement run.
`);

  const spec = $derived(`# Spec: ${projectName || slug}

## Problem
${problem || '<describe the community problem in one paragraph a non-developer would recognize>'}

## Protocols
${protoList.length ? protoList.join(', ') : 'general'}

## Scope
- In scope: <the smallest intervention that moves the problem>
- Out of scope: <what you are deliberately not building yet>

## Stack (from wecanjustbuildthings.dev — policy-clean)
${chosenItems.map((it) => `- ${it.name} (${it.ecosystem}, ${it.license}) — ${it.desc}`).join('\n') || '- <select tools in the Build Studio>'}

## Constitution checks (must hold)
- [ ] No dependency owned by Meta / OpenAI / xAI (Article I)
- [ ] All deps OSI-licensed, verifiable at a commit (Article II)
- [ ] Protocol correctness obligations identified (Article III)
- [ ] Rate limiting, tested auth, no silent failures, data minimization (Article IV)

## Open questions (stop-and-ask)
- <list anything ambiguous; do not guess>
`);

  const jsDeps = $derived(chosenItems.filter((it) => it.ecosystem === 'js'));
  const otherDeps = $derived(chosenItems.filter((it) => it.ecosystem !== 'js'));

  const packageJson = $derived(JSON.stringify({
    name: slug,
    version: '0.1.0',
    private: true,
    type: 'module',
    engines: { node: '>=22.12.0' },
    dependencies: Object.fromEntries(jsDeps.map((it) => [it.name, 'latest'])),
  }, null, 2) + '\n');

  const agentPrompt = $derived(`You are building "${projectName || slug}".

GOAL: ${problem || '<the community problem>'}
PROTOCOLS: ${protoList.length ? protoList.join(', ') : 'general'}

RULES (binding — see constitution.md):
- Read .specify/memory/constitution.md FIRST and never violate it.
- Use ONLY these vetted, policy-clean dependencies; do not add others without
  re-checking them against the exclusion policy:
${chosenItems.map((it) => `    - ${it.name} (${it.ecosystem})`).join('\n') || '    - <none selected yet>'}
- No dependency or provider owned by Meta, OpenAI, or xAI — directly or transitively.
- Run \`npx tsx ./enforcement/cli.ts all --tree .\` before every commit; do not
  bypass it. Add rate limiting, test auth paths, and never swallow trust-path errors.

Start by writing specs/001-${slug}/plan.md from specs/001-${slug}/spec.md, then tasks.md, then implement task by task, keeping each change green.`);

  const readme = $derived(`# ${projectName || slug}

${problem || 'A freedom-tech project.'}

Scaffolded by **wecanjustbuildthings.dev** — every dependency below is screened
against the Meta/OpenAI/xAI exclusion policy.

## Stack
${chosenItems.map((it) => `- [${it.name}](${it.repo || it.url}) — ${it.desc}`).join('\n') || '- (none selected)'}

## Build it with an agent
1. Configure your agent (Goose or Claude Code) with a permitted, BYOK provider.
2. Paste the prompt from \`AGENT_PROMPT.txt\` (or open \`.specify/\`).
3. Keep every change green: \`npx tsx ./enforcement/cli.ts all --tree .\`

## Non-JS dependencies to add
${otherDeps.map((it) => `- ${it.name} (${it.ecosystem}) — add via its native package manager`).join('\n') || '- (none)'}
`);

  let copied = $state('');
  async function copy(label: string, text: string) {
    try { await navigator.clipboard.writeText(text); copied = label; setTimeout(() => (copied = ''), 1500); } catch { copied = ''; }
  }

  function download() {
    const files: Record<string, Uint8Array> = {
      'README.md': strToU8(readme),
      'package.json': strToU8(packageJson),
      'AGENT_PROMPT.txt': strToU8(agentPrompt),
      '.specify/memory/constitution.md': strToU8(constitution),
      [`specs/001-${slug}/spec.md`]: strToU8(spec),
      '.claude/CLAUDE.md': strToU8(`# Project context\n\nRead @.specify/memory/constitution.md first. ${'\n'}Run the enforcement engine before committing.\n`),
    };
    const zipped = zipSync(files, { level: 6 });
    const blob = new Blob([zipped], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}-starter.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
</script>

<div class="studio">
  <ol class="steps" aria-label="Progress">
    <li class:on={step === 1}><button onclick={() => (step = 1)}>1 · Describe</button></li>
    <li class:on={step === 2}><button onclick={() => (step = 2)} disabled={loading}>2 · Choose stack</button></li>
    <li class:on={step === 3}><button onclick={() => (step = 3)} disabled={loading}>3 · Generate</button></li>
  </ol>

  {#if step === 1}
    <section class="panel">
      <label class="field"><span>Project name</span>
        <input bind:value={projectName} placeholder="escudo-vecinal" /></label>
      <label class="field"><span>What problem does it solve? (one paragraph)</span>
        <textarea bind:value={problem} rows="3" placeholder="Organizers need to document evictions without exposing tenants…"></textarea></label>
      <div class="field"><span>Protocols</span>
        <div class="chips">
          {#each ALL_PROTOCOLS as p}
            <button class="chip" class:on={protocols.has(p)} onclick={() => toggleProto(p)} aria-pressed={protocols.has(p)}>{p}</button>
          {/each}
        </div>
      </div>
      <label class="field"><span>Focus</span>
        <select bind:value={focus}>
          {#each Object.entries(FOCI) as [k, v]}<option value={k}>{v.label}</option>{/each}
        </select></label>
      <div class="nav"><button class="primary" onclick={() => (step = 2)} disabled={loading}>{loading ? 'Loading catalog…' : 'Choose your stack →'}</button></div>
    </section>
  {:else if step === 2}
    <section class="panel">
      <p class="hint">Suggested from the catalog for <strong>{protoList.join(', ') || 'general'}</strong> · <strong>{FOCI[focus]?.label}</strong>. Toggle what you want — every option is already policy-clean.</p>
      <ul class="picklist">
        {#each suggested as it (it.name)}
          <li class="pick" class:on={chosen.has(it.name)}>
            <label>
              <input type="checkbox" checked={chosen.has(it.name)} onchange={() => toggleTool(it.name)} />
              <span class="pick-name">{it.name}</span>
              <span class="pick-meta">{it.ecosystem} · {it.license}</span>
              <span class="pick-desc">{it.desc}</span>
            </label>
          </li>
        {/each}
      </ul>
      <label class="field"><span>Add another tool</span>
        <input bind:value={addQuery} placeholder="search the full catalog…" /></label>
      {#if addResults.length}
        <ul class="picklist">
          {#each addResults as it (it.name)}
            <li class="pick" class:on={chosen.has(it.name)}>
              <label><input type="checkbox" checked={chosen.has(it.name)} onchange={() => toggleTool(it.name)} />
                <span class="pick-name">{it.name}</span><span class="pick-meta">{it.ecosystem} · {it.license}</span></label>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="hint"><strong>{chosen.size}</strong> tools selected.</p>
      <div class="nav"><button onclick={() => (step = 1)}>← Back</button><button class="primary" onclick={() => (step = 3)}>Generate →</button></div>
    </section>
  {:else}
    <section class="panel">
      <p class="hint">Here's your agent-ready handoff. Download the starter, or copy any piece.</p>
      <div class="downloads">
        <button class="primary big" onclick={download}>⬇ Download starter repo (.zip)</button>
        <button onclick={() => copy('prompt', agentPrompt)}>{copied === 'prompt' ? '✓ Copied' : 'Copy agent prompt'}</button>
      </div>
      {#snippet artifact(title: string, key: string, text: string, lang: string)}
        <details open>
          <summary>{title} <button class="link" onclick={(e) => { e.preventDefault(); copy(key, text); }}>{copied === key ? '✓ copied' : 'copy'}</button></summary>
          <pre><code class={lang}>{text}</code></pre>
        </details>
      {/snippet}
      {@render artifact('Agent prompt — paste into Goose / Claude Code', 'p2', agentPrompt, 'text')}
      {@render artifact('constitution.md', 'c', constitution, 'markdown')}
      {@render artifact('spec.md', 's', spec, 'markdown')}
      {@render artifact('package.json', 'pkg', packageJson, 'json')}
      <div class="nav"><button onclick={() => (step = 2)}>← Back to stack</button></div>
    </section>
  {/if}
</div>

<style>
  .studio { margin: 1rem 0 2rem; }
  .steps { display: flex; gap: 0.5rem; list-style: none; padding: 0; margin: 0 0 1.25rem; }
  .steps li { flex: 1; }
  .steps button { width: 100%; padding: 0.5rem; border: 1px solid var(--sl-color-gray-5); background: var(--sl-color-gray-6); color: var(--sl-color-text); border-radius: 0.5rem; cursor: pointer; font-weight: 600; }
  .steps li.on button { background: var(--sl-color-accent); color: #fff; border-color: var(--sl-color-accent); }
  .panel { display: flex; flex-direction: column; gap: 1rem; }
  .field { display: flex; flex-direction: column; gap: 0.35rem; }
  .field > span { font-weight: 600; font-size: 0.9rem; }
  input, textarea, select { padding: 0.55rem 0.7rem; border: 1px solid var(--sl-color-gray-5); border-radius: 0.5rem; background: var(--sl-color-black); color: var(--sl-color-white); font: inherit; }
  .chips, .downloads { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .chip { padding: 0.35rem 0.8rem; border-radius: 999px; border: 1px solid var(--sl-color-gray-5); background: var(--sl-color-gray-6); color: var(--sl-color-text); cursor: pointer; }
  .chip.on { background: var(--sl-color-accent); color: #fff; border-color: var(--sl-color-accent); }
  .picklist { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
  .pick { border: 1px solid var(--sl-color-gray-6); border-radius: 0.5rem; padding: 0.5rem 0.7rem; }
  .pick.on { border-color: var(--sl-color-accent); }
  .pick label { display: grid; grid-template-columns: auto 1fr auto; gap: 0.2rem 0.6rem; align-items: baseline; cursor: pointer; }
  .pick-name { font-weight: 700; }
  .pick-meta { color: var(--sl-color-gray-2); font-size: 0.82rem; }
  .pick-desc { grid-column: 2 / -1; color: var(--sl-color-text); font-size: 0.85rem; }
  .nav { display: flex; justify-content: space-between; gap: 0.5rem; margin-top: 0.5rem; }
  .nav button, .downloads button { padding: 0.55rem 1rem; border-radius: 0.5rem; border: 1px solid var(--sl-color-gray-5); background: var(--sl-color-gray-6); color: var(--sl-color-text); cursor: pointer; font-weight: 600; }
  .primary { background: var(--sl-color-accent) !important; color: #fff !important; border-color: var(--sl-color-accent) !important; }
  .big { font-size: 1.05rem; padding: 0.7rem 1.3rem; }
  .hint { color: var(--sl-color-gray-2); font-size: 0.9rem; }
  .link { background: none; border: 0; color: var(--sl-color-text-accent); cursor: pointer; text-decoration: underline; font: inherit; }
  details { border: 1px solid var(--sl-color-gray-6); border-radius: 0.5rem; padding: 0.5rem 0.75rem; margin: 0.5rem 0; }
  summary { font-weight: 700; cursor: pointer; display: flex; justify-content: space-between; gap: 1rem; }
  pre { max-height: 22rem; overflow: auto; background: var(--sl-color-black); padding: 0.75rem; border-radius: 0.4rem; margin-top: 0.5rem; }
</style>
