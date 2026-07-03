<script lang="ts">
  /**
   * Admin console login island (/console/). Three ways in, all BYOK — the
   * platform never holds an admin's key or account:
   *   - NIP-07: a browser extension signs the NIP-98 login event in-page.
   *   - NIP-46: a remote bunker signs it over a relay WebSocket (this is why
   *     /console/* — and ONLY /console/* — gets `wss:` in connect-src; see
   *     src/lib/security-headers.ts). The bunker connection string is pasted
   *     here; an ephemeral client key is generated in-memory for the transport.
   *     NEVER an nsec/ncryptsec input — key-looking pastes are rejected.
   *   - Bluesky: reuse the ordinary site sign-in (header widget), then elevate;
   *     the server checks the session's proven DID against the allowlist.
   *
   * The server decides everything (allowlist, sessions, CSRF); this island only
   * collects signatures and renders state. All requests are same-origin.
   */
  import { onMount } from 'svelte';

  type Who = { identity: string; method: 'nostr' | 'bluesky'; csrf?: string };

  let checking = $state(true);
  let who = $state<Who | null>(null);
  let error = $state('');
  let notice = $state('');
  let busy = $state<'' | 'nip07' | 'nip46' | 'bluesky' | 'logout'>('');
  let bunkerInput = $state('');

  const enc = new TextEncoder();
  async function sha256Hex(s: string): Promise<string> {
    const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function base64(s: string): string {
    let bin = '';
    for (const b of enc.encode(s)) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  onMount(async () => {
    try {
      const res = await fetch('/api/admin/whoami', { headers: { accept: 'application/json' } });
      if (res.ok) who = (await res.json()) as Who;
    } catch { /* stay signed out */ }
    checking = false;
  });

  /** Build the unsigned NIP-98 login event, sign it with the given signer, and
   *  complete the challenge/verify round-trip. Shared by NIP-07 and NIP-46 —
   *  the server verifies the same signature either way (signer-agnostic). */
  async function loginWithSigner(signEvent: (tpl: {
    kind: number; created_at: number; content: string; tags: string[][];
  }) => Promise<unknown>): Promise<void> {
    const cRes = await fetch('/api/admin/login/nostr/challenge', { method: 'POST', headers: { accept: 'application/json' } });
    if (!cRes.ok) throw new Error('challenge');
    const challenge = (await cRes.json()).challenge as string;
    const body = JSON.stringify({ challenge });
    const template = {
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      content: '',
      tags: [
        ['u', `${location.origin}/api/admin/login/nostr/verify`],
        ['method', 'POST'],
        ['payload', await sha256Hex(body)],
      ],
    };
    const signed = await signEvent(template);
    const vRes = await fetch('/api/admin/login/nostr/verify', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', authorization: 'Nostr ' + base64(JSON.stringify(signed)) },
    });
    if (!vRes.ok) throw new Error('verify');
    who = (await vRes.json()) as Who;
  }

  async function loginNip07() {
    error = ''; notice = '';
    const nostr = (window as any).nostr;
    if (!nostr?.signEvent) {
      error = 'No NIP-07 extension found. Install one (e.g. nos2x or Alby), or use a bunker below.';
      return;
    }
    busy = 'nip07';
    try {
      await loginWithSigner((tpl) => nostr.signEvent(tpl));
    } catch {
      error = 'Sign-in didn’t complete. Only allowlisted admin keys are accepted.';
    } finally {
      busy = '';
    }
  }

  /** Anything that looks like key material is refused outright — this input is
   *  ONLY for a bunker connection string (bunker://…) or a NIP-05 name. */
  function looksLikeKeyMaterial(s: string): boolean {
    const t = s.trim().toLowerCase();
    return t.startsWith('nsec1') || t.startsWith('ncryptsec1') || /^[0-9a-f]{64}$/.test(t);
  }

  async function loginNip46() {
    error = ''; notice = '';
    const input = bunkerInput.trim();
    if (!input) { error = 'Paste your bunker:// connection string first.'; return; }
    if (looksLikeKeyMaterial(input)) {
      error = 'That looks like a KEY. Never paste a key here — or anywhere on this site. Paste the bunker:// connection string your signer app shows instead.';
      return;
    }
    busy = 'nip46';
    let signer: { signEvent(tpl: any): Promise<unknown>; close(): Promise<void> } | null = null;
    try {
      // Loaded on demand: the relay-pool code only ships to browsers that use a bunker.
      const [{ parseBunkerInput, BunkerSigner }, { generateSecretKey }] = await Promise.all([
        import('nostr-tools/nip46'),
        import('nostr-tools/pure'),
      ]);
      const pointer = await parseBunkerInput(input);
      if (!pointer) { error = 'That doesn’t parse as a bunker:// string or NIP-05 name.'; busy = ''; return; }
      notice = 'Connecting to your bunker — approve the request in your signer app…';
      // Ephemeral TRANSPORT key for this conversation only (never persisted,
      // never the admin's identity key).
      const s = BunkerSigner.fromBunker(generateSecretKey(), pointer);
      signer = s;
      await s.connect();
      await loginWithSigner((tpl) => s.signEvent(tpl));
      notice = '';
    } catch {
      error = 'Bunker sign-in didn’t complete. Check the connection string, approve the request in your signer, and make sure only allowlisted admin keys are used.';
      notice = '';
    } finally {
      try { await signer?.close(); } catch { /* relay already closed */ }
      busy = '';
    }
  }

  async function elevateBluesky() {
    error = ''; notice = '';
    busy = 'bluesky';
    try {
      const res = await fetch('/api/admin/elevate/bluesky', { method: 'POST', headers: { accept: 'application/json' } });
      if (res.ok) {
        who = (await res.json()) as Who;
      } else if (res.status === 401) {
        error = 'Sign in with Bluesky first (use “Sign in” in the site header), then elevate here. Only allowlisted admin accounts are accepted.';
      } else {
        error = 'Elevation didn’t complete — please try again.';
      }
    } catch {
      error = 'Elevation didn’t complete — please try again.';
    } finally {
      busy = '';
    }
  }

  async function logout() {
    error = '';
    busy = 'logout';
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: who?.csrf ? { 'x-admin-csrf': who.csrf } : {},
      });
    } catch { /* clear the UI regardless */ }
    who = null;
    busy = '';
  }

  const shortId = (s: string) => (s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s);
