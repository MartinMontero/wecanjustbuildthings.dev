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
      s1: '1 · Describe', s2: '2 · Pick tools', s3: '3 · Your starter',
      name: 'Project name (a short nickname is fine)',
      problem: 'What problem does it solve, and for whom? Say it like you would out loud — one short paragraph.',
      why: 'Why does this matter? The real change you want — not just “ship an app.”',
      success: 'How will you know it’s working? What’s different for your community when it does.',
      protocols: 'Which network does it live on?', focus: 'What kind of thing are you building?',
      tenq: 'Start with the why. Answer these the way you’d explain the project to a friend — the clearer you are, the better your AI agent builds.',
      protoHelp: 'A “network” (protocol) is the shared, open rulebook your tool plugs into — owned by no single company. Nostr and AT Protocol (Bluesky) are open social networks; pick “general” if it isn’t a social tool.',
      choose: 'Pick your tools →', back: '← Back', gen: 'Get my starter →', backStack: '← Back to tools',
      suggested: '',
      add: 'Need something specific? Search the full catalog', selected: 'building blocks chosen', loading: 'Loading the catalog…',
      handoff: 'How do you want to get started?', zip: 'Download a starter folder', github: 'Save it to GitHub',
      goose: 'Run it with Goose', kickoff: 'Try a step with AI',
      dlzip: '⬇ Download your starter folder (.zip)', copyPrompt: 'Copy the instructions for your AI agent',
      runLocal: 'New to Goose? Start here →', ghGuide: 'How to connect GitHub →',
      apikey: 'Your AI key (sent straight to the model, never stored by us)',
      provider: 'Who makes the model', run: 'Run it', running: 'Working…',
      ghError: 'Connecting to GitHub didn’t finish. Try again, or download the folder below.',
      stackIntro: 'Your “stack” is just the set of ready-made building blocks — tools other people have already built and tested — that your project is made from. Choosing good ones means you and your AI agent don’t start from scratch: you assemble proven parts instead of reinventing them, which saves months and avoids dead ends. Below is a starting set picked for what you described. Not sure? Keep the ones marked ★ and the defaults — you can’t pick “wrong” here, because everything listed is already safe and checked. Add or remove anything; nothing is final.',
      legendPrimary: '★ the recommended starting point for your network',
      legendClean: 'every option is safe to use (no Meta/OpenAI/xAI) and license-checked',
      showMore: 'Show more tools', showFewer: 'Show fewer', showing: 'Showing', of: 'of',
      modelTitle: 'Choose your AI model',
      modelIntro: 'This runs one planning step with your own AI key, so you can feel it work before you commit. Your key and your project go straight to the model — never stored by us, and never routed through Meta, OpenAI, or xAI. The options below are chosen for that: models trained accountably, open models you can run yourself, or a neutral router locked to allowed models.',
      modelLabel: 'Model',
      handoffIntro: 'Your starter is ready — everything your AI agent needs to begin, with the rules and safe tools already baked in. Pick how you’d like to take it:',
      zipDesc: 'A ready-to-open folder with everything inside: the project’s rules, the plan, the build instructions, and the list of safe tools. Hand it to Goose or Claude Code and start building.',
      gooseDl: '⬇ Download the Goose recipe', gooseCopy: 'Copy the run command',
      gooseDesc: 'A recipe is a one-file set of instructions Goose follows to build your project. Download it, then run the command below.',
      ghNotReady: 'Saving straight to GitHub isn’t switched on for this site yet — download the folder instead, or read',
      ghConnectBtn: 'Connect GitHub & save my project', ghSuccess: '✓ Your project is on GitHub:', copyPlan: 'Copy the plan',
    },
    es: {
      s1: '1 · Describe', s2: '2 · Elige', s3: '3 · Tu kit',
      name: 'Nombre del proyecto (un apodo corto vale)',
      problem: '¿Qué problema resuelve y para quién? Dilo como lo dirías en voz alta — un párrafo corto.',
      why: '¿Por qué importa? El cambio real que buscas — no solo “lanzar una app.”',
      success: '¿Cómo sabrás que funciona? Qué cambia para tu comunidad cuando lo logra.',
      protocols: '¿En qué red vive?', focus: '¿Qué tipo de cosa estás construyendo?',
      tenq: 'Empieza por el porqué. Responde como si le explicaras el proyecto a un amigo — cuanto más claro seas, mejor construye tu agente de IA.',
      protoHelp: 'Una “red” (protocolo) es el reglamento abierto y compartido al que se conecta tu herramienta — sin dueño único. Nostr y AT Protocol (Bluesky) son redes sociales abiertas; elige “general” si no es una herramienta social.',
      choose: 'Elige tus herramientas →', back: '← Atrás', gen: 'Obtener mi kit →', backStack: '← Volver',
      suggested: '',
      add: '¿Necesitas algo específico? Busca en todo el catálogo', selected: 'bloques elegidos', loading: 'Cargando el catálogo…',
      handoff: '¿Cómo quieres empezar?', zip: 'Descargar una carpeta inicial', github: 'Guardarlo en GitHub',
      goose: 'Ejecutarlo con Goose', kickoff: 'Probar un paso con IA',
      dlzip: '⬇ Descargar tu carpeta inicial (.zip)', copyPrompt: 'Copiar las instrucciones para tu agente de IA',
      runLocal: '¿Nuevo en Goose? Empieza aquí →', ghGuide: 'Cómo conectar GitHub →',
      apikey: 'Tu clave de IA (se envía directo al modelo, nunca la guardamos)',
      provider: 'Quién hace el modelo', run: 'Ejecutar', running: 'Trabajando…',
      ghError: 'La conexión con GitHub no terminó. Inténtalo de nuevo o descarga la carpeta abajo.',
      stackIntro: 'Tu “stack” es simplemente el conjunto de bloques ya hechos — herramientas que otras personas ya construyeron y probaron — con los que se arma tu proyecto. Elegir buenos bloques significa que tú y tu agente de IA no empiezan de cero: ensamblas piezas probadas en vez de reinventarlas, lo que ahorra meses y evita callejones sin salida. Abajo hay un conjunto inicial elegido para lo que describiste. ¿No estás seguro? Deja los marcados con ★ y los predeterminados — aquí no puedes elegir “mal”, porque todo lo listado ya es seguro y está verificado. Agrega o quita lo que quieras; nada es definitivo.',
      legendPrimary: '★ el punto de partida recomendado para tu red',
      legendClean: 'cada opción es segura de usar (sin Meta/OpenAI/xAI) y con licencia verificada',
      showMore: 'Mostrar más herramientas', showFewer: 'Mostrar menos', showing: 'Mostrando', of: 'de',
      modelTitle: 'Elige tu modelo de IA',
      modelIntro: 'Esto ejecuta un paso de planificación con tu propia clave de IA, para que lo sientas funcionar antes de comprometerte. Tu clave y tu proyecto van directo al modelo — nunca los guardamos, y nunca pasan por Meta, OpenAI o xAI. Las opciones de abajo se eligen por eso: modelos entrenados de forma responsable, modelos abiertos que puedes ejecutar tú mismo, o un enrutador neutral limitado a modelos permitidos.',
      modelLabel: 'Modelo',
      handoffIntro: 'Tu kit está listo — todo lo que tu agente de IA necesita para empezar, con las reglas y las herramientas seguras ya incluidas. Elige cómo quieres llevarlo:',
      zipDesc: 'Una carpeta lista para abrir con todo dentro: las reglas del proyecto, el plan, las instrucciones de construcción y la lista de herramientas seguras. Entrégala a Goose o Claude Code y empieza a construir.',
      gooseDl: '⬇ Descargar la receta de Goose', gooseCopy: 'Copiar el comando',
      gooseDesc: 'Una receta es un archivo con instrucciones que Goose sigue para construir tu proyecto. Descárgala y ejecuta el comando de abajo.',
      ghNotReady: 'Guardar directo en GitHub aún no está activado en este sitio — descarga la carpeta, o lee',
      ghConnectBtn: 'Conectar GitHub y guardar mi proyecto', ghSuccess: '✓ Tu proyecto está en GitHub:', copyPlan: 'Copiar el plan',
    },
    ar: {
      s1: '١ · صِف', s2: '٢ · اختر', s3: '٣ · حزمتك',
      name: 'اسم المشروع (يكفي اسم مختصر)',
      problem: 'ما المشكلة التي يحلها، ولمن؟ قُلها كما تقولها بصوتك — فقرة قصيرة.',
      why: 'لماذا يهمّ هذا؟ التغيير الحقيقي الذي تريده — وليس مجرد «إطلاق تطبيق».',
      success: 'كيف ستعرف أنه ينجح؟ ما الذي يتغيّر لمجتمعك عندما ينجح.',
      protocols: 'على أي شبكة يعمل؟', focus: 'ما نوع الشيء الذي تبنيه؟',
      tenq: 'ابدأ بالـ«لماذا». أجب كأنك تشرح المشروع لصديق — كلما كنت أوضح، بنى وكيل الذكاء الاصطناعي بشكل أفضل.',
      protoHelp: 'الـ«شبكة» (البروتوكول) هي القواعد المفتوحة المشتركة التي تتصل بها أداتك — لا يملكها طرف واحد. Nostr وAT Protocol (Bluesky) شبكات اجتماعية مفتوحة؛ اختر «general» إن لم تكن أداة اجتماعية.',
      choose: 'اختر أدواتك ←', back: '→ رجوع', gen: 'احصل على حزمتي ←', backStack: '→ رجوع',
      suggested: '',
      add: 'تحتاج شيئاً محدداً؟ ابحث في الكتالوج كاملاً', selected: 'لبنات مختارة', loading: 'جارٍ تحميل الكتالوج…',
      handoff: 'كيف تريد أن تبدأ؟', zip: 'تنزيل مجلد بداية', github: 'احفظه في GitHub',
      goose: 'شغّله مع Goose', kickoff: 'جرّب خطوة بالذكاء الاصطناعي',
      dlzip: '⬇ نزّل مجلد البداية (.zip)', copyPrompt: 'انسخ تعليمات وكيل الذكاء الاصطناعي',
      runLocal: 'جديد على Goose؟ ابدأ هنا ←', ghGuide: 'كيفية ربط GitHub ←',
      apikey: 'مفتاح الذكاء الاصطناعي الخاص بك (يُرسل مباشرة إلى النموذج، ولا نخزّنه أبداً)',
      provider: 'من يصنع النموذج', run: 'شغّل', running: 'جارٍ العمل…',
      ghError: 'لم يكتمل الاتصال بـ GitHub. حاول مرة أخرى، أو نزّل المجلد أدناه.',
      stackIntro: '«الحزمة» (stack) هي ببساطة مجموعة اللبنات الجاهزة — أدوات بناها واختبرها آخرون — التي يتكوّن منها مشروعك. اختيار لبنات جيدة يعني أنك ووكيل الذكاء الاصطناعي لا تبدآن من الصفر: تجمّع قطعاً مُجرَّبة بدل إعادة اختراعها، ما يوفّر شهوراً ويتجنّب الطرق المسدودة. في الأسفل مجموعة بداية مُختارة لما وصفته. غير متأكد؟ اترك المعلّمة بـ ★ والافتراضية — لا يمكنك الاختيار «الخطأ» هنا، فكل المُدرَج آمن ومُتحقَّق منه. أضِف أو احذف ما تشاء؛ لا شيء نهائي.',
      legendPrimary: '★ نقطة البداية الموصى بها لشبكتك',
      legendClean: 'كل خيار آمن للاستخدام (بلا Meta/OpenAI/xAI) ومُتحقَّق من ترخيصه',
      showMore: 'عرض أدوات أكثر', showFewer: 'عرض أقل', showing: 'عرض', of: 'من',
      modelTitle: 'اختر نموذج الذكاء الاصطناعي',
      modelIntro: 'هذا يشغّل خطوة تخطيط واحدة باستخدام مفتاحك الخاص، لتشعر به يعمل قبل أن تلتزم. مفتاحك ومشروعك يذهبان مباشرة إلى النموذج — لا نخزّنهما أبداً، ولا يمران عبر Meta أو OpenAI أو xAI. الخيارات أدناه مُختارة لذلك: نماذج مُدرَّبة بمسؤولية، نماذج مفتوحة يمكنك تشغيلها بنفسك، أو موجّه محايد مقصور على النماذج المسموح بها.',
      modelLabel: 'النموذج',
      handoffIntro: 'حزمتك جاهزة — كل ما يحتاجه وكيل الذكاء الاصطناعي للبدء، مع القواعد والأدوات الآمنة مُضمّنة سلفاً. اختر كيف تريد أخذها:',
      zipDesc: 'مجلد جاهز للفتح يحوي كل شيء: قواعد المشروع، والخطة، وتعليمات البناء، وقائمة الأدوات الآمنة. سلّمه لـ Goose أو Claude Code وابدأ البناء.',
      gooseDl: '⬇ تنزيل وصفة Goose', gooseCopy: 'انسخ أمر التشغيل',
      gooseDesc: 'الوصفة ملف واحد فيه تعليمات يتبعها Goose لبناء مشروعك. نزّلها ثم شغّل الأمر أدناه.',
      ghNotReady: 'الحفظ المباشر إلى GitHub غير مُفعّل في هذا الموقع بعد — نزّل المجلد بدلاً من ذلك، أو اقرأ',
      ghConnectBtn: 'اربط GitHub واحفظ مشروعي', ghSuccess: '✓ مشروعك على GitHub:', copyPlan: 'انسخ الخطة',
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
    social: { label: 'A social app or feed people post and read in', categories: ['Frameworks & Libraries', 'Dev Environment & Tooling'] },
    relay: { label: 'A server other apps or people connect to', categories: ['Hosting Infra & Deploy', 'Databases & Storage', 'Monitoring & Observability'] },
    wallet: { label: 'A wallet or payments tool', categories: ['Bitcoin Lightning Nostr', 'Security & Privacy'] },
    safety: { label: 'A moderation or safety tool', categories: ['Security & Privacy', 'Auth Identity & Keys'] },
    general: { label: 'Something else / a general app', categories: ['Frameworks & Libraries', 'Dev Environment & Tooling', 'Testing & QA'] },
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
      .slice(0, 60)
      .map((s) => s.it);
  });

  // How many suggestions to show before "Show more" (the rest stay one click away).
  let stackLimit = $state(12);
  const visibleSuggested = $derived(suggested.slice(0, stackLimit));

  let seeded = false;
  $effect(() => { if (step === 2 && items.length && !seeded) { chosen = new Set(suggested.slice(0, 6).map((i) => i.name)); seeded = true; } });

  const addResults = $derived.by(() => {
    const q = addQuery.trim().toLowerCase();
    return q ? items.filter((it) => `${it.name} ${it.desc}`.toLowerCase().includes(q)).slice(0, 8) : ([] as Item[]);
  });
  const chosenItems = $derived(items.filter((it) => chosen.has(it.name)));
  const protoList = $derived([...protocols].filter((p) => p !== 'general'));
  const primaryNames = $derived(new Set([...protocols].map((p) => PROTO_PRIORITY[p]?.[0]).filter(Boolean)));

  function toggleProto(p: string) { const n = new Set(protocols); n.has(p) ? n.delete(p) : n.add(p); protocols = n; seeded = false; stackLimit = 12; }
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

  // ---------- AI model picker (BYOK kickoff) ----------
  // Each option is framed in the project's ethos: accountable training, open
  // weights you can self-host, or a neutral router constrained to permitted
  // models. No Meta / OpenAI / xAI model is offered or reachable.
  interface ModelOpt { id: string; label: string; note: string }
  const MODELS: Record<string, ModelOpt[]> = {
    anthropic: [
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — most capable', note: 'Top capability for hard planning and refactors. Trained with Constitutional AI — a published, inspectable value set — which fits a tool built to be accountable by default. Your key, your data, no middle layer.' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — balanced (recommended)', note: 'The everyday default: fast and strong for building, at lower cost than Opus. Same values alignment.' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fastest', note: 'Cheapest and quickest — ideal for tight edit/run loops and small teams watching their budget.' },
    ],
    deepseek: [
      { id: 'deepseek-chat', label: 'DeepSeek V3 — open weights', note: 'Open-weight: you can download and self-host it, so you are never locked to one vendor. The strongest sovereignty story here — own your whole stack.' },
      { id: 'deepseek-reasoner', label: 'DeepSeek R1 — open-weight reasoner', note: 'Open-weight reasoning model for harder planning steps. Self-hostable, same independence from any platform.' },
    ],
    openrouter: [
      { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6 (via OpenRouter)', note: 'A neutral router so you avoid single-vendor lock-in. We constrain it to permitted models — Meta, OpenAI, and xAI are refused even if requested.' },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3 (via OpenRouter)', note: 'Open-weight model through the router — pay-as-you-go without a separate account per provider.' },
      { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B (via OpenRouter)', note: 'Open-weight alternative; routing stays within permitted, non-excluded providers.' },
    ],
  };

  // ---------- BYOK kickoff ----------
  let kProvider = $state('anthropic');
  let kModel = $state<string>(MODELS.anthropic[0]!.id);
  const kModels = $derived(MODELS[kProvider] ?? []);
  // Keep the selected model valid when the provider changes.
  $effect(() => { if (!kModels.some((m) => m.id === kModel)) kModel = kModels[0]?.id ?? ''; });
  const kModelNote = $derived(kModels.find((m) => m.id === kModel)?.note ?? '');
  let kKey = $state('');
  let kBusy = $state(false);
  let kOutput = $state('');
  let kError = $state('');
  async function kickoffRun() {
    kBusy = true; kOutput = ''; kError = '';
    const prompt = `${constitution}\n\n---\n\n${spec}\n\n---\n\nProduce specs/001-${slug}/plan.md: a concrete, step-by-step implementation plan honoring the constitution above (especially Article 0 intent and Article I exclusions). Then list the first 5 implementation tasks. Output Markdown only.`;
    try {
      const res = await fetch('/api/agent/kickoff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: kProvider, model: kModel, apiKey: kKey, prompt }) });
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
      <label class="field"><span>{t.name}</span><input bind:value={projectName} placeholder="e.g. neighborhood-shield" /></label>
      <label class="field"><span>{t.problem}</span><textarea bind:value={problem} rows="3" placeholder="e.g. Tenants need to document evictions without exposing who they are."></textarea></label>
      <label class="field"><span>{t.why}</span><textarea bind:value={goal} rows="2"></textarea></label>
      <label class="field"><span>{t.success}</span><textarea bind:value={success} rows="2"></textarea></label>
      <div class="field"><span>{t.protocols}</span>
        <div class="chips">{#each ALL_PROTOCOLS as p}<button class="chip" class:on={protocols.has(p)} onclick={() => toggleProto(p)} aria-pressed={protocols.has(p)}>{p}</button>{/each}</div>
        <p class="hint">{t.protoHelp}</p>
        {#if protocols.has('nostr')}<p class="hint">★ Nostr chosen — we’ll suggest the <a href="/catalog/nostr-dev-kit-ndk/">Nostr Dev Kit (NDK)</a> first. It’s the most complete starting point for building on Nostr, so your agent won’t have to wire up the basics by hand.</p>{/if}
        {#if protocols.has('atproto')}<p class="hint">★ AT Protocol (Bluesky) chosen — we’ll suggest <a href="/catalog/atproto-api/">@atproto/api</a> first as the main starting point. The <a href="/catalog/">BlackSky community services</a> are also there if you need the underlying infrastructure.</p>{/if}
      </div>
      <label class="field"><span>{t.focus}</span><select bind:value={focus}>{#each Object.entries(FOCI) as [k, v]}<option value={k}>{v.label}</option>{/each}</select></label>
      <div class="nav"><button class="primary" onclick={() => (step = 2)} disabled={loading}>{loading ? t.loading : t.choose}</button></div>
    </section>
  {:else if step === 2}
    <section class="panel">
      <div class="intro">
        <p>{t.stackIntro}</p>
        <ul class="legend">
          <li><span class="star">★</span> {t.legendPrimary}</li>
          <li><span class="dot"></span> {t.legendClean}</li>
        </ul>
      </div>
      <ul class="picklist">
        {#each visibleSuggested as it (it.name)}
          <li class="pick" class:on={chosen.has(it.name)} class:primary={primaryNames.has(it.name)}>
            <label><input type="checkbox" checked={chosen.has(it.name)} onchange={() => toggleTool(it.name)} />
              <span class="pick-name">{it.name}{primaryNames.has(it.name) ? ' ★' : ''}</span>
              <span class="pick-meta">{it.ecosystem} · {it.license} <span class="vbadge vbadge--{it.verification}">{it.verification.replace('_', ' ')}</span></span>
              <span class="pick-desc">{it.desc}</span></label>
          </li>
        {/each}
      </ul>
      <div class="stackbar">
        <span class="hint">{t.showing} <strong>{visibleSuggested.length}</strong> {t.of} {suggested.length}</span>
        {#if suggested.length > stackLimit}
          <button class="link" onclick={() => (stackLimit += 12)}>{t.showMore} ↓</button>
        {:else if stackLimit > 12}
          <button class="link" onclick={() => (stackLimit = 12)}>{t.showFewer} ↑</button>
        {/if}
      </div>
      <label class="field"><span>{t.add}</span><input bind:value={addQuery} placeholder="search the full catalog…" /></label>
      {#if addResults.length}<ul class="picklist">{#each addResults as it (it.name)}<li class="pick" class:on={chosen.has(it.name)}><label><input type="checkbox" checked={chosen.has(it.name)} onchange={() => toggleTool(it.name)} /><span class="pick-name">{it.name}</span><span class="pick-meta">{it.ecosystem} · {it.license} <span class="vbadge vbadge--{it.verification}">{it.verification.replace('_', ' ')}</span></span></label></li>{/each}</ul>{/if}
      <p class="hint"><strong>{chosen.size}</strong> {t.selected}.</p>
      <div class="nav"><button onclick={() => (step = 1)}>{t.back}</button><button class="primary" onclick={() => (step = 3)}>{t.gen}</button></div>
    </section>
  {:else}
    <section class="panel">
      <h3>{t.handoff}</h3>
      <p class="hint">{t.handoffIntro}</p>
      <div class="tabs">
        <button class:on={handoff === 'zip'} onclick={() => (handoff = 'zip')}>{t.zip}</button>
        <button class:on={handoff === 'github'} onclick={() => (handoff = 'github')}>{t.github}</button>
        <button class:on={handoff === 'goose'} onclick={() => (handoff = 'goose')}>{t.goose}</button>
        <button class:on={handoff === 'kickoff'} onclick={() => (handoff = 'kickoff')}>{t.kickoff}</button>
      </div>

      {#if handoff === 'zip'}
        <div class="hpanel"><button class="primary big" onclick={downloadZip}>{t.dlzip}</button>
          <p class="hint">{t.zipDesc}</p></div>
      {:else if handoff === 'github'}
        <div class="hpanel">
          {#if ghConfigured === null}<p class="hint">Checking…</p>
          {:else if !ghConfigured}
            <p class="hint">{t.ghNotReady} <a href="/guides/connect-github/">{t.ghGuide}</a></p>
            <button onclick={downloadZip}>{t.dlzip}</button>
          {:else if ghResult.startsWith('created:')}
            <p>{t.ghSuccess} <a href={ghResult.slice(8)}>{ghResult.slice(8)}</a></p>
          {:else if ghConnected}
            <button class="primary big" onclick={ghCreate} disabled={ghBusy}>{ghBusy ? '…' : `Save “${slug}” to GitHub`}</button>
            {#if ghResult.startsWith('error:')}<p class="err">{ghResult.slice(6)}</p>{/if}
          {:else}
            <button class="primary big" onclick={ghConnect}>{t.ghConnectBtn}</button>
            <p class="hint"><a href="/guides/connect-github/">{t.ghGuide}</a></p>
          {/if}
        </div>
      {:else if handoff === 'goose'}
        <div class="hpanel">
          <button class="primary big" onclick={() => blobDownload(`${slug}.goose-recipe.yaml`, gooseRecipe, 'text/yaml')}>{t.gooseDl}</button>
          <button onclick={() => copy('cmd', `goose run --recipe ${slug}.goose-recipe.yaml`)}>{copied === 'cmd' ? '✓' : t.gooseCopy}</button>
          <pre><code>goose run --recipe {slug}.goose-recipe.yaml</code></pre>
          <p class="hint">{t.gooseDesc} <a href="/guides/get-started-with-goose/">{t.runLocal}</a></p>
        </div>
      {:else}
        <div class="hpanel">
          <h4 class="mtitle">{t.modelTitle}</h4>
          <p class="hint">{t.modelIntro}</p>
          <div class="modelgrid">
            <label class="field"><span>{t.provider}</span><select bind:value={kProvider}><option value="anthropic">Anthropic</option><option value="deepseek">DeepSeek</option><option value="openrouter">OpenRouter</option></select></label>
            <label class="field"><span>{t.modelLabel}</span><select bind:value={kModel}>{#each kModels as m (m.id)}<option value={m.id}>{m.label}</option>{/each}</select></label>
          </div>
          {#if kModelNote}<p class="modelnote">{kModelNote}</p>{/if}
          <label class="field"><span>{t.apikey}</span><input type="password" bind:value={kKey} placeholder="sk-…" /></label>
          <button class="primary" onclick={kickoffRun} disabled={kBusy || !kKey}>{kBusy ? t.running : t.run}</button>
          {#if kError}<p class="err">{kError}</p>{/if}
          {#if kOutput}<pre class="out"><code>{kOutput}</code></pre><button onclick={() => copy('ko', kOutput)}>{copied === 'ko' ? '✓ copied' : t.copyPlan}</button>{/if}
        </div>
      {/if}

      <button class="link copyp" onclick={() => copy('prompt', agentPrompt)}>{copied === 'prompt' ? '✓ copied' : t.copyPrompt}</button>

      <p class="hint">Want to look inside first? These are the files in your starter — the plain-English rules and plan your agent will follow:</p>
      {#snippet artifact(title: string, key: string, text: string)}
        <details><summary>{title} <button class="link" onclick={(e) => { e.preventDefault(); copy(key, text); }}>{copied === key ? '✓' : 'copy'}</button></summary><pre><code>{text}</code></pre></details>
      {/snippet}
      {@render artifact('The project’s rules (constitution.md)', 'c', constitution)}
      {@render artifact('The plan (spec.md)', 's', spec)}
      {@render artifact('The tools list (package.json)', 'pkg', packageJson)}

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
  .pick.primary { border-color: var(--sl-color-accent); background: color-mix(in srgb, var(--sl-color-accent) 7%, transparent); }
  .intro { border-inline-start: 3px solid var(--sl-color-accent); padding: 0.1rem 0 0.1rem 0.85rem; }
  .intro p { margin: 0 0 0.5rem; color: var(--sl-color-text); font-size: 0.92rem; }
  .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem 1.1rem; font-size: 0.82rem; color: var(--sl-color-gray-2); }
  .legend li { display: flex; align-items: center; gap: 0.35rem; }
  .legend .star { color: var(--sl-color-accent); font-weight: 700; }
  .legend .dot { width: 0.7rem; height: 0.7rem; border-radius: 999px; border: 1px solid var(--sl-color-gray-4); border-left: 4px solid #2da44e; display: inline-block; }
  .vbadge { font-size: 0.68rem; font-weight: 700; padding: 0.05rem 0.4rem; border-radius: 999px; border: 1px solid var(--sl-color-gray-5); border-left-width: 3px; }
  .vbadge--verified { border-left-color: #2da44e; }
  .vbadge--under_review { border-left-color: #bf8700; }
  .vbadge--blocked { border-left-color: #cf222e; }
  .stackbar { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; }
  .mtitle { margin: 0; font-size: 1.05rem; }
  .modelgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
  @media (max-width: 34rem) { .modelgrid { grid-template-columns: 1fr; } }
  .modelnote { margin: 0; padding: 0.6rem 0.75rem; border-radius: 0.5rem; background: var(--sl-color-gray-6); border-inline-start: 3px solid var(--sl-color-accent); color: var(--sl-color-text); font-size: 0.88rem; }
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
