<script lang="ts">
  import { onMount } from 'svelte';
  import { MODELS } from '../registry/models.ts';
  import { sortBySovereignty } from '../core/sort.ts';
  import type { ModelEntry, Tier } from '../core/types.ts';
  import { STRINGS, normalizeLang, type Lang } from './i18n.ts';

  let { lang: initialLang = 'en' }: { lang?: string } = $props();

  let lang = $state<Lang>(normalizeLang(initialLang));
  const t = $derived(STRINGS[lang]);
  const dir = $derived<'rtl' | 'ltr'>(lang === 'ar' ? 'rtl' : 'ltr');

  // Filters
  let selfHostOnly = $state(false);
  let noUsJurisdiction = $state(false);
  let tierFilter = $state<'all' | Tier>('all');

  onMount(() => {
    lang = normalizeLang(document.documentElement.lang || initialLang);
  });

  const sorted = $derived(sortBySovereignty(MODELS));
  const rows = $derived(
    sorted.filter((m) => {
      if (selfHostOnly && !m.selfHostable) return false;
      // "No US jurisdiction" keeps self-hostable options (no third-party processing)
      // and anything not processed under US law by default.
      if (noUsJurisdiction && !m.selfHostable && m.jurisdiction.includes('United States')) return false;
      if (tierFilter !== 'all' && m.tier !== tierFilter) return false;
      return true;
    }),
  );

  function num(n: number): string {
    return new Intl.NumberFormat(lang).format(n);
  }
  function tierLabel(tier: Tier): string {
    return {
      frontier: t.tierFrontier, execution: t.tierExecution, both: t.tierBoth,
      runtime: t.tierRuntime, harness: t.tierHarness,
    }[tier];
  }
  function cautionLabel(level: ModelEntry['caution']['level']): string {
    return { none: t.cautionNone, advisory: t.cautionAdvisory, warning: t.cautionWarning }[level];
  }
  function contextText(m: ModelEntry): string {
    return m.contextWindow == null ? t.todoConfirm : `${num(m.contextWindow)}`;
  }
  function costText(m: ModelEntry): string {
    if (m.costPerMTok == null) return t.selfHostedCompute;
    const { input, output } = m.costPerMTok;
    if (input == null || output == null) return t.todoConfirm;
    return `$${num(input)} / $${num(output)}`;
  }
  function licenseText(m: ModelEntry): string {
    return m.licenseSpdx ?? t.proprietary;
  }
  function benchText(m: ModelEntry): string {
    if (!m.codingBenchmark) return '—';
    const { name, score } = m.codingBenchmark;
    return score == null ? `${name}: ${t.todoConfirm}` : `${name}: ${num(score)}%`;
  }
</script>

