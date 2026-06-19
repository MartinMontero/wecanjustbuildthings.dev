<script lang="ts">
  import { onMount } from 'svelte';
  import { catalogMatches, compareItems, facetCounts, type CatalogQuery, type FacetDim } from '../lib/catalog-filter.ts';
  import { loadSession, updateSession, subscribeSession, toggleExtraTool, type BuildSession } from '../lib/build-session.ts';

  interface Item {
    name: string;
    url: string;
    kind: string;
    ecosystem: string;
    category: string;
    protocols: string[];
    license: string;
    maintenance: string;
    verification: string;
    advisory: string | null;
    repo: string | null;
    uses: number;
    desc: string;
  }

  // `_hay` is a precomputed lowercase search string so live filtering doesn't
  // rebuild it for every item on every keystroke (~2k items × 6 reactive passes).
  type IndexedItem = Item & { _hay: string };

  // ---------- i18n ----------
  // House convention: an inline Record<Lang, …> string table keyed by id plus a
  // `lang` prop (mirrors model-compass/ui/i18n.ts and BuildStudio.svelte).
  type Lang = 'en' | 'es' | 'ar';
  let { lang: initialLang = 'en' }: { lang?: string } = $props();
  function normalizeLang(raw: string | undefined | null): Lang {
    const v = (raw ?? '').toLowerCase().slice(0, 2);
    return v === 'es' || v === 'ar' ? v : 'en';
  }
  const lang: Lang = normalizeLang(initialLang);

  interface CatalogStrings {
    ctaBold: string;
    ctaRest: string;
    ctaGo: string;
    intro1: string;
    introBlocks: string; // the bold word inside intro1 ("building blocks")
    intro2: string;
    legendVerified: string;
    legendVerifiedText: string;
    legendUnderReview: string;
    legendUnderReviewText: string;
    legendActive: string;
    legendActiveText: string;
    legendOrigin: string;
    legendOriginText: string;
    searchLabel: string; // sr-only
    sort: string;
    sortUses: string;
    sortName: string;
    loading: string;
    loadFailed: string;
    clearAll: string;
    facetType: string;
    facetNetwork: string;
    facetEcosystem: string;
    facetVerification: string;
    facetCategory: string;
    filters: string; // aria-label
    empty: string;
    addToBuild: string;
    inBuild: string;
  }
  const STRINGS: Record<Lang, CatalogStrings> = {
    en: {
      ctaBold: 'New here? Don’t browse — let the Build Studio choose for you.',
      ctaRest: 'Tell it what you want to build in a sentence, and it picks the few tools you need and shows how they fit together.',
      ctaGo: 'Open the Build Studio →',
      intro1: 'Think of this as a vetted shelf of',
      introBlocks: 'building blocks',
      intro2: '— ready-made tools, libraries, and services your project (and your AI agent) can use instead of building from scratch. Every entry here has already been checked two ways: nothing owned by Meta, OpenAI, or xAI gets in, and each one’s license was confirmed. Search by what it does, or use the filters to narrow things down. Not sure what something is? Open it — each page explains it in plain terms.',
      legendVerified: 'verified',
      legendVerifiedText: 'license confirmed at a specific version',
      legendUnderReview: 'under review',
      legendUnderReviewText: 'looks right, not yet fully confirmed',
      legendActive: 'active',
      legendActiveText: 'recently kept up to date',
      legendOrigin: 'origin',
      legendOriginText: 'made by an excluded company but safe & freely licensed — your call',
      searchLabel: 'Search the catalog',
      sort: 'Sort',
      sortUses: 'Most used',
      sortName: 'A–Z',
      loading: 'Loading the catalog…',
      loadFailed: 'Couldn’t load the catalog. Try refreshing the page.',
      clearAll: 'Clear all',
      facetType: 'Type',
      facetNetwork: 'Network',
      facetEcosystem: 'Language / platform',
      facetVerification: 'How thoroughly checked',
      facetCategory: 'Category',
      filters: 'Filters',
      empty: 'No tools match these filters.',
      addToBuild: '+ Add to build',
      inBuild: '✓ In your build',
    },
    es: {
      ctaBold: '¿Nuevo por aquí? No explores — deja que el Build Studio elija por ti.',
      ctaRest: 'Cuéntale en una frase qué quieres construir y elige las pocas herramientas que necesitas y te muestra cómo encajan.',
      ctaGo: 'Abrir el Build Studio →',
      intro1: 'Piensa en esto como un estante verificado de',
      introBlocks: 'bloques de construcción',
      intro2: '— herramientas, librerías y servicios ya hechos que tu proyecto (y tu agente de IA) pueden usar en vez de construir desde cero. Cada entrada ya ha sido revisada de dos maneras: no entra nada propiedad de Meta, OpenAI o xAI, y se confirmó la licencia de cada una. Busca por lo que hace, o usa los filtros para acotar. ¿No sabes qué es algo? Ábrelo — cada página lo explica en términos sencillos.',
      legendVerified: 'verificado',
      legendVerifiedText: 'licencia confirmada en una versión concreta',
      legendUnderReview: 'en revisión',
      legendUnderReviewText: 'parece correcto, aún no confirmado del todo',
      legendActive: 'activo',
      legendActiveText: 'actualizado recientemente',
      legendOrigin: 'origen',
      legendOriginText: 'hecho por una empresa excluida pero seguro y con licencia libre — tú decides',
      searchLabel: 'Buscar en el catálogo',
      sort: 'Ordenar',
      sortUses: 'Más usadas',
      sortName: 'A–Z',
      loading: 'Cargando el catálogo…',
      loadFailed: 'No se pudo cargar el catálogo. Prueba a recargar la página.',
      clearAll: 'Limpiar todo',
      facetType: 'Tipo',
      facetNetwork: 'Red',
      facetEcosystem: 'Lenguaje / plataforma',
      facetVerification: 'Qué tan a fondo se revisó',
      facetCategory: 'Categoría',
      filters: 'Filtros',
      empty: 'Ninguna herramienta coincide con estos filtros.',
      addToBuild: '+ Añadir al proyecto',
      inBuild: '✓ En tu proyecto',
    },
    ar: {
      ctaBold: 'جديد هنا؟ لا تتصفّح — دع Build Studio يختار لك.',
      ctaRest: 'أخبره في جملة بما تريد بناءه، فيختار الأدوات القليلة التي تحتاجها ويُظهر كيف تتكامل معاً.',
      ctaGo: 'افتح Build Studio ←',
      intro1: 'اعتبر هذا رفّاً مُدقَّقاً من',
      introBlocks: 'اللبنات',
      intro2: '— أدوات ومكتبات وخدمات جاهزة يمكن لمشروعك (ولوكيل الذكاء الاصطناعي) استخدامها بدل البناء من الصفر. كل مدخل هنا فُحص بطريقتين: لا يدخل أي شيء تملكه Meta أو OpenAI أو xAI، وتُؤكَّد ترخيص كلٍّ منها. ابحث بحسب ما تفعله، أو استخدم المرشّحات لتضييق النتائج. لا تعرف ما هو شيء ما؟ افتحه — كل صفحة تشرحه بعبارات بسيطة.',
      legendVerified: 'مُتحقَّق',
      legendVerifiedText: 'الترخيص مؤكَّد عند إصدار محدّد',
      legendUnderReview: 'قيد المراجعة',
      legendUnderReviewText: 'يبدو صحيحاً، لم يُؤكَّد بالكامل بعد',
      legendActive: 'نشط',
      legendActiveText: 'محدَّث مؤخراً',
      legendOrigin: 'المنشأ',
      legendOriginText: 'من صنع شركة مُستبعَدة لكنه آمن وبترخيص حر — القرار لك',
      searchLabel: 'ابحث في الكتالوج',
      sort: 'ترتيب',
      sortUses: 'الأكثر استخداماً',
      sortName: 'أ–ي',
      loading: 'جارٍ تحميل الكتالوج…',
      loadFailed: 'تعذّر تحميل الكتالوج. حاول إعادة تحميل الصفحة.',
      clearAll: 'مسح الكل',
      facetType: 'النوع',
      facetNetwork: 'الشبكة',
      facetEcosystem: 'اللغة / المنصّة',
      facetVerification: 'مدى دقّة الفحص',
      facetCategory: 'الفئة',
      filters: 'المرشّحات',
      empty: 'لا توجد أدوات تطابق هذه المرشّحات.',
      addToBuild: '+ أضف إلى المشروع',
      inBuild: '✓ في مشروعك',
    },
  };
  const t = STRINGS[lang];

  // Localized labels for status DATA VALUES, keyed by the ORIGINAL english value
  // so the visible badge text is translated while the `badge--{status}` CSS class
  // (keyed on the english value) is preserved untouched. Falls back to a
  // space-normalized english value for any status not listed.
  const VERIFICATION_LABELS: Record<Lang, Record<string, string>> = {
    en: { verified: 'verified', under_review: 'under review', blocked: 'blocked' },
    es: { verified: 'verificado', under_review: 'en revisión', blocked: 'bloqueado' },
    ar: { verified: 'مُتحقَّق', under_review: 'قيد المراجعة', blocked: 'محظور' },
  };
  const MAINTENANCE_LABELS: Record<Lang, Record<string, string>> = {
    en: { active: 'active', minimal: 'minimal', dormant: 'dormant', abandoned: 'abandoned' },
    es: { active: 'activo', minimal: 'mínimo', dormant: 'inactivo', abandoned: 'abandonado' },
    ar: { active: 'نشط', minimal: 'محدود', dormant: 'خامل', abandoned: 'مهجور' },
  };
  function verificationLabel(v: string): string {
    return VERIFICATION_LABELS[lang]?.[v] ?? v.replace('_', ' ');
  }
  function maintenanceLabel(v: string): string {
    return MAINTENANCE_LABELS[lang]?.[v] ?? v;
  }
  // "{advisory}-origin" — the advisory value (e.g. "meta") stays as-is; only the
  // "-origin" suffix word is localized.
  function originLabel(advisory: string): string {
    if (lang === 'es') return `origen ${advisory}`;
    if (lang === 'ar') return `من منشأ ${advisory}`;
    return `${advisory}-origin`;
  }
  // Search placeholder with the live tool count interpolated.
  function searchPlaceholder(n: number): string {
    const count = n || '';
    if (lang === 'es') return `Busca entre ${count} herramientas por nombre o por lo que hacen…`;
    if (lang === 'ar') return `ابحث في ${count} أداة بالاسم أو بما تفعله…`;
    return `Search ${count} tools by name or what they do…`;
  }
  // "{filtered} of {items}" header count.
  function countLabel(shown: number, total: number): string {
    if (lang === 'es') return `de ${total}`;
    if (lang === 'ar') return `من ${total}`;
    return `of ${total}`;
  }
  // "Clear all ({n})" — active-filter count badge.
  function clearAllCount(n: number): string {
    return `${t.clearAll} (${n})`;
  }
  // "used in {n} audited project(s)" — pluralized per language.
  function usedIn(n: number): string {
    if (lang === 'es') return n === 1 ? `usada en ${n} proyecto auditado` : `usada en ${n} proyectos auditados`;
    if (lang === 'ar') {
      // Arabic plural rules: 1 → singular, 2 → dual, 3–10 → plural, 11+ → singular noun.
      if (n === 1) return `مُستخدَمة في مشروع مُدقَّق واحد`;
      if (n === 2) return `مُستخدَمة في مشروعين مُدقَّقين`;
      if (n >= 3 && n <= 10) return `مُستخدَمة في ${n} مشاريع مُدقَّقة`;
      return `مُستخدَمة في ${n} مشروعاً مُدقَّقاً`;
    }
    return `used in ${n} audited project${n === 1 ? '' : 's'}`;
  }
  // "Show more ({n} remaining)".
  function showMore(n: number): string {
    if (lang === 'es') return `Mostrar más (${n} restantes)`;
    if (lang === 'ar') return `عرض المزيد (${n} متبقية)`;
    return `Show more (${n} remaining)`;
  }

  let items = $state<IndexedItem[]>([]);
  let loading = $state(true);
  let failed = $state(false);

  let q = $state('');
  let selKind = $state<Set<string>>(new Set());
  let selProtocol = $state<Set<string>>(new Set());
  let selEcosystem = $state<Set<string>>(new Set());
  let selCategory = $state<Set<string>>(new Set());
  let selVerification = $state<Set<string>>(new Set());
  let sort = $state<'uses' | 'name'>('uses');

  // Catalog ↔ shared build session: which tools are already in the build (the
  // `adjustments.extra` channel BuildStudio restores on mount). Read on mount and
  // kept in sync (incl. other tabs) via subscribeSession.
  let inBuild = $state<Set<string>>(new Set());
  const syncBuild = (s: BuildSession) => { inBuild = new Set(s.adjustments.extra); };
  onMount(() => { syncBuild(loadSession()); return subscribeSession(syncBuild); });
  function toggleBuild(name: string) {
    syncBuild(updateSession((s) => toggleExtraTool(s, name)));
  }
  let limit = $state(60);

  onMount(async () => {
    try {
      const res = await fetch('/catalog.json');
      if (!res.ok) throw new Error(String(res.status));
      const raw = (await res.json()) as Item[];
      items = raw.map((it) => ({
        ...it,
        _hay: `${it.name} ${it.desc} ${it.ecosystem} ${it.category} ${it.license} ${it.protocols.join(' ')}`.toLowerCase(),
      }));
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  });

  function toggle(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    limit = 60;
    return next;
  }

  // Build the pure query object from the island's reactive state; the filter,
  // facet, and sort logic itself lives in (and is tested in) lib/catalog-filter.ts.
  const query = $derived<CatalogQuery>({
    text: q,
    facets: { kind: selKind, protocol: selProtocol, ecosystem: selEcosystem, category: selCategory, verification: selVerification },
  });

  const filtered = $derived(
    items.filter((it) => catalogMatches(it, query)).sort((a, b) => compareItems(sort, a, b)),
  );

  const facet = (dim: FacetDim, get: (it: IndexedItem) => string[]) => facetCounts(items, query, dim, get);

  const kindFacet = $derived(facet('kind', (it) => [it.kind]));
  const protocolFacet = $derived(facet('protocol', (it) => it.protocols));
  const ecosystemFacet = $derived(facet('ecosystem', (it) => [it.ecosystem]));
  const categoryFacet = $derived(facet('category', (it) => [it.category]));
  const verificationFacet = $derived(facet('verification', (it) => [it.verification]));

  const activeCount = $derived(
    selKind.size + selProtocol.size + selEcosystem.size + selCategory.size + selVerification.size + (q.trim() ? 1 : 0),
  );

  function clearAll() {
    q = '';
    selKind = new Set();
    selProtocol = new Set();
    selEcosystem = new Set();
    selCategory = new Set();
    selVerification = new Set();
    limit = 60;
  }
</script>

<div class="explorer">
  <a class="cat-cta" href="/build/">
    <span><strong>{t.ctaBold}</strong> {t.ctaRest}</span>
    <span class="cat-cta-go">{t.ctaGo}</span>
  </a>
  <div class="cat-intro">
    <p>
      {t.intro1} <strong>{t.introBlocks}</strong> {t.intro2}
    </p>
    <ul class="cat-legend">
      <li><span class="badge badge--verified">{t.legendVerified}</span> {t.legendVerifiedText}</li>
      <li><span class="badge badge--under_review">{t.legendUnderReview}</span> {t.legendUnderReviewText}</li>
      <li><span class="badge badge--active">{t.legendActive}</span> {t.legendActiveText}</li>
      <li><span class="badge badge--advisory">{t.legendOrigin}</span> {t.legendOriginText}</li>
    </ul>
  </div>
  <div class="toolbar">
    <label class="search">
      <span class="sr-only">{t.searchLabel}</span>
      <input
        type="search"
        placeholder={searchPlaceholder(items.length)}
        bind:value={q}
        oninput={() => (limit = 60)}
      />
    </label>
    <label class="sort">
      {t.sort}
      <select bind:value={sort}>
        <option value="uses">{t.sortUses}</option>
        <option value="name">{t.sortName}</option>
      </select>
    </label>
  </div>

  {#if loading}
    <p class="status">{t.loading}</p>
  {:else if failed}
    <p class="status">{t.loadFailed}</p>
  {:else}
    <div class="layout">
      <aside class="facets" aria-label={t.filters}>
        <div class="facets-head">
          <strong>{filtered.length}</strong> {countLabel(filtered.length, items.length)}
          {#if activeCount}<button class="link" onclick={clearAll}>{clearAllCount(activeCount)}</button>{/if}
        </div>

        {#snippet group(title: string, options: [string, number][], sel: Set<string>, apply: (s: Set<string>) => void)}
          <fieldset>
            <legend>{title}</legend>
            <div class="opts">
              {#each options as [value, count] (value)}
                <label class="opt" class:on={sel.has(value)}>
                  <input type="checkbox" checked={sel.has(value)} onchange={() => apply(toggle(sel, value))} />
                  <span class="opt-label">{value}</span>
                  <span class="opt-count">{count}</span>
                </label>
              {/each}
            </div>
          </fieldset>
        {/snippet}

        {@render group(t.facetType, kindFacet, selKind, (s) => (selKind = s))}
        {@render group(t.facetNetwork, protocolFacet, selProtocol, (s) => (selProtocol = s))}
        {@render group(t.facetEcosystem, ecosystemFacet, selEcosystem, (s) => (selEcosystem = s))}
        {@render group(t.facetVerification, verificationFacet, selVerification, (s) => (selVerification = s))}
        {@render group(t.facetCategory, categoryFacet, selCategory, (s) => (selCategory = s))}
      </aside>

      <div class="results">
        {#if filtered.length === 0}
          <p class="status">{t.empty} <button class="link" onclick={clearAll}>{t.clearAll}</button></p>
        {/if}
        <ul class="cards">
          {#each filtered.slice(0, limit) as it (it.url)}
            <li class="card">
              <div class="card-top">
                <a class="card-name" href={it.url}>{it.name}</a>
                <span class="badges">
                  <span class="badge badge--{it.verification}">{verificationLabel(it.verification)}</span>
                  <span class="badge badge--{it.maintenance}">{maintenanceLabel(it.maintenance)}</span>
                  {#if it.advisory}<span class="badge badge--advisory">{originLabel(it.advisory)}</span>{/if}
                </span>
              </div>
              <p class="card-desc">{it.desc}</p>
              <div class="card-meta">
                <span>{it.ecosystem}</span> · <span>{it.license}</span> · <span>{it.category}</span>
                {#if it.uses > 0}· <span>{usedIn(it.uses)}</span>{/if}
              </div>
              {#if it.kind !== 'dataset'}
                <button
                  type="button"
                  class="card-build"
                  class:on={inBuild.has(it.name)}
                  aria-pressed={inBuild.has(it.name)}
                  onclick={() => toggleBuild(it.name)}
                >{inBuild.has(it.name) ? t.inBuild : t.addToBuild}</button>
              {/if}
            </li>
          {/each}
        </ul>
        {#if filtered.length > limit}
          <button class="more" onclick={() => (limit += 60)}>{showMore(filtered.length - limit)}</button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .explorer { margin: 1rem 0 2rem; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .cat-cta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; text-decoration: none; color: var(--sl-color-text); background: color-mix(in srgb, var(--sl-color-accent) 9%, transparent); border: 1px solid var(--sl-color-accent); border-radius: 0.6rem; padding: 0.8rem 1rem; margin-bottom: 1.1rem; }
  .cat-cta span:first-child { flex: 1 1 18rem; font-size: 0.92rem; }
  .cat-cta-go { font-weight: 700; color: var(--sl-color-text-accent); white-space: nowrap; }
  .cat-intro { border-inline-start: 3px solid var(--sl-color-accent); padding: 0.1rem 0 0.1rem 0.9rem; margin-bottom: 1.1rem; }
  .cat-intro p { margin: 0 0 0.6rem; color: var(--sl-color-text); font-size: 0.95rem; max-width: 60ch; }
  .cat-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem 1.1rem; font-size: 0.82rem; color: var(--sl-color-gray-2); }
  .cat-legend li { display: flex; align-items: center; gap: 0.4rem; }
  .toolbar { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: end; margin-bottom: 1rem; }
  .search { flex: 1 1 18rem; }
  .search input {
    width: 100%; padding: 0.55rem 0.75rem; font-size: 1rem;
    border: 1px solid var(--sl-color-gray-5); border-radius: 0.5rem;
    background: var(--sl-color-black); color: var(--sl-color-white);
  }
  .sort { display: flex; gap: 0.4rem; align-items: center; color: var(--sl-color-text); font-size: 0.9rem; }
  .sort select { padding: 0.4rem; border-radius: 0.4rem; border: 1px solid var(--sl-color-gray-5); background: var(--sl-color-black); color: var(--sl-color-white); }
  .layout { display: grid; grid-template-columns: 16rem 1fr; gap: 1.5rem; align-items: start; }
  @media (max-width: 50rem) { .layout { grid-template-columns: 1fr; } }
  .facets { position: sticky; top: 1rem; }
  .facets-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.75rem; font-size: 0.9rem; color: var(--sl-color-text); }
  fieldset { border: 0; border-top: 1px solid var(--sl-color-gray-6); margin: 0; padding: 0.6rem 0; }
  legend { font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--sl-color-gray-2); }
  .opts { display: flex; flex-direction: column; gap: 0.15rem; margin-top: 0.4rem; max-height: 14rem; overflow-y: auto; }
  .opt { display: flex; align-items: center; gap: 0.45rem; font-size: 0.85rem; padding: 0.2rem 0.3rem; border-radius: 0.35rem; cursor: pointer; color: var(--sl-color-text); }
  .opt:hover { background: var(--sl-color-gray-6); }
  .opt.on { background: var(--sl-color-gray-6); }
  .opt-label { flex: 1; }
  .opt-count { color: var(--sl-color-gray-3); font-variant-numeric: tabular-nums; }
  .link { background: none; border: 0; color: var(--sl-color-text-accent); cursor: pointer; font: inherit; padding: 0; text-decoration: underline; }
  .status { color: var(--sl-color-gray-2); }
  .cards { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.75rem; }
  .card { border: 1px solid var(--sl-color-gray-6); border-radius: 0.6rem; padding: 0.85rem 1rem; }
  .card-top { display: flex; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; align-items: baseline; }
  .card-name { font-weight: 700; font-size: 1.02rem; }
  .card-desc { margin: 0.35rem 0; color: var(--sl-color-text); font-size: 0.92rem; }
  .card-meta { color: var(--sl-color-gray-2); font-size: 0.82rem; }
  .card-build {
    margin-top: 0.6rem; font: inherit; font-size: 0.82rem; cursor: pointer;
    padding: 0.25rem 0.6rem; border-radius: 0.4rem;
    border: 1px solid var(--sl-color-gray-5); background: var(--sl-color-gray-6); color: var(--sl-color-text);
  }
  .card-build:hover { border-color: var(--sl-color-text-accent); }
  .card-build.on { border-color: var(--sl-color-text-accent); color: var(--sl-color-text-accent); font-weight: 600; }
  .card-build:focus-visible { outline: 2px solid var(--sl-color-text-accent); outline-offset: 2px; }
  .badges { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .badge { font-size: 0.72rem; font-weight: 600; padding: 0.18rem 0.45rem; border-radius: 999px; border: 1px solid var(--sl-color-gray-5); border-left-width: 4px; background: var(--sl-color-gray-6); color: var(--sl-color-text); }
  .badge--verified, .badge--active { border-left-color: var(--ok-edge); }
  .badge--under_review, .badge--minimal { border-left-color: var(--warn-edge); }
  .badge--blocked, .badge--abandoned { border-left-color: var(--danger-edge); }
  .badge--dormant, .badge--advisory { border-left-color: var(--signal); }
  .more { margin-top: 1rem; padding: 0.5rem 1rem; border-radius: 0.5rem; border: 1px solid var(--sl-color-gray-5); background: var(--sl-color-gray-6); color: var(--sl-color-text); cursor: pointer; }
</style>
