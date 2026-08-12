<script lang="ts">
  import { onMount } from 'svelte';
  import { matchDependency } from '../../enforcement/matcher.ts';
  import type { ExcludedOrg, Ecosystem } from '../../enforcement/types.ts';
  import { parseDependencyInput, dependencyInputError } from '../lib/policy-input.ts';
  import Receipt from './Receipt.svelte';

  /**
   * PolicyChecker — the thesis surface (DESIGN §5). The verdict is a Receipt:
   * CLEAN (stamped ok) / BLOCKED (customs stamp + the ownership chain rendered
   * as a chain), per-row receipts, and the CLI detail behind a "for developers"
   * disclosure. Fully localized (en/es/ar) via the house pattern: `lang` prop,
   * inline Record<Lang,…> string table, document.documentElement.lang fallback.
   */
  type Lang = 'en' | 'es' | 'ar';
  interface Props {
    lang?: string;
  }
  let { lang: langProp }: Props = $props();

  const STR: Record<
    Lang,
    {
      fieldLabel: string;
      ecosystemLabel: string;
      lookupLabel: string;
      checkButton: string;
      loadingButton: string;
      policyFailTitle: string;
      policyFailAction: string;
      emptyTitle: string;
      emptyAction: string;
      parseTitle: string;
      parseDetail: string;
      cleanTitle: string;
      cleanAction: (n: number) => string;
      blockedTitle: string;
      blockedAction: (blocked: number, total: number) => string;
      cleanWord: string;
      blockedWord: string;
      licensePending: string;
      licenseNone: string;
      ownedBy: (org: string, signal: string) => string;
      scopeNote: string;
      devSummary: string;
      devNote: string;
    }
  > = {
    en: {
      fieldLabel: 'Paste a package.json, or one dependency per line (name or name ecosystem)',
      ecosystemLabel: 'Default ecosystem',
      lookupLabel: 'look up licenses',
      checkButton: 'Check against the policy',
      loadingButton: 'Loading policy…',
      policyFailTitle: 'The policy list could not be loaded',
      policyFailAction:
        'The check runs entirely on your device, but it needs the policy list first. Reload the page to try again.',
      emptyTitle: 'Nothing to check yet',
      emptyAction: 'Paste a package.json, or one dependency per line, then run the check.',
      parseTitle: 'That paste could not be read',
      parseDetail: "That looks like a package.json but couldn't be parsed as JSON. Paste a valid package.json, or list one dependency per line.",
      cleanTitle: 'Clean',
      cleanAction: (n) =>
        `All ${n} ${n === 1 ? 'dependency is' : 'dependencies are'} clean — none owned by Meta, OpenAI, or xAI.`,
      blockedTitle: 'Blocked',
      blockedAction: (blocked, total) =>
        `${blocked} of ${total} ${total === 1 ? 'dependency is' : 'dependencies are'} owned by companies this project blocks — the chain of ownership is below.`,
      cleanWord: 'clean',
      blockedWord: 'blocked',
      licensePending: '…',
      licenseNone: '—',
      ownedBy: (org, signal) => `owned by ${org} (matched ${signal})`,
      scopeNote:
        'The policy check runs entirely in your browser against the same list the CI engine uses. License lookups use the live edge API when available.',
      devSummary: 'For developers',
      devNote:
        'This screens direct names by ownership; the full engine also walks the transitive tree and scans source — run it on a real project with:',
    },
    es: {
      fieldLabel: 'Pega un package.json, o una dependencia por línea (nombre o nombre ecosistema)',
      ecosystemLabel: 'Ecosistema por defecto',
      lookupLabel: 'buscar licencias',
      checkButton: 'Comprobar contra la política',
      loadingButton: 'Cargando la política…',
      policyFailTitle: 'No se pudo cargar la lista de la política',
      policyFailAction:
        'La comprobación se ejecuta por completo en tu dispositivo, pero primero necesita la lista de la política. Recarga la página para intentarlo de nuevo.',
      emptyTitle: 'Aún no hay nada que comprobar',
      emptyAction: 'Pega un package.json, o una dependencia por línea, y luego ejecuta la comprobación.',
      parseTitle: 'No se pudo leer lo pegado',
      parseDetail: 'Parece un package.json pero no se pudo analizar como JSON. Pega un package.json válido, o lista una dependencia por línea.',
      cleanTitle: 'Limpio',
      cleanAction: (n) =>
        `${n === 1 ? 'La dependencia es limpia' : `Las ${n} dependencias son limpias`} — ninguna es de Meta, OpenAI o xAI.`,
      blockedTitle: 'Bloqueado',
      blockedAction: (blocked, total) =>
        `${blocked} de ${total} ${total === 1 ? 'dependencia es' : 'dependencias son'} de empresas que este proyecto bloquea — la cadena de propiedad está abajo.`,
      cleanWord: 'limpia',
      blockedWord: 'bloqueada',
      licensePending: '…',
      licenseNone: '—',
      ownedBy: (org, signal) => `propiedad de ${org} (coincidencia: ${signal})`,
      scopeNote:
        'La comprobación de la política se ejecuta por completo en tu navegador contra la misma lista que usa el motor de CI. Las búsquedas de licencias usan la API edge en vivo cuando está disponible.',
      devSummary: 'Para desarrolladores',
      devNote:
        'Esto examina nombres directos por propiedad; el motor completo también recorre el árbol transitivo y analiza el código — ejecútalo en un proyecto real con:',
    },
    ar: {
      fieldLabel: 'الصق ملف package.json، أو اعتمادًا واحدًا في كل سطر (الاسم أو الاسم ثم النظام البيئي)',
      ecosystemLabel: 'النظام البيئي الافتراضي',
      lookupLabel: 'ابحث عن الرخص',
      checkButton: 'تحقّق مقابل السياسة',
      loadingButton: 'جارٍ تحميل السياسة…',
      policyFailTitle: 'تعذّر تحميل قائمة السياسة',
      policyFailAction:
        'يعمل الفحص بالكامل على جهازك، لكنه يحتاج قائمة السياسة أولًا. أعد تحميل الصفحة للمحاولة مجددًا.',
      emptyTitle: 'لا شيء للفحص بعد',
      emptyAction: 'الصق ملف package.json، أو اعتمادًا واحدًا في كل سطر، ثم شغّل الفحص.',
      parseTitle: 'تعذّرت قراءة ما أُلصق',
      parseDetail: 'يبدو أنه ملف package.json لكن تعذّر تحليله كـ JSON. الصق ملف package.json صالحًا، أو اذكر اعتمادًا واحدًا في كل سطر.',
      cleanTitle: 'نظيف',
      cleanAction: (n) => `جميع الاعتمادات نظيفة (${n}) — لا شيء منها مملوك لـ Meta أو OpenAI أو xAI.`,
      blockedTitle: 'محظور',
      blockedAction: (blocked, total) =>
        `${blocked} من أصل ${total} مملوكة لشركات يحظرها هذا المشروع — سلسلة الملكية في الأسفل.`,
      cleanWord: 'نظيف',
      blockedWord: 'محظور',
      licensePending: '…',
      licenseNone: '—',
      ownedBy: (org, signal) => `مملوك لـ ${org} (تطابق: ${signal})`,
      scopeNote:
        'يعمل فحص السياسة بالكامل في متصفحك مقابل القائمة نفسها التي يستخدمها محرّك CI. تستخدم عمليات البحث عن الرخص واجهة الـ edge المباشرة عند توفّرها.',
      devSummary: 'للمطوّرين',
      devNote:
        'يفحص هذا الأسماء المباشرة بحسب الملكية؛ ويتتبّع المحرّك الكامل أيضًا الشجرة الانتقالية ويفحص المصدر — شغّله على مشروع حقيقي مع:',
    },
  };

  const normalizeLang = (raw: string | undefined): Lang => {
    const v = (raw ?? '').toLowerCase().slice(0, 2);
    return v === 'es' || v === 'ar' ? v : 'en';
  };
  const lang = $derived(normalizeLang(langProp ?? (typeof document !== 'undefined' ? document.documentElement.lang : 'en')));
  const t = $derived(STR[lang]);

  let orgs = $state<ExcludedOrg[]>([]);
  let orgNames = $state<Record<string, string>>({});
  let policyReady = $state(false);
  let policyFailed = $state(false);
  let input = $state('');
  let ecosystem = $state<Ecosystem>('js');
  let checked = $state(false);
  let parseError = $state('');
  let lookupLicenses = $state(true);

  interface Row {
    name: string;
    ecosystem: Ecosystem;
    status: 'clean' | 'blocked';
    org?: string;
    signal?: string;
    license?: string;
    licenseState?: 'pending' | 'done' | 'na';
  }
  let rows = $state<Row[]>([]);

  onMount(async () => {
    try {
      const res = await fetch('/policy.json');
      const data = await res.json();
      orgs = data.orgs;
      orgNames = Object.fromEntries(orgs.map((o) => [o.key, o.display_name]));
      policyReady = true;
    } catch {
      policyFailed = true;
    }
  });

  async function fetchLicense(name: string, eco: Ecosystem): Promise<string | undefined> {
    try {
      const res = await fetch(`/api/license?eco=${encodeURIComponent(eco)}&name=${encodeURIComponent(name)}`);
      if (res.ok) {
        const data = await res.json();
        return data.license || undefined;
      }
    } catch { /* api unavailable (static preview) */ }
    return undefined;
  }

  async function run() {
    if (!policyReady) return;
    // Malformed package.json → show a parse error, never a false "all clean".
    // dependencyInputError is the detector (its English sentence is the lib's
    // tested contract for other consumers); the island renders localized copy.
    parseError = dependencyInputError(input) ? t.parseDetail : '';
    if (parseError) { rows = []; checked = true; return; }
    const deps = parseDependencyInput(input, ecosystem);
    rows = deps.map((d) => {
      const m = matchDependency({ name: d.name, ecosystem: d.ecosystem, source_file: 'input' }, orgs);
      return {
        name: d.name,
        ecosystem: d.ecosystem,
        status: m.length ? 'blocked' : 'clean',
        org: m[0]?.org_key,
        signal: m[0]?.signal,
        licenseState: lookupLicenses ? 'pending' : 'na',
      } as Row;
    });
    checked = true;

    if (lookupLicenses) {
      // Best-effort, in parallel; degrades gracefully when /api is absent.
      await Promise.all(
        rows.map(async (r, i) => {
          const lic = await fetchLicense(r.name, r.ecosystem);
          rows[i] = { ...rows[i]!, license: lic, licenseState: 'done' };
        }),
      );
    }
  }

  const blockedCount = $derived(rows.filter((r) => r.status === 'blocked').length);
