<script lang="ts">
  import { onMount } from 'svelte';
  import { hasSession, loadSession } from '../../../lib/build-session.ts';
  import {
    deriveUsageFromSession, missingUsageFields, applyOverride,
    writeUsageToSession, writeEstimateToSession,
  } from '../core/usage-profile.ts';
  import { estimate } from '../core/estimator.ts';
  import { allUnconfirmed } from '../../../lib/provenance.ts';
  import { ALL_ADAPTERS } from '../adapters/index.ts';
  import type { CostEstimate, ComputePosture, EstimateDataSource, TierId, UsageProfile } from '../core/types.ts';
  import { STRINGS, normalizeLang, type Lang } from './i18n.ts';

  let { lang: initialLang = 'en' }: { lang?: string } = $props();

  let lang = $state<Lang>(normalizeLang(initialLang));
  const t = $derived(STRINGS[lang]);
  const dir = $derived<'rtl' | 'ltr'>(lang === 'ar' ? 'rtl' : 'ltr');
  const buildHref = $derived(lang === 'en' ? '/build/' : `/${lang}/build/`);

  let ready = $state(false);
  let started = $state(false); // is there a build session to read from?
  let usage = $state<UsageProfile | null>(null);
  let dataSource = $state<EstimateDataSource>('pathC-client');
  let result = $state<CostEstimate | null>(null);
  let computing = $state(false);
  let saved = $state(false);
  let usedFallback = $state(false);

  const missing = $derived(usage ? missingUsageFields(usage) : []);

  onMount(() => {
    lang = normalizeLang(document.documentElement.lang || initialLang);
    started = hasSession();
    if (started) {
      const s = loadSession();
      usage = deriveUsageFromSession(s);
      if (s.costEstimate) result = s.costEstimate;
    }
    ready = true;
  });

  // ---- locale-aware formatting (currency symbol, grouping, digit shaping) ----
  // Null amounts never reach here: the template renders the D8 provenance chip
  // for unconfirmed figures instead of any placeholder text.
  function money(amount: number, currency: string): string {
    return new Intl.NumberFormat(lang, { style: 'currency', currency }).format(amount);
  }
  function num(n: number): string {
    return new Intl.NumberFormat(lang).format(n);
  }

  // ---- overrides write straight back into the shared session ----
  function setNumber(field: 'monthlyActiveUsers' | 'bandwidthGB' | 'storageGB', e: Event) {
    if (!usage) return;
    const raw = (e.target as HTMLInputElement).value.trim();
    const n = raw === '' ? null : Number(raw);
    if (n == null || !Number.isFinite(n) || n < 0) return;
    usage = applyOverride(usage, field, n);
    writeUsageToSession(usage);
  }
  function setCompute(e: Event) {
    if (!usage) return;
    usage = applyOverride(usage, 'compute', (e.target as HTMLSelectElement).value as ComputePosture);
    writeUsageToSession(usage);
  }
  function setDbNeeded(needed: boolean) {
    if (!usage) return;
    usage = applyOverride(usage, 'database', { needed, sizeGB: needed ? (usage.database?.sizeGB ?? null) : null });
    writeUsageToSession(usage);
  }
  function setDbSize(e: Event) {
    if (!usage) return;
    const raw = (e.target as HTMLInputElement).value.trim();
    const n = raw === '' ? null : Number(raw);
    if (n != null && (!Number.isFinite(n) || n < 0)) return;
    usage = applyOverride(usage, 'database', { needed: true, sizeGB: n });
    writeUsageToSession(usage);
  }

  function tierLabel(id: TierId): string {
    return id === 'seed' ? t.tierSeed : id === 'growth' ? t.tierGrowth : t.tierScale;
  }
  async function run() {
    if (!usage) return;
    computing = true;
    saved = false;
    usedFallback = false;
    try {
      let est: CostEstimate | null = null;
      const fetcher = (u: string, init?: RequestInit) => fetch(u, init);
      if (dataSource === 'pathA-function') {
        try {
          const res = await fetch('/api/pricing', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ usage }),
          });
          if (res.ok) est = (await res.json()) as CostEstimate;
        } catch {
          /* server path unavailable — fall back to the browser below */
        }
        if (!est) {
          usedFallback = true;
          est = await estimate({ usage, adapters: ALL_ADAPTERS, fetcher, dataSource: 'pathC-client' });
        }
      } else {
        est = await estimate({ usage, adapters: ALL_ADAPTERS, fetcher, dataSource: 'pathC-client' });
      }
      result = est;
      writeEstimateToSession(est); // single source of truth — no parallel store
      saved = true;
    } finally {
      computing = false;
    }
  }
</script>

