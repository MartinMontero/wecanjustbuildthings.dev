<script lang="ts">
  import { onMount } from 'svelte';
  import { hasSession, loadSession } from '../../../lib/build-session.ts';
  import {
    deriveUsageFromSession, missingUsageFields, applyOverride,
    writeUsageToSession, writeEstimateToSession,
  } from '../core/usage-profile.ts';
  import { estimate } from '../core/estimator.ts';
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
  function money(amount: number | null, currency: string): string {
    if (amount == null) return t.todoConfirm;
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
  function allUnconfirmed(amounts: (number | null)[]): boolean {
    return amounts.every((a) => a === null);
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

<div class="ce" {dir}>
  {#if !ready}
    <p class="muted">…</p>
  {:else if !started}
    <p class="muted">{t.noSession}</p>
    <a class="cta" href={buildHref}>{t.noSessionCta}</a>
  {:else if usage}
    <h2>{t.title}</h2>
    <p class="lead">{t.lead}</p>

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
                      {t.todoConfirm}
                    {:else}
                      {money(q.confirmedTotal, q.currency)} <small>{t.perMonth}</small>
                      {#if q.hasUnconfirmed}<em class="partial">· {t.partialTotal}</em>{/if}
                    {/if}
                  </span>
                </div>
                <p class="pmeta small">
                  <span class="badge">{q.source === 'live' ? t.provenanceLive : t.provenanceSnapshot}</span>
                  · {q.lastVerified ? `${t.lastVerified} ${q.lastVerified}` : t.todoConfirm}
                  · <a href={q.sourceUrl} target="_blank" rel="noopener noreferrer">{t.source}</a>
                </p>
                <table class="lines">
                  <tbody>
                    {#each q.lineItems as li (li.label)}
                      <tr>
                        <td>{li.label}</td>
                        <td class="q">{num(li.quantity)} {li.unit}</td>
                        <td class="a">{li.amount == null ? t.todoConfirm : money(li.amount, q.currency)}</td>
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
  /* RTL-aware: layout uses logical properties so it mirrors, not just flips text. */
  .ce { display: flex; flex-direction: column; gap: 1rem; }
  .muted { color: var(--sl-color-gray-3); }
  .small { font-size: 0.85rem; }
  .lead { margin: 0; }
  fieldset { border: 1px solid var(--sl-color-gray-5); border-radius: 0.5rem; padding-inline: 1rem; padding-block: 0.5rem 1rem; }
  legend { font-weight: 600; padding-inline: 0.4rem; }
  .source label { display: flex; gap: 0.6rem; align-items: start; padding-block: 0.4rem; cursor: pointer; }
  .source label span { display: flex; flex-direction: column; }
  .source label small { color: var(--sl-color-gray-3); }
  .source label.active strong { color: var(--sl-color-text-accent); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 0.75rem; }
  .grid label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9rem; }
  .grid label.need span::after { content: ' *'; color: var(--sl-color-text-accent); }
  .grid em.derived { color: var(--sl-color-gray-3); font-style: normal; font-size: 0.8rem; }
  input, select { padding: 0.4rem 0.5rem; border: 1px solid var(--sl-color-gray-5); border-radius: 0.35rem; background: var(--sl-color-black); color: inherit; }
  .seg { display: inline-flex; gap: 0; }
  .seg button { padding: 0.4rem 0.8rem; border: 1px solid var(--sl-color-gray-5); background: transparent; color: inherit; cursor: pointer; }
  .seg button:first-child { border-start-start-radius: 0.35rem; border-end-start-radius: 0.35rem; }
  .seg button:last-child { border-start-end-radius: 0.35rem; border-end-end-radius: 0.35rem; }
  .seg button.on { background: var(--sl-color-accent-low); border-color: var(--sl-color-text-accent); }
  .go { align-self: start; padding: 0.6rem 1.2rem; border: 0; border-radius: 0.4rem; background: var(--sl-color-text-accent); color: var(--sl-color-black); font-weight: 600; cursor: pointer; }
  .go:disabled { opacity: 0.6; cursor: default; }
  .cta { font-weight: 600; }
  .ok { color: var(--sl-color-text-accent); font-size: 0.9rem; }
  .rh { margin-block-end: 0; }
  .tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 1rem; }
  .tier { border: 1px solid var(--sl-color-gray-5); border-radius: 0.5rem; padding: 0.75rem 1rem; }
  .tier h4 { margin: 0; }
  .ru { margin-block: 0.25rem 0.75rem; }
  .prov { border-block-start: 1px solid var(--sl-color-gray-6); padding-block: 0.6rem; }
  .phead { display: flex; justify-content: space-between; gap: 0.5rem; align-items: baseline; }
  .total { text-align: end; }
  .partial { color: var(--sl-color-gray-3); font-style: normal; font-size: 0.8rem; }
  .badge { border: 1px solid var(--sl-color-gray-5); border-radius: 0.25rem; padding: 0 0.35rem; }
  .pmeta { color: var(--sl-color-gray-3); margin-block: 0.3rem; }
  .lines { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .lines td { padding: 0.15rem 0; text-align: start; }
  .lines td.q { color: var(--sl-color-gray-3); text-align: end; white-space: nowrap; padding-inline-start: 0.5rem; }
  .lines td.a { text-align: end; white-space: nowrap; padding-inline-start: 0.5rem; }
</style>
