<script lang="ts">
  import { onMount } from 'svelte';
  import { MODELS } from '../registry/models.ts';
  import { needsProvenanceChip } from '../../../lib/provenance.ts';
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
  function licenseText(m: ModelEntry): string {
    return m.licenseSpdx ?? t.proprietary;
  }
</script>

<!-- D8 provenance chip: an unconfirmed registry figure (null context window,
     cost, or benchmark score) is surfaced as an honesty statement — icon +
     word + pending-style dashed edge — never as a work note. -->
{#snippet provChip()}
  <span class="prov-chip"><svg class="prov-chip__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.8V12l2.6 2.6" /></svg>{t.unverifiedChip}</span>
{/snippet}

<section class="mc" {dir} aria-label={t.title}>
  <header class="mc__head">
    <!-- Title + intro come from the page (frontmatter H1 + mdx intro); the island
         keeps only the functional sorting note so the heading isn't duplicated. -->
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
          <div><dt>{t.colContext}</dt><dd>{#if needsProvenanceChip(m.contextWindow)}{@render provChip()}{:else}{num(m.contextWindow!)}{/if}</dd></div>
          <div><dt>{t.colCost}</dt><dd>{#if m.costPerMTok == null}{t.selfHostedCompute}{:else if needsProvenanceChip(m.costPerMTok.input) || needsProvenanceChip(m.costPerMTok.output)}{@render provChip()}{:else}${num(m.costPerMTok.input!)} / ${num(m.costPerMTok.output!)}{/if}</dd></div>
          <div><dt>{t.colBenchmark}</dt><dd>{#if !m.codingBenchmark}—{:else}{m.codingBenchmark.name}: {#if needsProvenanceChip(m.codingBenchmark.score)}{@render provChip()}{:else}{num(m.codingBenchmark.score!)}%{#if m.codingBenchmark.vendorReported}<span class="mc__hint"> ({t.vendorReported})</span>{/if}{/if}{/if}</dd></div>
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
  /* Tokenized (M4/D4): the old Starlight colour vars were undefined in the wcb
     theme, so their raw-hex fallbacks (the red/orange/green ramp and its pale
     badge pairs) ALWAYS fired — light-mode colours rendered onto the dark
     theme, a core cause of the 89-node axe color-contrast finding on
     /build/models/. Status now comes from the verdict token system (wash +
     stamped edge + status text), icon + word + colour. */
  .mc { margin-block: var(--space-md); }
  .mc__title { margin: 0 0 var(--space-3xs); }
  .mc__lead { margin: 0 0 var(--space-2xs); }
  /* Dimming via opacity on text fails WCAG AA over the card background — use the
     contrast-rated soft-ink token instead (part of the 89-node finding). */
  .mc__note { font-size: var(--step--1); color: var(--ink-soft); margin: 0 0 var(--space-sm); }
  .mc__filters {
    display: flex; flex-wrap: wrap; gap: var(--space-xs) var(--space-md); align-items: center;
    border: 1px solid var(--edge); border-radius: var(--radius);
    padding: var(--space-2xs) var(--space-sm); margin-block-end: var(--space-sm);
    /* <fieldset> defaults to min-inline-size: min-content, which refuses to
       shrink below its widest child (the tier <select>) and dragged the page
       wider than the viewport. Override it so the box can fit a phone. */
    min-inline-size: 0;
  }
  .mc__filters legend { padding-inline: var(--space-2xs); font-weight: var(--weight-bold); }
  .mc__filters label { display: inline-flex; align-items: center; gap: var(--space-3xs); min-inline-size: 0; }
  /* The tier <select> sized to its widest <option> and would not shrink (worst in
     ES, longer labels). Give it its own full-width row and a zero flex-basis so
     it takes only the available space, capped to its container. */
  .mc__tier { flex: 1 1 100%; min-inline-size: 0; }
  .mc__filters select { flex: 1 1 0; min-inline-size: 0; max-inline-size: 100%; font-size: max(16px, 1rem); }
  .mc__list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-sm); }
  .mc__card {
    border: 1px solid var(--edge); border-inline-start-width: 4px;
    border-radius: var(--radius); padding: var(--space-xs) var(--space-sm);
  }
  .mc__card--warning { border-inline-start-color: var(--danger-edge); background: var(--verdict-danger-bg); }
  .mc__card--advisory { border-inline-start-color: var(--warn-edge); background: var(--verdict-warn-bg); }
  .mc__card--none { border-inline-start-color: var(--ok-edge); background: var(--verdict-ok-bg); }
  .mc__cardhead { display: flex; flex-wrap: wrap; gap: var(--space-2xs); align-items: baseline; justify-content: space-between; }
  .mc__name { font-weight: var(--weight-bold); font-size: var(--step-0); }
  /* Caution badge = status pill: word + stamped inline-start edge + verdict wash
     (grayscale-correct, WCAG 1.4.1) — same contract as the global .wcb-badge. */
  .mc__badge {
    font-size: var(--step--1); font-weight: var(--weight-bold);
    padding: 0.1rem var(--space-2xs); border-radius: var(--radius-pill); white-space: nowrap;
    border: 1px solid var(--edge); border-inline-start-width: 3px;
  }
  .mc__badge--warning { border-inline-start-color: var(--danger-edge); background: var(--verdict-danger-bg); color: var(--danger-text); }
  .mc__badge--advisory { border-inline-start-color: var(--warn-edge); background: var(--verdict-warn-bg); color: var(--warn-text); }
  .mc__badge--none { border-inline-start-color: var(--ok-edge); background: var(--verdict-ok-bg); color: var(--ok-text); }
  .mc__meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: var(--space-3xs) var(--space-sm); margin: var(--space-2xs) 0 0; }
  .mc__meta div { display: flex; gap: var(--space-3xs); }
  /* Labels differentiated by weight, NOT by dimming — `opacity` on text over the
     card background dropped the contrast below WCAG AA (axe: 89 cells). */
  .mc__meta dt { font-weight: var(--weight-bold); margin: 0; }
  .mc__meta dd { margin: 0; }
  .mc__hint { color: var(--ink-soft); font-size: var(--step--1); }
  /* D8 provenance chip — pending language: dashed control edge + soft ink +
     mono, with the clock icon carrying the state alongside the word. */
  .prov-chip {
    display: inline-flex; align-items: center; gap: var(--space-3xs);
    font-family: var(--font-mono); font-size: var(--step--1); line-height: 1.4;
    padding: 0 var(--space-2xs); border: 1px dashed var(--control-edge);
    border-radius: var(--radius-pill); color: var(--ink-soft); white-space: normal;
  }
  .prov-chip__icon { inline-size: 0.9em; block-size: 0.9em; flex: 0 0 auto; }
  .mc__caution { margin-top: var(--space-2xs); font-size: var(--step--1); }
  .mc__caution p { margin: var(--space-3xs) 0; }
  /* Touch target on the one select control. */
  .mc__filters select { min-block-size: 2.75rem; }
</style>