<!-- D8 provenance chip: an unconfirmed registry figure is surfaced as an
     honesty statement (icon + word + pending-style dashed edge — readable in
     grayscale, never colour alone), never as a work note. -->
{#snippet provChip()}
  <span class="prov-chip"><svg class="prov-chip__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.8V12l2.6 2.6" /></svg>{t.unverifiedChip}</span>
{/snippet}

<div class="ce" {dir}>
  {#if !ready}
    <p class="muted">…</p>
  {:else if !started}
    <p class="muted">{t.noSession}</p>
    <a class="cta" href={buildHref}>{t.noSessionCta}</a>
  {:else if usage}
    <!-- Title + intro come from the page (frontmatter H1 + mdx intro) — no duplicate here. -->
    <fieldset class="source">
      <legend>{t.sourceHeading}</legend>
      <label class:active={dataSource === 'pathC-client'}>
        <input type="radio" name="src" value="pathC-client" checked={dataSource === 'pathC-client'} onchange={() => (dataSource = 'pathC-client')} />
        <span><strong>{t.pathC}</strong><small>{t.pathCDesc}</small></span>
      </label>
      <label class:active={dataSource === 'pathA-function'}>
        <input type="radio" name="src" value="pathA-function" checked={dataSource === 'pathA-function'} onchange={() => (dataSource = 'pathA-function')} />
        <span><strong>{t.pathA}</strong><small>{t.pathADesc}</small></span>
      </label>
    </fieldset>

    <fieldset class="inputs">
      <legend>{t.missingHeading}</legend>
      <p class="muted small">{t.missingNote}</p>
      <div class="grid">
        <label class:need={missing.includes('monthlyActiveUsers')}>
          <span>{t.fMau}</span>
          <input type="number" min="0" inputmode="numeric" value={usage.monthlyActiveUsers ?? ''} oninput={(e) => setNumber('monthlyActiveUsers', e)} />
        </label>
        <label class:need={missing.includes('bandwidthGB')}>
          <span>{t.fBandwidth}</span>
          <input type="number" min="0" inputmode="numeric" value={usage.bandwidthGB ?? ''} oninput={(e) => setNumber('bandwidthGB', e)} />
        </label>
        <label class:need={missing.includes('storageGB')}>
          <span>{t.fStorage}</span>
          <input type="number" min="0" inputmode="numeric" value={usage.storageGB ?? ''} oninput={(e) => setNumber('storageGB', e)} />
        </label>
        <label>
          <span>{t.fCompute} <em class="derived">· {t.derivedHeading}</em></span>
          <select value={usage.compute ?? 'serverless'} onchange={setCompute}>
            <option value="edge">{t.computeEdge}</option>
            <option value="serverless">{t.computeServerless}</option>
            <option value="always-on">{t.computeAlwaysOn}</option>
          </select>
        </label>
        <label>
          <span>{t.fDbNeeded} <em class="derived">· {t.derivedHeading}</em></span>
          <span class="seg">
            <button type="button" class:on={usage.database?.needed} onclick={() => setDbNeeded(true)}>{t.yes}</button>
            <button type="button" class:on={!usage.database?.needed} onclick={() => setDbNeeded(false)}>{t.no}</button>
          </span>
        </label>
        {#if usage.database?.needed}
          <label class:need={missing.includes('database')}>
            <span>{t.fDbSize}</span>
            <input type="number" min="0" inputmode="numeric" value={usage.database?.sizeGB ?? ''} oninput={setDbSize} />
          </label>
        {/if}
      </div>
    </fieldset>

    <button class="go" onclick={run} disabled={computing}>
      {computing ? t.computing : result ? t.recomputeBtn : t.computeBtn}
    </button>
    {#if saved}<span class="ok">✓ {t.savedNote}{usedFallback ? ` ${t.corsNote}` : ''}</span>{/if}

    {#if result}
      <h3 class="rh">{t.resultsHeading}</h3>
      <p class="tiers-caveat small muted">{t.tiersCaveat}</p>
      <div class="tiers">
        {#each result.tiers as tier (tier.tierId)}
          <section class="tier">
            <h4>{tierLabel(tier.tierId)}</h4>
            <p class="ru muted small">
              {num(tier.resolvedUsage.monthlyActiveUsers)} MAU · {num(tier.resolvedUsage.bandwidthGB)} GB · {num(tier.resolvedUsage.storageGB)} GB
            </p>
            {#each tier.quotes as q (q.providerId)}
              <div class="prov">
                <div class="phead">
                  <strong>{q.providerName}</strong>
                  <span class="total">
                    {#if allUnconfirmed(q.lineItems.map((li) => li.amount))}
                      {@render provChip()}
                    {:else}
                      {money(q.confirmedTotal, q.currency)} <small>{t.perMonth}</small>
                      {#if q.hasUnconfirmed}<em class="partial">· {t.partialTotal}</em>{/if}
                    {/if}
                  </span>
                </div>
                <p class="pmeta small">
                  <span class="badge">{q.source === 'live' ? t.provenanceLive : t.provenanceSnapshot}</span>
                  · {#if q.lastVerified}{t.lastVerified} {q.lastVerified}{:else}{@render provChip()}{/if}
                  · <a href={q.sourceUrl} target="_blank" rel="noopener noreferrer">{t.source}</a>
                </p>
                <table class="lines">
                  <tbody>
                    {#each q.lineItems as li (li.label)}
                      <tr>
                        <td>{li.label}</td>
                        <td class="q">{num(li.quantity)} {li.unit}</td>
                        <td class="a">{#if li.amount == null}{@render provChip()}{:else}{money(li.amount, q.currency)}{/if}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/each}
          </section>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  /* RTL-aware: layout uses logical properties so it mirrors, not just flips text.
     Tokenized (M4/D4): every colour/space/radius comes from the wcb tokens —
     no Starlight vars, no raw hex, no off-scale values beyond the 4px sub-grid. */
  .ce { display: flex; flex-direction: column; gap: var(--space-sm); }
  .muted { color: var(--ink-soft); }
  .small { font-size: var(--step--1); }
  .lead { margin: 0; }
  fieldset { border: 1px solid var(--edge); border-radius: var(--radius); padding-inline: var(--space-sm); padding-block: var(--space-2xs) var(--space-sm); }
  legend { font-weight: var(--weight-bold); padding-inline: var(--space-2xs); }
  .source label { display: flex; gap: var(--space-2xs); align-items: start; padding-block: var(--space-3xs); cursor: pointer; }
  .source label span { display: flex; flex-direction: column; }
  .source label small { color: var(--ink-soft); }
  .source label.active strong { color: var(--structure); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: var(--space-xs); }
  .grid label { display: flex; flex-direction: column; gap: var(--space-3xs); font-size: var(--step--1); }
  .grid label.need span::after { content: ' *'; color: var(--structure); }
  .grid em.derived { color: var(--ink-soft); font-style: normal; font-size: var(--step--1); }
  input, select { padding: var(--space-2xs) var(--space-xs); border: 1px solid var(--control-edge); border-radius: var(--radius); background: var(--surface); color: inherit; font-size: max(16px, 1rem); }
  .seg { display: inline-flex; gap: 0; }
  .seg button { padding: var(--space-2xs) var(--space-xs); border: 1px solid var(--control-edge); background: transparent; color: inherit; cursor: pointer; }
  .seg button:first-child { border-start-start-radius: var(--radius); border-end-start-radius: var(--radius); }
  .seg button:last-child { border-start-end-radius: var(--radius); border-end-end-radius: var(--radius); }
  .seg button.on { background: color-mix(in srgb, var(--structure) 18%, transparent); border-color: var(--structure); }
  .go { align-self: start; padding: var(--space-2xs) var(--space-md); border: 0; border-radius: var(--radius); background: var(--structure); color: var(--on-structure); font-weight: var(--weight-bold); cursor: pointer; }
  .go:disabled { opacity: 0.6; cursor: default; }
  .cta { font-weight: var(--weight-bold); }
  .ok { color: var(--ok-text); font-size: var(--step--1); }
  .rh { margin-block-end: 0; }
  .tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: var(--space-sm); }
  .tier { border: 1px solid var(--edge); border-radius: var(--radius); padding: var(--space-xs) var(--space-sm); }
  .tier h4 { margin: 0; }
  .ru { margin-block: var(--space-3xs) var(--space-xs); }
  .prov { border-block-start: 1px solid var(--edge); padding-block: var(--space-2xs); }
  .phead { display: flex; justify-content: space-between; gap: var(--space-2xs); align-items: baseline; flex-wrap: wrap; }
  .total { text-align: end; }
  .partial { color: var(--ink-soft); font-style: normal; font-size: var(--step--1); }
  .badge { border: 1px solid var(--edge); border-radius: var(--radius-sm); padding: 0 var(--space-3xs); }
  /* D8 provenance chip — pending language: dashed control edge + soft ink +
     mono, with the clock icon carrying the state alongside the word. */
  .prov-chip {
    display: inline-flex; align-items: center; gap: var(--space-3xs);
    font-family: var(--font-mono); font-size: var(--step--1); line-height: 1.4;
    padding: 0 var(--space-2xs); border: 1px dashed var(--control-edge);
    border-radius: var(--radius-pill); color: var(--ink-soft); white-space: normal;
  }
  .prov-chip__icon { inline-size: 0.9em; block-size: 0.9em; flex: 0 0 auto; }
  .pmeta { color: var(--ink-soft); margin-block: var(--space-3xs); }
  .lines { width: 100%; border-collapse: collapse; font-size: var(--step--1); }
  .lines td { padding: 0.15rem 0; text-align: start; }
  .lines td.q { color: var(--ink-soft); text-align: end; white-space: nowrap; padding-inline-start: var(--space-2xs); }
  .lines td.a { text-align: end; padding-inline-start: var(--space-2xs); }
  /* Touch targets. */
  .go, .seg button, input, select { min-block-size: 2.75rem; }
</style>