</script>

<div class="checker">
  <label class="field">
    <span>{t.fieldLabel}</span>
    <textarea bind:value={input} rows="7" placeholder={'openai\nnostr-tools\n@atproto/api\ngithub.com/openai/openai-go go'}></textarea>
  </label>
  <div class="controls">
    <label>{t.ecosystemLabel}
      <select bind:value={ecosystem}>
        {#each ['js','rust','py','go','elixir','dart','ruby','kotlin','other'] as e}<option value={e}>{e}</option>{/each}
      </select>
    </label>
    <label class="cb"><input type="checkbox" bind:checked={lookupLicenses} /> {t.lookupLabel}</label>
    <button class="run" onclick={run} disabled={!policyReady}>{policyReady ? t.checkButton : t.loadingButton}</button>
  </div>

  {#if policyFailed}
    <Receipt status="warn" title={t.policyFailTitle} action={t.policyFailAction} />
  {/if}

  <div aria-live="polite">
    {#if checked && parseError}
      <Receipt status="warn" title={t.parseTitle} action={parseError} />
    {:else if checked && rows.length === 0}
      <Receipt status="pending" title={t.emptyTitle} action={t.emptyAction} />
    {:else if checked}
      {#if blockedCount === 0}
        <Receipt status="ok" title={t.cleanTitle} action={t.cleanAction(rows.length)} />
      {:else}
        <Receipt status="danger" title={t.blockedTitle} action={t.blockedAction(blockedCount, rows.length)} />
      {/if}

      <ul class="rows">
        {#each rows as r}
          <li class="row" class:row--blocked={r.status === 'blocked'}>
            <span class="row__head">
              <span class="row__name">{r.name}</span>
              <span class="row__eco">{r.ecosystem}</span>
              <span class="row__tag" class:tag--bad={r.status === 'blocked'}>
                {r.status === 'blocked' ? t.blockedWord : t.cleanWord}
              </span>
            </span>
            {#if r.status === 'blocked' && r.org}
              <span class="row__chain">{r.name} → {t.ownedBy(orgNames[r.org] ?? r.org, r.signal ?? '')}</span>
            {/if}
            <span class="row__license">{r.licenseState === 'pending' ? t.licensePending : (r.license ?? t.licenseNone)}</span>
          </li>
        {/each}
      </ul>

      <p class="note">{t.scopeNote}</p>
      <details class="dev">
        <summary>{t.devSummary}</summary>
        <p>{t.devNote}</p>
        <pre><code>npx tsx enforcement/cli.ts all --tree .</code></pre>
      </details>
    {/if}
  </div>
</div>

<style>
  .checker { margin: var(--space-sm) 0 var(--space-lg); display: flex; flex-direction: column; gap: var(--space-sm); }
  .field { display: flex; flex-direction: column; gap: var(--space-2xs); }
  .field > span { font-weight: var(--weight-bold); font-size: var(--step--1); color: var(--ink); }
  textarea, select {
    padding: 0.65rem 0.8rem;
    border: 1px solid var(--control-edge);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: max(16px, 1rem); /* never below 16px — avoids iOS focus auto-zoom */
  }
  textarea:focus, select:focus { border-color: var(--structure); }
  textarea { font-family: var(--font-mono); }
  .controls { display: flex; flex-wrap: wrap; gap: var(--space-xs); align-items: center; }
  .controls label { display: flex; gap: var(--space-2xs); align-items: center; color: var(--ink-soft); font-size: var(--step--1); }
  .cb { cursor: pointer; }
  .run {
    padding: 0.55rem var(--space-md);
    border-radius: var(--radius);
    border: 1px solid var(--structure);
    background: var(--structure);
    color: var(--on-structure);
    cursor: pointer;
    font-weight: var(--weight-bold);
    min-block-size: 2.75rem;
  }
  .run:disabled { opacity: 0.55; cursor: default; }

  /* Per-row receipts: icon + word + color (never color alone), the blocked
     ownership chain rendered as a chain. */
  .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2xs); }
  .row {
    display: grid;
    gap: var(--space-3xs);
    padding: var(--space-2xs) var(--space-sm);
    border: 1px solid var(--edge);
    border-inline-start: 2px solid var(--ok-edge);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .row--blocked { border-inline-start-color: var(--danger-edge); background: var(--verdict-danger-bg); }
  .row__head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2xs); }
  .row__name { font-family: var(--font-mono); font-weight: var(--weight-bold); color: var(--ink); overflow-wrap: anywhere; }
  .row__eco { font-size: var(--step--1); color: var(--ink-soft); }
  .row__tag {
    margin-inline-start: auto;
    font-size: var(--step--1);
    font-weight: var(--weight-bold);
    color: var(--ok-text);
  }
  .row__tag.tag--bad { color: var(--danger-text); }
  .row__chain { font-family: var(--font-mono); font-size: var(--step--1); color: var(--ink-soft); overflow-wrap: anywhere; }
  .row__license { font-family: var(--font-mono); font-size: var(--step--1); color: var(--ink); }

  .note { color: var(--ink-soft); font-size: var(--step--1); margin: 0; }
  .dev { color: var(--ink-soft); font-size: var(--step--1); }
  .dev summary { cursor: pointer; font-weight: var(--weight-bold); color: var(--ink); }
  .dev pre {
    background: var(--surface-2);
    border: 1px solid var(--edge);
    border-radius: var(--radius);
    padding: var(--space-2xs) var(--space-sm);
    overflow-x: auto;
  }
  select { min-block-size: 2.75rem; }
</style>
