<script lang="ts">
  import { onMount } from 'svelte';
  import { zipSync, strToU8 } from 'fflate';

  let { lang: initialLang = 'en' }: { lang?: string } = $props();

  interface Item {
    name: string; url: string; ecosystem: string; category: string;
    protocols: string[]; license: string; verification: string; uses: number; desc: string; repo: string | null;
  }

  // ---------- i18n ----------
  type Lang = 'en' | 'es' | 'ar';
  const STR: Record<Lang, Record<string, string>> = {
    en: {
      s1: '1 · Describe', s2: '2 · Choose stack', s3: '3 · Generate',
      name: 'Project name', problem: 'What problem does it solve? (one paragraph)',
      why: 'Why — the goal behind it? (the real objective, not a convenient proxy)',
      success: 'What does success actually look like?', protocols: 'Protocols', focus: 'Focus',
      tenq: 'These are the Ten Questions, distilled — answer the intent, not just the task.',
      choose: 'Choose your stack →', back: '← Back', gen: 'Generate →', backStack: '← Back to stack',
      suggested: 'Suggested from the catalog — toggle what you want; every option is policy-clean.',
      add: 'Add another tool', selected: 'tools selected', loading: 'Loading catalog…',
      handoff: 'How do you want to start?', zip: 'Download .zip', github: 'Create GitHub repo',
      goose: 'Run with Goose', kickoff: 'Kickoff with AI (BYOK)',
      dlzip: '⬇ Download starter repo (.zip)', copyPrompt: 'Copy agent prompt',
      runLocal: 'Get started with Goose →', ghGuide: 'How to connect GitHub →',
      apikey: 'Your API key (BYOK — sent only to the provider, never stored)',
      provider: 'Provider (permitted only)', run: 'Run kickoff', running: 'Running…',
      ghError: 'GitHub authorization didn’t complete. Try again, or download the .zip below.',
    },
    es: {
      s1: '1 · Describe', s2: '2 · Elige stack', s3: '3 · Genera',
      name: 'Nombre del proyecto', problem: '¿Qué problema resuelve? (un párrafo)',
      why: '¿Por qué — el objetivo real detrás? (no un sustituto conveniente)',
      success: '¿Cómo se ve el éxito realmente?', protocols: 'Protocolos', focus: 'Enfoque',
      tenq: 'Estas son las Diez Preguntas, destiladas — responde la intención, no solo la tarea.',
      choose: 'Elige tu stack →', back: '← Atrás', gen: 'Generar →', backStack: '← Volver al stack',
      suggested: 'Sugerido del catálogo — activa lo que quieras; todo cumple la política.',
      add: 'Añadir otra herramienta', selected: 'herramientas elegidas', loading: 'Cargando catálogo…',
      handoff: '¿Cómo quieres empezar?', zip: 'Descargar .zip', github: 'Crear repo en GitHub',
      goose: 'Usar con Goose', kickoff: 'Arranque con IA (tu clave)',
      dlzip: '⬇ Descargar repo inicial (.zip)', copyPrompt: 'Copiar prompt del agente',
      runLocal: 'Empezar con Goose →', ghGuide: 'Cómo conectar GitHub →',
      apikey: 'Tu clave API (solo se envía al proveedor, nunca se guarda)',
      provider: 'Proveedor (solo permitidos)', run: 'Ejecutar arranque', running: 'Ejecutando…',
      ghError: 'La autorización de GitHub no se completó. Inténtalo de nuevo o descarga el .zip abajo.',
    },
    ar: {
      s1: '١ · صِف', s2: '٢ · اختر الأدوات', s3: '٣ · وَلِّد',
      name: 'اسم المشروع', problem: 'ما المشكلة التي يحلها؟ (فقرة واحدة)',
      why: 'لماذا — الهدف الحقيقي وراءه؟ (وليس بديلاً سهلاً)',
      success: 'كيف يبدو النجاح فعلاً؟', protocols: 'البروتوكولات', focus: 'التركيز',
      tenq: 'هذه هي الأسئلة العشرة، مُلخّصة — أجب عن النية، لا المهمة فقط.',
      choose: 'اختر أدواتك ←', back: '→ رجوع', gen: 'وَلِّد ←', backStack: '→ العودة للأدوات',
      suggested: 'مقترح من الكتالوج — فعّل ما تريد؛ كل خيار متوافق مع السياسة.',
      add: 'أضف أداة أخرى', selected: 'أدوات مختارة', loading: 'جارٍ تحميل الكتالوج…',
      handoff: 'كيف تريد أن تبدأ؟', zip: 'تنزيل .zip', github: 'إنشاء مستودع GitHub',
      goose: 'التشغيل مع Goose', kickoff: 'انطلاقة بالذكاء الاصطناعي (مفتاحك)',
      dlzip: '⬇ تنزيل المستودع المبدئي (.zip)', copyPrompt: 'نسخ موجّه الوكيل',
      runLocal: 'ابدأ مع Goose ←', ghGuide: 'كيفية ربط GitHub ←',
      apikey: 'مفتاح API الخاص بك (يُرسل للمزوّد فقط، ولا يُخزَّن أبداً)',
      provider: 'المزوّد (المسموح فقط)', run: 'تشغيل الانطلاقة', running: 'جارٍ التشغيل…',
      ghError: 'لم تكتمل عملية ربط GitHub. حاول مرة أخرى، أو نزّل ملف .zip أدناه.',
    },
  };
  let lang = $state<Lang>((['en', 'es', 'ar'].includes(initialLang) ? initialLang : 'en') as Lang);
  const t = $derived(STR[lang]);
  const rtl = $derived(lang === 'ar');

  // ---------- state ----------
  let items = $state<Item[]>([]);
  let loading = $state(true);
  let step = $state(1);
  let projectName = $state('');
  let problem = $state('');
  let goal = $state('');
  let success = $state('');
  let protocols = $state<Set<string>>(new Set(['nostr']));
  let focus = $state('social');
  let chosen = $state<Set<string>>(new Set());
  let addQuery = $state('');
  let handoff = $state<'zip' | 'github' | 'goose' | 'kickoff'>('zip');

  const ALL_PROTOCOLS = ['nostr', 'atproto', 'lightning', 'cashu', 'general'];
  const FOCI: Record<string, { label: string; categories: string[] }> = {
    social: { label: 'Social / feed client', categories: ['Frameworks & Libraries', 'Dev Environment & Tooling'] },
    relay: { label: 'Relay / backend service', categories: ['Hosting Infra & Deploy', 'Databases & Storage', 'Monitoring & Observability'] },
    wallet: { label: 'Wallet / payments', categories: ['Bitcoin Lightning Nostr', 'Security & Privacy'] },
    safety: { label: 'Moderation / safety', categories: ['Security & Privacy', 'Auth Identity & Keys'] },
    general: { label: 'General app', categories: ['Frameworks & Libraries', 'Dev Environment & Tooling', 'Testing & QA'] },
  };
  // Recommended primary SDK per protocol (listed first, starred, pre-selected).
  const PROTO_PRIORITY: Record<string, string[]> = {
    nostr: ['@nostr-dev-kit/ndk', 'nostr-tools'],
    atproto: ['@atproto/api', '@atcute/client'],
  };

  onMount(async () => {
    // Follow the page's locale so /es/build/ and /ar/build/ open in that language
    // (the site-wide picker switches the surrounding chrome; this keeps the tool in sync).
    const dl = document.documentElement.lang?.slice(0, 2);
    if (dl && ['en', 'es', 'ar'].includes(dl)) lang = dl as Lang;
    try { const res = await fetch('/catalog.json'); items = (await res.json()).filter((i: Item & { kind?: string }) => (i as any).kind !== 'dataset'); } catch { /* offline */ }
    loading = false;
    const gh = new URLSearchParams(location.search).get('gh');
    if (gh === 'connected') { handoff = 'github'; ghConnected = true; step = 3; }
    else if (gh === 'error') { handoff = 'github'; step = 3; ghResult = `error:${t.ghError}`; }
    else if (gh === 'unconfigured') { handoff = 'github'; step = 3; ghConfigured = false; }
  });

  const slug = $derived((projectName || 'my-app').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'my-app');

  const suggested = $derived.by(() => {
    if (!items.length) return [] as Item[];
    const cats = new Set(FOCI[focus]?.categories ?? []);
    const wantProto = protocols.size > 0;
    return items
      .map((it) => {
        let score = it.uses;
        if (wantProto && it.protocols.some((p) => protocols.has(p))) score += 1000;
        if (cats.has(it.category)) score += 200;
        if (it.verification === 'verified') score += 50;
        for (const proto of protocols) {
          const list = PROTO_PRIORITY[proto];
          if (list) { const i = list.indexOf(it.name); if (i >= 0) score += 100000 - i * 1000; } // primary SDK first
        }
        return { it, score };
      })
      .filter((s) => s.score > 0 && (!wantProto || s.it.protocols.some((p) => protocols.has(p)) || cats.has(s.it.category)))
      .sort((a, b) => b.score - a.score)
      .slice(0, 14)
      .map((s) => s.it);
  });

  let seeded = false;
  $effect(() => { if (step === 2 && items.length && !seeded) { chosen = new Set(suggested.slice(0, 6).map((i) => i.name)); seeded = true; } });

  const addResults = $derived.by(() => {
    const q = addQuery.trim().toLowerCase();
    return q ? items.filter((it) => `${it.name} ${it.desc}`.toLowerCase().includes(q)).slice(0, 8) : ([] as Item[]);
  });
  const chosenItems = $derived(items.filter((it) => chosen.has(it.name)));
  const protoList = $derived([...protocols].filter((p) => p !== 'general'));
  const primaryNames = $derived(new Set([...protocols].map((p) => PROTO_PRIORITY[p]?.[0]).filter(Boolean)));

  function toggleProto(p: string) { const n = new Set(protocols); n.has(p) ? n.delete(p) : n.add(p); protocols = n; seeded = false; }
  function toggleTool(name: string) { const n = new Set(chosen); n.has(name) ? n.delete(name) : n.add(name); chosen = n; }

  // ---------- generated artifacts ----------
  const constitution = $derived(`# Project constitution — ${projectName || slug}

Binding on every spec, plan, and task. Agents read this first and do not override
it without explicit human consent.

## Article 0 — Intent (the goal behind the work)
This project exists to: ${goal || problem || '<state the real goal>'}.
Success means: ${success || '<define success at the level of purpose, not task completion>'}.
Optimize for this intent, never a convenient proxy. When a task conflicts with this
goal, the goal wins — surface the conflict instead of silently trading it away.

## Article I — Provider exclusion (non-negotiable)
No dependency, directly or transitively, may be owned by Meta, OpenAI, or xAI, and
no code may call their endpoints. Enforce before every commit:
    npx tsx ./enforcement/cli.ts all --tree .
Any AI assistance must use a permitted, bring-your-own-key provider (Anthropic,
DeepSeek, Kimi, OpenRouter, or local Ollama).

## Article II — Licensing
Every dependency carries an OSI-approved license, verified at a commit.

## Article III — Protocol correctness
${protoList.length ? protoList.map((p) => `- ${p}: follow its spec/NIPs; surface auth failures; use audited crypto.${p === 'nostr' ? ' Use @nostr-dev-kit/ndk (NDK) as the primary SDK.' : ''}${p === 'atproto' ? ' Use @atproto/api as the primary SDK; prefer OAuth (DPoP) over App Passwords.' : ''}`).join('\n') : "- Follow each protocol's spec; surface auth failures; use audited crypto."}

## Article IV — Operational discipline (the long-tail rules)
- Rate limiting on every public endpoint, from day one.
- Authentication paths are tested.
- No silent failures on the trust path (signing, auth, key handling).
- Minimize user data; store keys client-side; never route user content through a third-party model.

## Article V — Verifiability
Ship a stable, auditable artifact: pinned, license-verified dependencies, a real
license, and a green enforcement run.
`);

  const spec = $derived(`# Spec: ${projectName || slug}

## Problem
${problem || '<the community problem in one paragraph>'}

## Goal behind it (intent)
${goal || '<the real objective — not a convenient proxy>'}

## Success looks like
${success || '<the non-negotiable success criteria>'}

## Protocols
${protoList.length ? protoList.join(', ') : 'general'}

## Stack (policy-clean, from wecanjustbuildthings.dev)
${chosenItems.map((it) => `- ${it.name} (${it.ecosystem}, ${it.license}) — ${it.desc}`).join('\n') || '- <select tools>'}
`);

  const jsDeps = $derived(chosenItems.filter((it) => it.ecosystem === 'js'));
  const otherDeps = $derived(chosenItems.filter((it) => it.ecosystem !== 'js'));
  const packageJson = $derived(JSON.stringify({ name: slug, version: '0.1.0', private: true, type: 'module', engines: { node: '>=22.12.0' }, dependencies: Object.fromEntries(jsDeps.map((it) => [it.name, 'latest'])) }, null, 2) + '\n');

  const agentPrompt = $derived(`You are building "${projectName || slug}".

PROBLEM: ${problem || '<the community problem>'}
GOAL BEHIND IT (optimize for this, not a proxy): ${goal || problem || '<the real objective>'}
SUCCESS LOOKS LIKE: ${success || '<the non-negotiable success criteria>'}
PROTOCOLS: ${protoList.length ? protoList.join(', ') : 'general'}

RULES (binding — see constitution.md):
- Read .specify/memory/constitution.md FIRST and never violate it.
- Use ONLY these vetted, policy-clean dependencies:
${chosenItems.map((it) => `    - ${it.name} (${it.ecosystem})`).join('\n') || '    - <none selected>'}
${protocols.has('nostr') ? '- For Nostr, use @nostr-dev-kit/ndk (NDK) as the primary SDK for relays, subscriptions, and signers.\n' : ''}${protocols.has('atproto') ? '- For AT Protocol, use @atproto/api as the primary SDK; prefer OAuth (DPoP) over App Passwords.\n' : ''}- No dependency or provider owned by Meta, OpenAI, or xAI — directly or transitively.
- Run \`npx tsx ./enforcement/cli.ts all --tree .\` before every commit. Add rate
  limiting, test auth paths, and never swallow trust-path errors.

Start by writing specs/001-${slug}/plan.md from the spec, then tasks.md, then implement task by task, keeping each change green.`);

  const gooseRecipe = $derived(`version: "1.0.0"
title: "${(projectName || slug).replace(/"/g, "'")}"
description: "Build ${slug} — policy-clean (no Meta/OpenAI/xAI), via wecanjustbuildthings.dev"
instructions: |
  Read the constitution below and never violate it. Use only the listed,
  policy-clean dependencies. Run \`npx tsx ./enforcement/cli.ts all --tree .\`
  before every commit. Use a permitted BYOK provider only.
prompt: |
${agentPrompt.split('\n').map((l) => '  ' + l).join('\n')}
`);

  const readme = $derived(`# ${projectName || slug}

${problem || 'A freedom-tech project.'}

Scaffolded by wecanjustbuildthings.dev — every dependency is screened against the
Meta/OpenAI/xAI exclusion policy.

## Stack
${chosenItems.map((it) => `- [${it.name}](${it.repo || it.url}) — ${it.desc}`).join('\n') || '- (none)'}

## Build it with an agent
1. Configure your agent (Goose or Claude Code) with a permitted, BYOK provider.
2. Paste AGENT_PROMPT.txt (or open .specify/).
3. Keep every change green: \`npx tsx ./enforcement/cli.ts all --tree .\`

## Non-JS dependencies
${otherDeps.map((it) => `- ${it.name} (${it.ecosystem})`).join('\n') || '- (none)'}
`);

  function starterFiles(): Record<string, string> {
    return {
      'README.md': readme,
      'package.json': packageJson,
      'AGENT_PROMPT.txt': agentPrompt,
      '.specify/memory/constitution.md': constitution,
      [`specs/001-${slug}/spec.md`]: spec,
      [`${slug}.goose-recipe.yaml`]: gooseRecipe,
      '.claude/CLAUDE.md': `# Project context\n\nRead @.specify/memory/constitution.md first; run the enforcement engine before committing.\n`,
    };
  }

  let copied = $state('');
  async function copy(label: string, text: string) {
    try { await navigator.clipboard.writeText(text); copied = label; setTimeout(() => (copied = ''), 1500); } catch { copied = ''; }
  }
  function blobDownload(name: string, text: string, type = 'text/plain') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  function downloadZip() {
    const files: Record<string, Uint8Array> = {};
    for (const [p, c] of Object.entries(starterFiles())) files[p] = strToU8(c);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' }));
    a.download = `${slug}-starter.zip`; a.click(); URL.revokeObjectURL(a.href);
  }

  // ---------- GitHub one-click ----------
  let ghConfigured = $state<boolean | null>(null);
  let ghConnected = $state(false);
  let ghBusy = $state(false);
  let ghResult = $state('');
  $effect(() => {
    if (handoff === 'github' && ghConfigured === null) {
      fetch('/api/github/status').then((r) => r.json()).then((d) => (ghConfigured = !!d.configured)).catch(() => (ghConfigured = false));
    }
  });
  function ghConnect() {
    sessionStorage.setItem('wcb_files', JSON.stringify(starterFiles()));
    sessionStorage.setItem('wcb_slug', slug);
    location.href = `/api/github/start?redirect=${encodeURIComponent('/build/')}`;
  }
  async function ghCreate() {
    ghBusy = true; ghResult = '';
    const files = JSON.parse(sessionStorage.getItem('wcb_files') || JSON.stringify(starterFiles()));
    const repo = sessionStorage.getItem('wcb_slug') || slug;
    try {
      const res = await fetch('/api/github/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ repo, files }) });
      const d = await res.json();
      ghResult = d.url ? `created:${d.url}` : `error:${d.error || 'failed'}`;
    } catch (e) { ghResult = `error:${e}`; } finally { ghBusy = false; }
  }

  // ---------- BYOK kickoff ----------
  let kProvider = $state('anthropic');
  let kKey = $state('');
  let kBusy = $state(false);
  let kOutput = $state('');
  let kError = $state('');
  async function kickoffRun() {
    kBusy = true; kOutput = ''; kError = '';
    const prompt = `${constitution}\n\n---\n\n${spec}\n\n---\n\nProduce specs/001-${slug}/plan.md: a concrete, step-by-step implementation plan honoring the constitution above (especially Article 0 intent and Article I exclusions). Then list the first 5 implementation tasks. Output Markdown only.`;
    try {
      const res = await fetch('/api/agent/kickoff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: kProvider, apiKey: kKey, prompt }) });
      const d = await res.json();
      if (d.output) kOutput = d.output; else kError = d.error + (d.detail ? `: ${JSON.stringify(d.detail).slice(0, 200)}` : '');
    } catch (e) { kError = String(e); } finally { kBusy = false; }
  }
</script>

<div class="studio" dir={rtl ? 'rtl' : 'ltr'}>
  <div class="langbar">
    {#each ['en', 'es', 'ar'] as l}
      <button class="lang" class:on={lang === l} onclick={() => (lang = l as Lang)} aria-pressed={lang === l}>{l === 'en' ? 'English' : l === 'es' ? 'Español' : 'العربية'}</button>
    {/each}
  </div>

  <ol class="steps" aria-label="Progress">
    <li class:on={step === 1}><button onclick={() => (step = 1)}>{t.s1}</button></li>
    <li class:on={step === 2}><button onclick={() => (step = 2)} disabled={loading}>{t.s2}</button></li>
    <li class:on={step === 3}><button onclick={() => (step = 3)} disabled={loading}>{t.s3}</button></li>
  </ol>

  {#if step === 1}
    <section class="panel">
      <p class="hint">{t.tenq} <a href="/method/ten-questions/">↗</a></p>
      <label class="field"><span>{t.name}</span><input bind:value={projectName} placeholder="escudo-vecinal" /></label>
      <label class="field"><span>{t.problem}</span><textarea bind:value={problem} rows="3"></textarea></label>
      <label class="field"><span>{t.why}</span><textarea bind:value={goal} rows="2"></textarea></label>
      <label class="field"><span>{t.success}</span><textarea bind:value={success} rows="2"></textarea></label>
      <div class="field"><span>{t.protocols}</span>
        <div class="chips">{#each ALL_PROTOCOLS as p}<button class="chip" class:on={protocols.has(p)} onclick={() => toggleProto(p)} aria-pressed={protocols.has(p)}>{p}</button>{/each}</div>
        {#if protocols.has('nostr')}<p class="hint">★ Nostr selected — the Nostr Dev Kit (<a href="/catalog/nostr-dev-kit-ndk/">@nostr-dev-kit/ndk</a>) is suggested first as the primary SDK.</p>{/if}
        {#if protocols.has('atproto')}<p class="hint">★ AT Protocol selected — <a href="/catalog/atproto-api/">@atproto/api</a> is suggested first as the primary SDK. See also the <a href="/catalog/">BlackSky community services</a> for AT Protocol infrastructure.</p>{/if}
      </div>
      <label class="field"><span>{t.focus}</span><select bind:value={focus}>{#each Object.entries(FOCI) as [k, v]}<option value={k}>{v.label}</option>{/each}</select></label>
      <div class="nav"><button class="primary" onclick={() => (step = 2)} disabled={loading}>{loading ? t.loading : t.choose}</button></div>
    </section>
  {:else if step === 2}
    <section class="panel">
      <p class="hint">{t.suggested}</p>
      <ul class="picklist">
        {#each suggested as it (it.name)}
          <li class="pick" class:on={chosen.has(it.name)}>
            <label><input type="checkbox" checked={chosen.has(it.name)} onchange={() => toggleTool(it.name)} />
              <span class="pick-name">{it.name}{primaryNames.has(it.name) ? ' ★' : ''}</span>
              <span class="pick-meta">{it.ecosystem} · {it.license}</span><span class="pick-desc">{it.desc}</span></label>
          </li>
        {/each}
      </ul>
      <label class="field"><span>{t.add}</span><input bind:value={addQuery} placeholder="search…" /></label>
      {#if addResults.length}<ul class="picklist">{#each addResults as it (it.name)}<li class="pick" class:on={chosen.has(it.name)}><label><input type="checkbox" checked={chosen.has(it.name)} onchange={() => toggleTool(it.name)} /><span class="pick-name">{it.name}</span><span class="pick-meta">{it.ecosystem} · {it.license}</span></label></li>{/each}</ul>{/if}
      <p class="hint"><strong>{chosen.size}</strong> {t.selected}.</p>
      <div class="nav"><button onclick={() => (step = 1)}>{t.back}</button><button class="primary" onclick={() => (step = 3)}>{t.gen}</button></div>
    </section>
  {:else}
    <section class="panel">
      <h3>{t.handoff}</h3>
      <div class="tabs">
        <button class:on={handoff === 'zip'} onclick={() => (handoff = 'zip')}>{t.zip}</button>
        <button class:on={handoff === 'github'} onclick={() => (handoff = 'github')}>{t.github}</button>
        <button class:on={handoff === 'goose'} onclick={() => (handoff = 'goose')}>{t.goose}</button>
        <button class:on={handoff === 'kickoff'} onclick={() => (handoff = 'kickoff')}>{t.kickoff}</button>
      </div>

      {#if handoff === 'zip'}
        <div class="hpanel"><button class="primary big" onclick={downloadZip}>{t.dlzip}</button>
          <p class="hint">A complete starter (constitution, spec, package.json, agent prompt, Goose recipe). Open it with your agent.</p></div>
      {:else if handoff === 'github'}
        <div class="hpanel">
          {#if ghConfigured === null}<p class="hint">Checking…</p>
          {:else if !ghConfigured}
            <p class="hint">GitHub one-click isn't configured on this deployment yet. <a href="/guides/connect-github/">{t.ghGuide}</a></p>
            <button onclick={downloadZip}>{t.dlzip}</button>
          {:else if ghResult.startsWith('created:')}
            <p>✓ Repo created: <a href={ghResult.slice(8)}>{ghResult.slice(8)}</a></p>
          {:else if ghConnected}
            <button class="primary big" onclick={ghCreate} disabled={ghBusy}>{ghBusy ? '…' : `Create “${slug}” on GitHub`}</button>
            {#if ghResult.startsWith('error:')}<p class="err">{ghResult.slice(6)}</p>{/if}
          {:else}
            <button class="primary big" onclick={ghConnect}>Connect GitHub & create repo</button>
            <p class="hint"><a href="/guides/connect-github/">{t.ghGuide}</a></p>
          {/if}
        </div>
      {:else if handoff === 'goose'}
        <div class="hpanel">
          <button class="primary big" onclick={() => blobDownload(`${slug}.goose-recipe.yaml`, gooseRecipe, 'text/yaml')}>⬇ Download Goose recipe</button>
          <button onclick={() => copy('cmd', `goose run --recipe ${slug}.goose-recipe.yaml`)}>{copied === 'cmd' ? '✓' : 'Copy run command'}</button>
          <pre><code>goose run --recipe {slug}.goose-recipe.yaml</code></pre>
          <p class="hint">New to Goose? <a href="/guides/get-started-with-goose/">{t.runLocal}</a></p>
        </div>
      {:else}
        <div class="hpanel">
          <p class="hint">Runs one kickoff step on the edge using <strong>your own key</strong> — permitted providers only (no Meta/OpenAI/xAI). Your key is sent to the provider, never stored.</p>
          <label class="field"><span>{t.provider}</span><select bind:value={kProvider}><option value="anthropic">Anthropic</option><option value="openrouter">OpenRouter</option><option value="deepseek">DeepSeek</option></select></label>
          <label class="field"><span>{t.apikey}</span><input type="password" bind:value={kKey} placeholder="sk-…" /></label>
          <button class="primary" onclick={kickoffRun} disabled={kBusy || !kKey}>{kBusy ? t.running : t.run}</button>
          {#if kError}<p class="err">{kError}</p>{/if}
          {#if kOutput}<pre class="out"><code>{kOutput}</code></pre><button onclick={() => copy('ko', kOutput)}>{copied === 'ko' ? '✓ copied' : 'Copy plan'}</button>{/if}
        </div>
      {/if}

      <button class="link copyp" onclick={() => copy('prompt', agentPrompt)}>{copied === 'prompt' ? '✓ copied' : t.copyPrompt}</button>

      {#snippet artifact(title: string, key: string, text: string)}
        <details><summary>{title} <button class="link" onclick={(e) => { e.preventDefault(); copy(key, text); }}>{copied === key ? '✓' : 'copy'}</button></summary><pre><code>{text}</code></pre></details>
      {/snippet}
      {@render artifact('constitution.md', 'c', constitution)}
      {@render artifact('spec.md', 's', spec)}
      {@render artifact('package.json', 'pkg', packageJson)}

      <div class="nav"><button onclick={() => (step = 2)}>{t.backStack}</button></div>
    </section>
  {/if}
</div>

<style>
  .studio { margin: 1rem 0 2rem; }
  .langbar { display: flex; gap: 0.4rem; justify-content: flex-end; margin-bottom: 0.5rem; }
  .lang { font-size: 0.8rem; padding: 0.25rem 0.6rem; border-radius: 999px; border: 1px solid var(--sl-color-gray-5); background: var(--sl-color-gray-6); color: var(--sl-color-text); cursor: pointer; }
  .lang.on { background: var(--sl-color-accent); color: #fff; border-color: var(--sl-color-accent); }
  .steps { display: flex; gap: 0.5rem; list-style: none; padding: 0; margin: 0 0 1.25rem; }
  .steps li { flex: 1; }
  .steps button { width: 100%; padding: 0.5rem; border: 1px solid var(--sl-color-gray-5); background: var(--sl-color-gray-6); color: var(--sl-color-text); border-radius: 0.5rem; cursor: pointer; font-weight: 600; }
  .steps li.on button { background: var(--sl-color-accent); color: #fff; border-color: var(--sl-color-accent); }
  .panel { display: flex; flex-direction: column; gap: 1rem; }
  .field { display: flex; flex-direction: column; gap: 0.35rem; }
  .field > span { font-weight: 600; font-size: 0.9rem; }
  input, textarea, select { padding: 0.55rem 0.7rem; border: 1px solid var(--sl-color-gray-5); border-radius: 0.5rem; background: var(--sl-color-black); color: var(--sl-color-white); font: inherit; }
  .chips, .tabs { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .chip { padding: 0.35rem 0.8rem; border-radius: 999px; border: 1px solid var(--sl-color-gray-5); background: var(--sl-color-gray-6); color: var(--sl-color-text); cursor: pointer; }
  .chip.on { background: var(--sl-color-accent); color: #fff; border-color: var(--sl-color-accent); }
  .tabs button { padding: 0.45rem 0.8rem; border-radius: 0.5rem 0.5rem 0 0; border: 1px solid var(--sl-color-gray-6); background: transparent; color: var(--sl-color-text); cursor: pointer; font-weight: 600; }
  .tabs button.on { background: var(--sl-color-gray-6); border-color: var(--sl-color-gray-5); }
  .hpanel { border: 1px solid var(--sl-color-gray-5); border-radius: 0 0.5rem 0.5rem 0.5rem; padding: 1rem; display: flex; flex-direction: column; gap: 0.7rem; }
  .picklist { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
  .pick { border: 1px solid var(--sl-color-gray-6); border-radius: 0.5rem; padding: 0.5rem 0.7rem; }
  .pick.on { border-color: var(--sl-color-accent); }
  .pick label { display: grid; grid-template-columns: auto 1fr auto; gap: 0.2rem 0.6rem; align-items: baseline; cursor: pointer; }
  .pick-name { font-weight: 700; }
  .pick-meta { color: var(--sl-color-gray-2); font-size: 0.82rem; }
  .pick-desc { grid-column: 2 / -1; color: var(--sl-color-text); font-size: 0.85rem; }
  .nav { display: flex; justify-content: space-between; gap: 0.5rem; margin-top: 0.5rem; }
  .nav button { padding: 0.55rem 1rem; border-radius: 0.5rem; border: 1px solid var(--sl-color-gray-5); background: var(--sl-color-gray-6); color: var(--sl-color-text); cursor: pointer; font-weight: 600; }
  .primary { background: var(--sl-color-accent); color: #fff; border: 1px solid var(--sl-color-accent); padding: 0.55rem 1.1rem; border-radius: 0.5rem; cursor: pointer; font-weight: 700; }
  .big { font-size: 1.05rem; padding: 0.7rem 1.3rem; }
  .hint { color: var(--sl-color-gray-2); font-size: 0.9rem; }
  .err { color: #ff7b72; font-size: 0.9rem; }
  .link { background: none; border: 0; color: var(--sl-color-text-accent); cursor: pointer; text-decoration: underline; font: inherit; }
  .copyp { align-self: flex-start; }
  details { border: 1px solid var(--sl-color-gray-6); border-radius: 0.5rem; padding: 0.5rem 0.75rem; }
  summary { font-weight: 700; cursor: pointer; display: flex; justify-content: space-between; gap: 1rem; }
  pre { max-height: 22rem; overflow: auto; background: var(--sl-color-black); padding: 0.75rem; border-radius: 0.4rem; }
  .out { max-height: 28rem; }
</style>
