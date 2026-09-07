<script lang="ts">
  import { onMount } from 'svelte';
  import { catalogMatches, compareItems, facetCounts, type CatalogQuery, type FacetDim } from '../lib/catalog-filter.ts';
  import { loadSession, updateSession, subscribeSession, toggleExtraTool, type BuildSession } from '../lib/build-session.ts';
  import { catalogBuildBase, catalogBuildHref } from '../lib/catalog-cta.ts';
  import Receipt from './Receipt.svelte';

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
    retry: string;
    errorTitle: string;
    emptyTitle: string;
    emptyHint: string;
    clearAll: string;
    facetType: string;
    facetNetwork: string;
    facetEcosystem: string;
    facetVerification: string;
    facetCategory: string;
    filters: string; // aria-label
    addToBuild: string;
    inBuild: string;
    addAria: string;
    removeAria: string;
    statusAdded: string;
    statusRemoved: string;
    trayLabel: string;
    trayCta: string;
    trayHint: string;
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
      retry: 'Try again',
      errorTitle: 'The catalog didn’t load',
      emptyTitle: 'Nothing matches these filters',
      emptyHint: 'Try a broader word, or clear a filter or two.',
      clearAll: 'Clear all',
      facetType: 'Type',
      facetNetwork: 'Network',
      facetEcosystem: 'Language / platform',
      facetVerification: 'How thoroughly checked',
      facetCategory: 'Category',
      filters: 'Filters',
      addToBuild: '+ Add to build',
      inBuild: '✓ In your build',
      addAria: 'Add to your build',
      removeAria: 'Remove from your build',
      statusAdded: 'added',
      statusRemoved: 'removed',
      trayLabel: 'in your build',
      trayCta: 'Review in the Build Studio →',
      trayHint: 'These travel with you into the Build Studio — open it when you’re ready.',
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
      retry: 'Reintentar',
      errorTitle: 'No se pudo cargar el catálogo',
      emptyTitle: 'Nada coincide con estos filtros',
      emptyHint: 'Prueba una palabra más general o quita un filtro o dos.',
      clearAll: 'Limpiar todo',
      facetType: 'Tipo',
      facetNetwork: 'Red',
      facetEcosystem: 'Lenguaje / plataforma',
      facetVerification: 'Qué tan a fondo se revisó',
      facetCategory: 'Categoría',
      filters: 'Filtros',
      addToBuild: '+ Añadir al proyecto',
      inBuild: '✓ En tu proyecto',
      addAria: 'Añadir a tu proyecto',
      removeAria: 'Quitar de tu proyecto',
      statusAdded: 'añadido',
      statusRemoved: 'eliminado',
      trayLabel: 'en tu proyecto',
      trayCta: 'Revisar en el Build Studio →',
      trayHint: 'Te acompañan al Build Studio — ábrelo cuando estés listo.',
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
      retry: 'أعد المحاولة',
      errorTitle: 'تعذّر تحميل الكتالوج',
      emptyTitle: 'لا شيء يطابق هذه المرشّحات',
      emptyHint: 'جرّب كلمة أعمّ، أو أزل مرشّحًا أو اثنين.',
      facetVerification: 'مدى دقّة الفحص',
      facetCategory: 'الفئة',
      filters: 'المرشّحات',
      addToBuild: '+ أضف إلى المشروع',
      inBuild: '✓ في مشروعك',
      addAria: 'أضف إلى مشروعك',
      removeAria: 'أزل من مشروعك',
      statusAdded: 'أُضيفت',
      statusRemoved: 'أُزيلت',
      trayLabel: 'في مشروعك',
      trayCta: 'راجِع في استوديو البناء ←',
      trayHint: 'تنتقل معك إلى استوديو البناء — افتحه عندما تكون جاهزاً.',
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

  // Catalog ↔ shared build session. `inBuild` = tools already staged (the
  // adjustments.extra channel BuildStudio restores on mount); `buildSeed` = the tool
  // the Studio will open at; `buildStatus` feeds an aria-live region so every add/
  // remove is announced. Synced on mount + across tabs via subscribeSession.
  let inBuild = $state<Set<string>>(new Set());
  let buildSeed = $state<string | null>(null);
  let buildStatus = $state('');
  const syncBuild = (s: BuildSession) => {
    inBuild = new Set(s.adjustments.extra);
    buildSeed = s.seededTool;
  };
  onMount(() => { syncBuild(loadSession()); return subscribeSession(syncBuild); });

  // Open the Build Studio oriented at a real tool: ?seed= jumps it to the blueprint
  // focused there (same path a tool page's "Build with this" uses). Locale-aware
  // via catalog-cta.ts (M3 — the CTA used to hardlink the English Studio).
  const buildBase = catalogBuildBase(lang);
  const buildHref = $derived(catalogBuildHref(lang, buildSeed, inBuild));

  function toggleBuild(name: string) {
    const wasIn = inBuild.has(name);
    syncBuild(updateSession((s) => toggleExtraTool(s, name)));
    buildStatus = `${name} ${wasIn ? t.statusRemoved : t.statusAdded} — ${inBuild.size} ${t.trayLabel}`;
  }
  let limit = $state(60);

  // The catalog fetch, retryable: the error state's plain-verb button re-runs
  // this without a page reload (M3 designed error state).
  async function loadCatalog() {
    loading = true;
    failed = false;
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
  }
  onMount(loadCatalog);

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
  <a class="cat-cta" href={buildBase}>
    <span><strong>{t.ctaBold}</strong> {t.ctaRest}</span>
    <span class="cat-cta-go">{t.ctaGo}</span>
  </a>
  <div class="cat-intro">
    <p>
      {t.intro1} <strong>{t.introBlocks}</strong> {t.intro2}
    </p>
    <ul class="cat-legend">
      <li><span class="wcb-badge wcb-badge--verified">{t.legendVerified}</span> {t.legendVerifiedText}</li>
      <li><span class="wcb-badge wcb-badge--under_review">{t.legendUnderReview}</span> {t.legendUnderReviewText}</li>
      <li><span class="wcb-badge wcb-badge--active">{t.legendActive}</span> {t.legendActiveText}</li>
      <li><span class="wcb-badge wcb-badge--advisory">{t.legendOrigin}</span> {t.legendOriginText}</li>
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
    <!-- Designed loading state: a skeleton of the receipt-card grid, so the
         layout (and the LCP element) is stable before /catalog.json arrives. -->
    <div class="skeleton-wrap" aria-hidden="true">
      <div class="cards cards--skeleton">
        {#each Array(6) as _}
          <div class="card card--skeleton">
            <div class="sk-line sk-line--title"></div>
            <div class="sk-line"></div>
            <div class="sk-line sk-line--short"></div>
          </div>
        {/each}
      </div>
    </div>
    <p class="sr-only" role="status">{t.loading}</p>
  {:else if failed}
    <div class="state">
      <Receipt status="danger" title={t.errorTitle} evidence={t.loadFailed}>
        <button type="button" class="state-btn" onclick={loadCatalog}>{t.retry}</button>
      </Receipt>
    </div>
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
          <div class="state">
            <Receipt status="pending" title={t.emptyTitle} evidence={t.emptyHint}>
              <button type="button" class="state-btn" onclick={clearAll}>{t.clearAll}</button>
            </Receipt>
          </div>
        {/if}
        <ul class="cards">
          {#each filtered.slice(0, limit) as it (it.url)}
            <li class="card card--{it.verification}">
              <div class="card-top">
                <a class="card-name" href={it.url}>{it.name}</a>
                <span class="badges">
                  <span class="wcb-badge wcb-badge--{it.verification}">{verificationLabel(it.verification)}</span>
                  <span class="wcb-badge wcb-badge--{it.maintenance}">{maintenanceLabel(it.maintenance)}</span>
                  {#if it.advisory}<span class="wcb-badge wcb-badge--advisory">{originLabel(it.advisory)}</span>{/if}
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
                  aria-label={`${inBuild.has(it.name) ? t.removeAria : t.addAria}: ${it.name}`}
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

  <!-- Always-present live region: announces every add/remove to screen readers. -->
  <p class="sr-only" role="status" aria-live="polite">{buildStatus}</p>

  <!-- Persistent, sticky "build tray": keeps the builder oriented (what's staged) and
       in control (when to move on), with a guided next step into the Build Studio. -->
  {#if inBuild.size}
    <div class="build-tray">
      <span class="build-tray__count"><strong>{inBuild.size}</strong> {t.trayLabel}</span>
      <span class="build-tray__hint">{t.trayHint}</span>
      <a class="build-tray__cta" href={buildHref}>{t.trayCta}</a>
    </div>
  {/if}
</div>

<style>
  .explorer { margin: 1rem 0 2rem; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .cat-cta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2xs) var(--space-sm); text-decoration: none; color: var(--ink); background: color-mix(in srgb, var(--structure) 9%, transparent); border: 1px solid var(--structure); border-radius: var(--radius); padding: var(--space-xs) var(--space-sm); margin-bottom: var(--space-sm); }
  .cat-cta span:first-child { flex: 1 1 18rem; font-size: 0.92rem; }
  .cat-cta-go { font-weight: var(--weight-bold); color: var(--structure); white-space: nowrap; }
  .cat-intro { border-inline-start: 3px solid var(--structure); padding: 0.1rem 0 0.1rem var(--space-sm); margin-bottom: var(--space-sm); }
  .cat-intro p { margin: 0 0 var(--space-2xs); color: var(--ink); font-size: var(--step-0); max-width: 60ch; }
  .cat-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-3xs) var(--space-sm); font-size: var(--step--1); color: var(--ink-soft); }
  .cat-legend li { display: flex; align-items: center; gap: 0.4rem; }
  .toolbar { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: end; margin-bottom: 1rem; }
  .search { flex: 1 1 18rem; }
  .search input {
    width: 100%; padding: 0.55rem 0.75rem; font-size: max(16px, 1rem);
    border: 1px solid var(--control-edge); border-radius: var(--radius);
    background: var(--surface); color: var(--ink);
  }
  .sort { display: flex; gap: var(--space-3xs); align-items: center; color: var(--ink); font-size: var(--step--1); }
  .sort select { padding: var(--space-3xs); font-size: max(16px, 1rem); border-radius: var(--radius); border: 1px solid var(--control-edge); background: var(--surface); color: var(--ink); }
  .layout { display: grid; grid-template-columns: 15rem minmax(0, 1fr); gap: 1.5rem; align-items: start; }
  @media (max-width: 50rem) { .layout { grid-template-columns: 1fr; } }
  .facets { position: sticky; top: 1rem; }
  .facets-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--space-xs); font-size: var(--step--1); color: var(--ink); }
  /* Designed facet groups (D3): token-native rows with a count pill, a clear
     selected state (edge + wash, never colour alone — the checkbox is the icon),
     and the system accent on the control itself. */
  fieldset { border: 0; border-top: 1px solid var(--edge); margin: 0; padding: var(--space-2xs) 0; }
  legend { font-weight: var(--weight-bold); font-size: var(--step--1); text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft); }
  .opts { display: flex; flex-direction: column; gap: var(--space-3xs); margin-top: var(--space-3xs); max-height: 14rem; overflow-y: auto; }
  .opt {
    display: flex; align-items: center; gap: 0.45rem; font-size: 0.85rem;
    padding: 0.2rem 0.3rem; border-radius: var(--radius-sm); cursor: pointer;
    color: var(--ink); border: 1px solid transparent;
  }
  .opt input { accent-color: var(--structure); }
  .opt:hover { background: var(--surface-2); }
  .opt.on { background: var(--surface-2); border-color: var(--structure); }
  .opt-label { flex: 1; }
  .opt-count {
    color: var(--ink-soft); font-variant-numeric: tabular-nums;
    background: var(--surface-2); border-radius: var(--radius-pill);
    padding: 0.05em 0.5em; font-size: var(--step--1);
  }
  .opt.on .opt-count { background: var(--surface); }
  .link { background: none; border: 0; color: var(--structure); cursor: pointer; font: inherit; padding: 0; text-decoration: underline; }
  .state { max-width: 34rem; margin: var(--space-md) auto; }
  .state-btn {
    margin-top: var(--space-2xs); font: inherit; font-weight: var(--weight-bold);
    padding: var(--space-3xs) var(--space-sm); min-block-size: 2.75rem;
    border-radius: var(--radius-sm); cursor: pointer;
    border: 1px solid var(--control-edge); background: var(--surface-2); color: var(--ink);
  }
  .state-btn:focus-visible { outline: var(--focus-width) solid var(--ring); outline-offset: var(--focus-offset); }
  /* Receipt-card grid: 1 → 2 → 3 columns as space allows (D3). Each card is a
     mini receipt: stamped status edge + verdict wash keyed by verification, so
     trust is readable at grid density (icon+word+colour via .wcb-badge). */
  .cards {
    list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-xs);
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
  }
  .card {
    border: 1px solid var(--edge); border-inline-start-width: 4px;
    border-radius: var(--radius); padding: var(--space-xs) var(--space-sm);
    background: var(--surface);
    display: flex; flex-direction: column;
  }
  .card--verified { border-inline-start-color: var(--ok-edge); background: var(--verdict-ok-bg); }
  .card--under_review { border-inline-start-color: var(--warn-edge); background: var(--verdict-warn-bg); }
  .card--blocked { border-inline-start-color: var(--danger-edge); background: var(--verdict-danger-bg); }
  .card-top { display: flex; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; align-items: baseline; }
  .card-name { font-weight: 700; font-size: 1.02rem; overflow-wrap: anywhere; }
  .card-desc { margin: var(--space-3xs) 0; color: var(--ink); font-size: var(--step-0); flex: 1; }
  .card-meta { color: var(--ink-soft); font-size: var(--step--1); }
  .card-build {
    margin-top: 0.6rem; font: inherit; font-size: 0.82rem; cursor: pointer;
    padding: 0.25rem 0.6rem; border-radius: 0.4rem; align-self: flex-start;
    border: 1px solid var(--control-edge); background: var(--surface-2); color: var(--ink);
  }
  .card-build:hover { border-color: var(--structure); }
  .card-build.on { border-color: var(--structure); color: var(--structure); font-weight: var(--weight-bold); }
  .card-build:focus-visible { outline: var(--focus-width) solid var(--ring); outline-offset: var(--focus-offset); }

  /* Sticky "build tray" — stays in view as the builder scrolls, so they always know
     what's staged and have a one-click, oriented way into the Build Studio. */
  .build-tray {
    position: sticky; bottom: 0.6rem; z-index: 5;
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.9rem;
    margin-top: 1rem; padding: 0.7rem 1rem;
    background: var(--bg); color: var(--ink);
    border: 1px solid var(--structure); border-radius: var(--radius);
    box-shadow: var(--shadow-1); /* the one sanctioned shadow (tokens.css) */
  }
  .build-tray__count { font-size: 0.92rem; }
  .build-tray__count strong { color: var(--structure); }
  .build-tray__hint { flex: 1 1 16rem; font-size: var(--step--1); color: var(--ink-soft); }
  .build-tray__cta {
    font-weight: 700; white-space: nowrap; text-decoration: none;
    color: var(--structure);
    padding: var(--space-3xs) var(--space-xs); border-radius: var(--radius); border: 1px solid var(--structure);
  }
  .build-tray__cta:hover { background: color-mix(in srgb, var(--structure) 14%, transparent); }
  .build-tray__cta:focus-visible { outline: var(--focus-width) solid var(--ring); outline-offset: var(--focus-offset); }
  .badges { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  /* Skeleton loading grid — same geometry as the receipt-card grid so the LCP
     element doesn't shift when /catalog.json lands. */
  .cards--skeleton { display: grid; gap: var(--space-xs); grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); }
  .card--skeleton { border: 1px solid var(--edge); border-radius: var(--radius); padding: var(--space-sm); background: var(--surface); }
  .sk-line { block-size: 0.8em; border-radius: var(--radius-sm); background: var(--surface-2); margin-block: var(--space-3xs); animation: sk-pulse 1.4s var(--ease-in-out) infinite; }
  .sk-line--title { block-size: 1.1em; inline-size: 55%; }
  .sk-line--short { inline-size: 40%; }
  @keyframes sk-pulse { 50% { opacity: 0.5; } }
  @media (prefers-reduced-motion: reduce) { .sk-line { animation: none; } }
  .more { margin-top: var(--space-sm); padding: var(--space-2xs) var(--space-sm); border-radius: var(--radius); border: 1px solid var(--control-edge); background: var(--surface-2); color: var(--ink); cursor: pointer; }
  /* Touch targets. */
  .search input, .sort select, .more { min-block-size: 2.75rem; }
  .opt { min-block-size: 1.75rem; }
</style>