<section class="mc" {dir} aria-label={t.title}>
  <header class="mc__head">
    <h2 class="mc__title">{t.title}</h2>
    <p class="mc__lead">{t.lead}</p>
    <p class="mc__note">{t.sovereigntyNote}</p>
  </header>

  <fieldset class="mc__filters">
    <legend>{t.filterHeading}</legend>
    <label><input type="checkbox" bind:checked={selfHostOnly} /> {t.filterSelfHostOnly}</label>
    <label><input type="checkbox" bind:checked={noUsJurisdiction} /> {t.filterNoUsJurisdiction}</label>
    <label class="mc__tier">
      {t.colTier}:
      <select bind:value={tierFilter}>
        <option value="all">{t.filterAllTiers}</option>
        <option value="frontier">{t.tierFrontier}</option>
        <option value="execution">{t.tierExecution}</option>
        <option value="both">{t.tierBoth}</option>
        <option value="runtime">{t.tierRuntime}</option>
        <option value="harness">{t.tierHarness}</option>
      </select>
    </label>
  </fieldset>

  <ul class="mc__list">
    {#each rows as m (m.id)}
      <li class="mc__card mc__card--{m.caution.level}">
        <div class="mc__cardhead">
          <a class="mc__name" href={m.sourceUrl} target="_blank" rel="noopener">{m.displayName}</a>
          <span class="mc__badge mc__badge--{m.caution.level}">{cautionLabel(m.caution.level)}</span>
        </div>
        <dl class="mc__meta">
          <div><dt>{t.colDeveloper}</dt><dd>{m.developer}</dd></div>
          <div><dt>{t.colJurisdiction}</dt><dd>{m.jurisdiction}</dd></div>
          <div><dt>{t.colTier}</dt><dd>{tierLabel(m.tier)}</dd></div>
          <div><dt>{t.colLicense}</dt><dd>{licenseText(m)}</dd></div>
          <div><dt>{t.colSelfHost}</dt><dd>{m.selfHostable ? t.yes : t.no}</dd></div>
          <div><dt>{t.colContext}</dt><dd>{contextText(m)}</dd></div>
          <div><dt>{t.colCost}</dt><dd>{costText(m)}</dd></div>
          <div><dt>{t.colBenchmark}</dt><dd>{benchText(m)}{#if m.codingBenchmark?.vendorReported && m.codingBenchmark?.score != null}<span class="mc__hint"> ({t.vendorReported})</span>{/if}</dd></div>
        </dl>
        {#if m.caution.level !== 'none'}
          <div class="mc__caution">
            <p><strong>{t.reason}:</strong> {m.caution.reason}</p>
            <p><strong>{t.mitigation}:</strong> {m.caution.mitigation}</p>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .mc { margin-block: 1.5rem; }
  .mc__title { margin: 0 0 0.25rem; }
  .mc__lead { margin: 0 0 0.5rem; }
  .mc__note { font-size: 0.9rem; opacity: 0.85; margin: 0 0 1rem; }
  .mc__filters {
    display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; align-items: center;
    border: 1px solid var(--sl-color-gray-5, #888); border-radius: 0.5rem;
    padding: 0.6rem 0.9rem; margin-block-end: 1rem;
  }
  .mc__filters legend { padding-inline: 0.4rem; font-weight: 600; }
  .mc__filters label { display: inline-flex; align-items: center; gap: 0.35rem; min-inline-size: 0; }
  /* The tier <select> sized to its widest <option> and would not shrink, forcing
     the whole page wider than the viewport (worst in ES, where labels are longer).
     Let the control take a flexible row and cap the select to its container. */
  .mc__tier { flex: 1 1 16rem; min-inline-size: 0; }
  .mc__filters select { flex: 1 1 auto; min-inline-size: 0; max-inline-size: 100%; font-size: max(16px, 1rem); }
  .mc__list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.9rem; }
  .mc__card {
    border: 1px solid var(--sl-color-gray-5, #888); border-inline-start-width: 4px;
    border-radius: 0.5rem; padding: 0.85rem 1rem;
  }
  .mc__card--warning { border-inline-start-color: var(--sl-color-red, #d33); }
  .mc__card--advisory { border-inline-start-color: var(--sl-color-orange, #e80); }
  .mc__card--none { border-inline-start-color: var(--sl-color-green, #2a2); }
  .mc__cardhead { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; justify-content: space-between; }
  .mc__name { font-weight: 700; font-size: 1.05rem; }
  .mc__badge { font-size: 0.78rem; font-weight: 600; padding: 0.1rem 0.5rem; border-radius: 999px; white-space: nowrap; }
  .mc__badge--warning { background: var(--sl-color-red-low, #fdd); color: var(--sl-color-red-high, #900); }
  .mc__badge--advisory { background: var(--sl-color-orange-low, #fe8); color: var(--sl-color-orange-high, #840); }
  .mc__badge--none { background: var(--sl-color-green-low, #cfc); color: var(--sl-color-green-high, #060); }
  .mc__meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.3rem 1rem; margin: 0.7rem 0 0; }
  .mc__meta div { display: flex; gap: 0.4rem; }
  .mc__meta dt { font-weight: 600; opacity: 0.8; margin: 0; }
  .mc__meta dd { margin: 0; }
  .mc__hint { opacity: 0.65; font-size: 0.85em; }
  .mc__caution { margin-top: 0.7rem; font-size: 0.9rem; }
  .mc__caution p { margin: 0.15rem 0; }
</style>
