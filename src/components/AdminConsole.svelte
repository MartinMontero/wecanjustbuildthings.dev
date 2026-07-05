<script lang="ts">
  /**
   * Admin console island (/console/). Two responsibilities:
   *
   * 1. SIGN IN — three BYOK routes, the platform never holds an admin's key or
   *    account:
   *      - NIP-07: a browser extension signs the NIP-98 login event in-page.
   *      - NIP-46: a remote bunker signs it over a relay WebSocket (this is why
   *        /console/* — and ONLY /console/* — gets `wss:` in connect-src; see
   *        src/lib/security-headers.ts). The bunker connection string is pasted
   *        here; an ephemeral client key is generated in-memory for transport.
   *        NEVER an nsec/ncryptsec input — key-looking pastes are rejected.
   *      - Bluesky: reuse the ordinary site sign-in (header widget), then elevate;
   *        the server checks the session's proven DID against the allowlist.
   *
   * 2. PANEL — once approved, the console routes on the server-returned role:
   *      - superadmin → the admin-management panel: list the effective admin set
   *        (file-governed principals, immutable here + runtime roster), and
   *        add/remove RUNTIME admins via /api/admin/admins* (every mutation
   *        CSRF-checked and audit-logged server-side). File principals are shown
   *        read-only — they are changed only through repository PRs.
   *      - admin → a signed-in home (no management tools for this role).
   *
   * The server decides everything (allowlist, role, sessions, CSRF); this island
   * only collects signatures, renders state, and calls same-origin APIs. Role is
   * re-derived server-side on every request, so this UI is a convenience, never
   * the authority.
   */
  import { onMount } from 'svelte';

  type Role = 'superadmin' | 'admin';
  type Who = { identity: string; method: 'nostr' | 'bluesky'; role: Role; csrf?: string };
  type AdminRow = {
    provider: 'nostr' | 'bluesky';
    subject: string;
    role: Role;
    source: 'file' | 'roster';
    immutable?: boolean;
    added_by?: string;
    added_at?: number;
    note?: string;
  };

  let checking = $state(true);
  let who = $state<Who | null>(null);
  let error = $state('');
  let notice = $state('');
  let busy = $state<'' | 'nip07' | 'nip46' | 'bluesky' | 'logout'>('');
  let bunkerInput = $state('');

  // ---- management panel state (superadmin only) ----
  let admins = $state<AdminRow[] | null>(null);
  let panelLoaded = $state(false);
  let panelBusy = $state(''); // '' | 'load' | 'add' | `rm:<provider>:<subject>`
  let panelError = $state('');
  let addProvider = $state<'nostr' | 'bluesky'>('nostr');
  let addSubject = $state('');
  let addNote = $state('');

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

  // Load the management panel the moment a superadmin session is present (via
  // any sign-in path or a page reload). The guard flag makes it fire exactly
  // once per session; logout() resets it.
  $effect(() => {
    if (who?.role === 'superadmin' && !panelLoaded) {
      panelLoaded = true;
      void loadAdmins();
    }
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
    // Drop all panel state so a different admin signing in next never sees the
    // previous session's roster view.
    admins = null; panelLoaded = false; panelError = ''; addSubject = ''; addNote = '';
    busy = '';
  }

  // ---- management panel API (superadmin only; all same-origin) ----

  /** Turn a non-OK management response into a human message, preferring a
   *  status-specific line and falling back to the given default. */
  async function panelMessage(res: Response, fallback: string): Promise<string> {
    let serverErr = '';
    try {
      const j = (await res.json()) as { error?: unknown };
      if (typeof j.error === 'string') serverErr = j.error;
    } catch { /* non-JSON body */ }
    switch (res.status) {
      case 400: return 'That identifier isn’t valid for the selected network.';
      case 403: return serverErr.includes('cross-site')
        ? 'Request blocked (cross-site).'
        : 'That identity is file-governed — change it through a repository PR, not here.';
      case 404: return 'That admin isn’t on the runtime roster.';
      case 409: return serverErr.includes('file-resident')
        ? 'That identity is a file-governed admin — manage it through a repository PR, not here.'
        : 'They’re already an admin.';
      case 429: return 'Too many requests — wait a moment and try again.';
      case 503: return 'Admin storage is temporarily unavailable. Try again shortly.';
      default: return fallback;
    }
  }

  /** Shared mutation-header builder — JSON + the session CSRF token. */
  function mutationHeaders(): Record<string, string> {
    return { 'content-type': 'application/json', ...(who?.csrf ? { 'x-admin-csrf': who.csrf } : {}) };
  }

  async function loadAdmins() {
    panelError = ''; panelBusy = 'load';
    try {
      const res = await fetch('/api/admin/admins', { headers: { accept: 'application/json' } });
      if (res.status === 401) { who = null; return; }
      if (!res.ok) { admins = null; panelError = await panelMessage(res, 'Couldn’t load the admin list.'); return; }
      admins = ((await res.json()) as { admins: AdminRow[] }).admins;
    } catch {
      panelError = 'Couldn’t load the admin list.';
    } finally {
      panelBusy = '';
    }
  }

  async function addAdmin() {
    panelError = '';
    const subject = addSubject.trim();
    if (!subject) { panelError = 'Enter an identifier to add.'; return; }
    panelBusy = 'add';
    try {
      const res = await fetch('/api/admin/admins/add', {
        method: 'POST',
        headers: mutationHeaders(),
        body: JSON.stringify({ provider: addProvider, subject, note: addNote.trim() || undefined }),
      });
      if (res.status === 401) { who = null; return; }
      if (res.ok) { addSubject = ''; addNote = ''; await loadAdmins(); return; }
      panelError = await panelMessage(res, 'Couldn’t add that admin.');
    } catch {
      panelError = 'Couldn’t add that admin.';
    } finally {
      panelBusy = '';
    }
  }

  async function removeAdmin(provider: 'nostr' | 'bluesky', subject: string) {
    if (!confirm(`Remove this ${provider} admin?\n\n${subject}`)) return;
    panelError = ''; panelBusy = `rm:${provider}:${subject}`;
    try {
      const res = await fetch('/api/admin/admins/remove', {
        method: 'POST',
        headers: mutationHeaders(),
        body: JSON.stringify({ provider, subject }),
      });
      if (res.status === 401) { who = null; return; }
      if (res.ok) { await loadAdmins(); return; }
      panelError = await panelMessage(res, 'Couldn’t remove that admin.');
    } catch {
      panelError = 'Couldn’t remove that admin.';
    } finally {
      panelBusy = '';
    }
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
      <p>
        <span class="muted">Method</span> <code>{who.method}</code>
        · <span class="muted">Role</span> <code>{who.role}</code>
      </p>
      <p class="muted small">Sessions expire after 15 minutes idle and 8 hours absolute.</p>
      <button class="btn" onclick={logout} disabled={busy === 'logout'}>Sign out</button>
    </div>

    {#if who.role === 'superadmin'}
      <div class="card">
        <h2>Admins</h2>
        <p class="muted small">
          File-governed admins are set through repository PRs and are read-only here.
          Runtime admins can be added or removed below — every change is audit-logged.
        </p>

        {#if panelBusy === 'load' && !admins}
          <p class="muted" role="status">Loading the admin list…</p>
        {:else if admins}
          {#if admins.length === 0}
            <p class="muted small">No admins found.</p>
          {:else}
            <ul class="admins">
              {#each admins as a (a.provider + ':' + a.subject)}
                <li>
                  <div class="who-line">
                    <code title={a.subject}>{shortId(a.subject)}</code>
                    <span class="tag">{a.provider}</span>
                    <span class="tag {a.role === 'superadmin' ? 'tag-super' : ''}">{a.role}</span>
                    {#if a.source === 'file'}
                      <span class="tag muted">file · read-only</span>
                    {/if}
                  </div>
                  {#if a.note}<div class="muted small note">{a.note}</div>{/if}
                  {#if a.source === 'roster'}
                    <button
                      class="btn small-btn"
                      onclick={() => removeAdmin(a.provider, a.subject)}
                      disabled={panelBusy !== ''}
                    >
                      {panelBusy === `rm:${a.provider}:${a.subject}` ? 'Removing…' : 'Remove'}
                    </button>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
          <button class="btn small-btn" onclick={loadAdmins} disabled={panelBusy !== ''}>Refresh</button>
        {/if}

        <div class="add">
          <h3>Add a runtime admin</h3>
          <div class="row">
            <label class="sr-only" for="add-provider">Network</label>
            <select id="add-provider" bind:value={addProvider} disabled={panelBusy !== ''}>
              <option value="nostr">Nostr</option>
              <option value="bluesky">Bluesky</option>
            </select>
            <label class="sr-only" for="add-subject">Identifier</label>
            <input
              id="add-subject"
              type="text"
              bind:value={addSubject}
              placeholder={addProvider === 'nostr' ? 'npub1… or 64-hex pubkey' : 'did:plc:… / did:web:…'}
              autocapitalize="none"
              autocomplete="off"
              spellcheck="false"
              disabled={panelBusy !== ''}
            />
          </div>
          <label class="sr-only" for="add-note">Note</label>
          <input
            id="add-note"
            type="text"
            bind:value={addNote}
            placeholder="Note (optional) — who is this?"
            autocomplete="off"
            disabled={panelBusy !== ''}
          />
          <button class="btn" onclick={addAdmin} disabled={panelBusy !== ''}>
            {panelBusy === 'add' ? 'Adding…' : 'Add admin'}
          </button>
        </div>

        {#if panelError}<p class="error" role="alert">{panelError}</p>{/if}
      </div>
    {:else}
      <div class="card">
        <p class="muted small">
          You’re signed in as an admin. No admin tools are available to your role yet.
        </p>
      </div>
    {/if}
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
  .card h3 { margin: 0.2rem 0 0; font-size: 0.95rem; }
  .btn {
    font: inherit; cursor: pointer; padding: 0.5rem 0.9rem; border-radius: 0.4rem;
    border: 1px solid #8886; background: transparent; color: inherit; min-height: 2.75rem;
  }
  .btn:disabled { opacity: 0.6; cursor: default; }
  .small-btn { min-height: 2.25rem; padding: 0.35rem 0.7rem; font-size: 0.9rem; justify-self: start; }
  .row { display: flex; gap: 0.5rem; }
  .row input {
    flex: 1; min-width: 0; font: inherit; font-size: max(16px, 1rem);
    padding: 0.5rem 0.6rem; border-radius: 0.4rem; border: 1px solid #8886;
    background: transparent; color: inherit;
  }
  .row select {
    font: inherit; padding: 0.5rem 0.6rem; border-radius: 0.4rem;
    border: 1px solid #8886; background: transparent; color: inherit;
  }
  .add { display: grid; gap: 0.5rem; border-top: 1px solid #8884; padding-top: 0.75rem; margin-top: 0.25rem; }
  .add input {
    font: inherit; font-size: max(16px, 1rem); padding: 0.5rem 0.6rem;
    border-radius: 0.4rem; border: 1px solid #8886; background: transparent; color: inherit;
  }
  .admins { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
  .admins li {
    display: grid; gap: 0.3rem; padding: 0.5rem 0.6rem;
    border: 1px solid #8883; border-radius: 0.4rem;
  }
  .who-line { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
  .tag {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.02em;
    padding: 0.1rem 0.4rem; border-radius: 0.3rem; border: 1px solid #8886; color: #aaa;
  }
  .tag-super { color: #e8e8ef; border-color: #aaa; }
  .note { margin: 0; }
  .or { display: flex; align-items: center; gap: 0.5rem; color: #888; font-size: 0.85rem; }
  .or::before, .or::after { content: ""; flex: 1; height: 1px; background: #8884; }
  .muted { color: #888; }
  .small { font-size: 0.85rem; }
  .error { color: #c0392b; margin: 0; }
  .notice { color: #888; margin: 0; }
  code { word-break: break-all; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  @media (prefers-color-scheme: light) {
    .tag { color: #666; }
    .tag-super { color: #1a1a24; border-color: #666; }
  }
</style>
