<script lang="ts">
  import { onMount } from 'svelte';

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

  function matches(it: IndexedItem, opts: { skip?: string } = {}): boolean {
    const text = q.trim().toLowerCase();
    if (text && !it._hay.includes(text)) return false;
    if (opts.skip !== 'kind' && selKind.size && !selKind.has(it.kind)) return false;
    if (opts.skip !== 'protocol' && selProtocol.size && !it.protocols.some((p) => selProtocol.has(p))) return false;
    if (opts.skip !== 'ecosystem' && selEcosystem.size && !selEcosystem.has(it.ecosystem)) return false;
    if (opts.skip !== 'category' && selCategory.size && !selCategory.has(it.category)) return false;
    if (opts.skip !== 'verification' && selVerification.size && !selVerification.has(it.verification)) return false;
    return true;
  }

  const filtered = $derived(
    items
      .filter((it) => matches(it))
      .sort((a, b) => (sort === 'uses' ? b.uses - a.uses || a.name.localeCompare(b.name) : a.name.localeCompare(b.name))),
  );

  function facet(dim: 'kind' | 'protocol' | 'ecosystem' | 'category' | 'verification', get: (it: Item) => string[]) {
    const counts = new Map<string, number>();
    for (const it of items) {
      if (!matches(it, { skip: dim })) continue;
      for (const v of get(it)) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

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
    <span><strong>New here? Don’t browse — let the Build Studio choose for you.</strong> Tell it what you
    want to build in a sentence, and it picks the few tools you need and shows how they fit together.</span>
    <span class="cat-cta-go">Open the Build Studio →</span>
  </a>
  <div class="cat-intro">
    <p>
      Think of this as a vetted shelf of <strong>building blocks</strong> — ready-made tools,
      libraries, and services your project (and your AI agent) can use instead of building from
      scratch. Every entry here has already been checked two ways: nothing owned by Meta, OpenAI,
      or xAI gets in, and each one’s license was confirmed. Search by what it does, or use the
      filters to narrow things down. Not sure what something is? Open it — each page explains it in
      plain terms.
    </p>
    <ul class="cat-legend">
      <li><span class="badge badge--verified">verified</span> license confirmed at a specific version</li>
      <li><span class="badge badge--under_review">under review</span> looks right, not yet fully confirmed</li>
      <li><span class="badge badge--active">active</span> recently kept up to date</li>
      <li><span class="badge badge--advisory">origin</span> made by an excluded company but safe &amp; freely licensed — your call</li>
    </ul>
  </div>
  <div class="toolbar">
    <label class="search">
      <span class="sr-only">Search the catalog</span>
      <input
        type="search"
        placeholder="Search {items.length || ''} tools by name or what they do…"
        bind:value={q}
        oninput={() => (limit = 60)}
      />
    </label>
    <label class="sort">
      Sort
      <select bind:value={sort}>
        <option value="uses">Most used</option>
        <option value="name">A–Z</option>
      </select>
    </label>
  </div>

  {#if loading}
    <p class="status">Loading the catalog…</p>
  {:else if failed}
    <p class="status">Couldn’t load the catalog. Try refreshing the page.</p>
  {:else}
    <div class="layout">
      <aside class="facets" aria-label="Filters">
        <div class="facets-head">
          <strong>{filtered.length}</strong> of {items.length}
          {#if activeCount}<button class="link" onclick={clearAll}>Clear all ({activeCount})</button>{/if}
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

        {@render group('Type', kindFacet, selKind, (s) => (selKind = s))}
        {@render group('Network', protocolFacet, selProtocol, (s) => (selProtocol = s))}
        {@render group('Language / platform', ecosystemFacet, selEcosystem, (s) => (selEcosystem = s))}
        {@render group('How thoroughly checked', verificationFacet, selVerification, (s) => (selVerification = s))}
        {@render group('Category', categoryFacet, selCategory, (s) => (selCategory = s))}
      </aside>

      <div class="results">
        {#if filtered.length === 0}
          <p class="status">No tools match these filters. <button class="link" onclick={clearAll}>Clear all</button></p>
        {/if}
        <ul class="cards">
          {#each filtered.slice(0, limit) as it (it.url)}
            <li class="card">
              <div class="card-top">
                <a class="card-name" href={it.url}>{it.name}</a>
                <span class="badges">
                  <span class="badge badge--{it.verification}">{it.verification.replace('_', ' ')}</span>
                  <span class="badge badge--{it.maintenance}">{it.maintenance}</span>
                  {#if it.advisory}<span class="badge badge--advisory">{it.advisory}-origin</span>{/if}
                </span>
              </div>
              <p class="card-desc">{it.desc}</p>
              <div class="card-meta">
                <span>{it.ecosystem}</span> · <span>{it.license}</span> · <span>{it.category}</span>
                {#if it.uses > 0}· <span>used in {it.uses} audited project{it.uses === 1 ? '' : 's'}</span>{/if}
              </div>
            </li>
          {/each}
        </ul>
        {#if filtered.length > limit}
          <button class="more" onclick={() => (limit += 60)}>Show more ({filtered.length - limit} remaining)</button>
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
  .badges { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .badge { font-size: 0.72rem; font-weight: 600; padding: 0.18rem 0.45rem; border-radius: 999px; border: 1px solid var(--sl-color-gray-5); border-left-width: 4px; background: var(--sl-color-gray-6); color: var(--sl-color-text); }
  .badge--verified, .badge--active { border-left-color: #2da44e; }
  .badge--under_review, .badge--minimal { border-left-color: #bf8700; }
  .badge--blocked, .badge--abandoned { border-left-color: #cf222e; }
  .badge--dormant, .badge--advisory { border-left-color: #bc4c00; }
  .more { margin-top: 1rem; padding: 0.5rem 1rem; border-radius: 0.5rem; border: 1px solid var(--sl-color-gray-5); background: var(--sl-color-gray-6); color: var(--sl-color-text); cursor: pointer; }
</style>