</script>

<div class="console">
  {#if checking}
    <p class="muted" role="status">Checking session…</p>
  {:else if who}
    <div class="card">
      <h2>Signed in</h2>
      <p><span class="muted">Identity</span> <code title={who.identity}>{shortId(who.identity)}</code></p>
      <p><span class="muted">Method</span> <code>{who.method}</code></p>
      <p class="muted small">Sessions expire after 15 minutes idle and 8 hours absolute.</p>
      <button class="btn" onclick={logout} disabled={busy === 'logout'}>Sign out</button>
    </div>
  {:else}
    <div class="card">
      <h2>Nostr</h2>
      <p class="muted small">Your key signs one login event. It never leaves your signer.</p>
      <button class="btn" onclick={loginNip07} disabled={busy !== ''}>
        {busy === 'nip07' ? 'Waiting for extension…' : 'Sign in with extension (NIP-07)'}
      </button>
      <div class="or"><span>or a remote bunker (NIP-46)</span></div>
      <label class="small" for="bunker">Bunker connection string — never a key</label>
      <div class="row">
        <input
          id="bunker"
          type="text"
          bind:value={bunkerInput}
          placeholder="bunker://…?relay=wss://…"
          autocapitalize="none"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="btn" onclick={loginNip46} disabled={busy !== ''}>
          {busy === 'nip46' ? 'Waiting for bunker…' : 'Connect'}
        </button>
      </div>
    </div>
    <div class="card">
      <h2>Bluesky</h2>
      <p class="muted small">Already signed in to the site with Bluesky? Elevate that session.</p>
      <button class="btn" onclick={elevateBluesky} disabled={busy !== ''}>
        {busy === 'bluesky' ? 'Elevating…' : 'Elevate Bluesky session'}
      </button>
    </div>
  {/if}
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .console { display: grid; gap: 1rem; max-width: 34rem; }
  .card { border: 1px solid #8884; border-radius: 0.5rem; padding: 1rem; display: grid; gap: 0.6rem; }
  .card h2 { margin: 0; font-size: 1.05rem; }
  .btn {
    font: inherit; cursor: pointer; padding: 0.5rem 0.9rem; border-radius: 0.4rem;
    border: 1px solid #8886; background: transparent; color: inherit; min-height: 2.75rem;
  }
  .btn:disabled { opacity: 0.6; cursor: default; }
  .row { display: flex; gap: 0.5rem; }
  .row input {
    flex: 1; min-width: 0; font: inherit; font-size: max(16px, 1rem);
    padding: 0.5rem 0.6rem; border-radius: 0.4rem; border: 1px solid #8886;
    background: transparent; color: inherit;
  }
  .or { display: flex; align-items: center; gap: 0.5rem; color: #888; font-size: 0.85rem; }
  .or::before, .or::after { content: ""; flex: 1; height: 1px; background: #8884; }
  .muted { color: #888; }
  .small { font-size: 0.85rem; }
  .error { color: #c0392b; margin: 0; }
  .notice { color: #888; margin: 0; }
  code { word-break: break-all; }
</style>
