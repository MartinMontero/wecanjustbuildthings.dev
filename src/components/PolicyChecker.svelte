<script lang="ts">
  import { onMount } from 'svelte';
  import { matchDependency } from '../../enforcement/matcher.ts';
  import type { ExcludedOrg, Ecosystem } from '../../enforcement/types.ts';
  import { parseDependencyInput } from '../lib/policy-input.ts';

  let orgs = $state<ExcludedOrg[]>([]);
  let policyReady = $state(false);
  let input = $state('');
  let ecosystem = $state<Ecosystem>('js');
  let checked = $state(false);
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
      policyReady = true;
    } catch {
      policyReady = false;
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
    <span>Paste a <code>package.json</code>, or one dependency per line (<code>name</code> or <code>name ecosystem</code>)</span>
    <textarea bind:value={input} rows="7" placeholder={'openai\nnostr-tools\n@atproto/api\ngithub.com/openai/openai-go go'}></textarea>
  </label>
  <div class="controls">
    <label>Default ecosystem
      <select bind:value={ecosystem}>
        {#each ['js','rust','py','go','elixir','dart','ruby','kotlin','other'] as e}<option value={e}>{e}</option>{/each}
      </select>
    </label>
    <label class="cb"><input type="checkbox" bind:checked={lookupLicenses} /> look up licenses</label>
    <button class="primary" onclick={run} disabled={!policyReady}>{policyReady ? 'Check against the policy' : 'Loading policy…'}</button>
  </div>

  {#if checked}
    <div class="summary" class:bad={blockedCount > 0}>
      {#if blockedCount === 0}
        ✓ All {rows.length} dependencies are clean — none owned by Meta, OpenAI, or xAI.
      {:else}
        ✗ {blockedCount} of {rows.length} would be <strong>blocked</strong> by the exclusion policy.
      {/if}
    </div>
    <table>
      <thead><tr><th>Dependency</th><th>Eco</th><th>Policy</th><th>License</th></tr></thead>
      <tbody>
        {#each rows as r}
          <tr class={r.status}>
            <td>{r.name}</td>
            <td>{r.ecosystem}</td>
            <td>
              {#if r.status === 'blocked'}<span class="tag bad">blocked → {r.org}</span>
              {:else}<span class="tag ok">clean</span>{/if}
            </td>
            <td>{r.licenseState === 'pending' ? '…' : (r.license ?? '—')}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="note">The policy check runs entirely in your browser against the same
      list the CI engine uses. License lookups use the live edge API when available.
      This screens direct names by ownership; the full engine also walks the
      transitive tree and scans source — run <code>npx tsx enforcement/cli.ts all --tree .</code> on a real project.</p>
  {/if}
</div>

<style>
  .checker { margin: 1rem 0 2rem; display: flex; flex-direction: column; gap: 0.9rem; }
  .field { display: flex; flex-direction: column; gap: 0.4rem; }
  textarea, select { padding: 0.55rem 0.7rem; border: 1px solid var(--sl-color-gray-5); border-radius: 0.5rem; background: var(--sl-color-black); color: var(--sl-color-white); font: inherit; font-size: max(16px, 1rem); }
  textarea { font-family: var(--sl-font-mono); }
  .controls { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
  .controls label { display: flex; gap: 0.4rem; align-items: center; color: var(--sl-color-text); font-size: 0.9rem; }
  .cb { cursor: pointer; }
  .primary { padding: 0.55rem 1.1rem; border-radius: 0.5rem; border: 1px solid var(--sl-color-accent); background: var(--sl-color-accent); color: var(--on-structure); cursor: pointer; font-weight: 700; }
  .summary { padding: 0.7rem 0.9rem; border-radius: 0.5rem; border: 1px solid var(--ok-edge); color: var(--sl-color-text); background: var(--sl-color-gray-6); }
  .summary.bad { border-color: var(--danger-edge); }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: start; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--sl-color-gray-6); }
  tr.blocked { background: color-mix(in srgb, var(--danger-edge) 8%, transparent); }
  .tag { font-size: 0.78rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 999px; border-inline-start: 4px solid; }
  .tag.ok { border-color: var(--ok-edge); }
  .tag.bad { border-color: var(--danger-edge); }
  .note { color: var(--sl-color-gray-2); font-size: 0.82rem; }
  /* Touch targets. */
  .primary, select { min-block-size: 2.75rem; }
</style>
