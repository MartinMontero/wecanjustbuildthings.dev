<script lang="ts">
  /**
   * Receipt — the Svelte twin of Receipt.astro for use inside islands. Same
   * props, same markup, same `.receipt` class contract (components.css), so a
   * verdict rendered statically and one rendered hydrated are identical.
   * Locale-agnostic: callers pass already-localized strings.
   */
  interface Props {
    status: 'ok' | 'warn' | 'danger' | 'pending';
    title: string;
    evidence?: string;
    action?: string;
  }
  let { status, title, evidence, action }: Props = $props();

  // Hand-drawn inline SVG, house stroke style — identical paths to Receipt.astro.
  const ICONS: Record<Props['status'], string> = {
    ok: '<circle cx="12" cy="12" r="8.5"/><path d="m8.4 12.2 2.5 2.5 4.8-5"/>',
    warn: '<path d="M12 4.2 20.8 19H3.2Z"/><path d="M12 9.8v3.8"/><path d="M12 16.6h.01"/>',
    danger:
      '<path d="M8.2 3.8h7.6l4.4 4.4v7.6l-4.4 4.4H8.2l-4.4-4.4V8.2Z"/><path d="m9.4 9.4 5.2 5.2m0-5.2-5.2 5.2"/>',
    pending:
      '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3.2 3.2"/><path d="M12 7.8V12l2.6 2.6"/>',
  };
</script>

<div class="receipt receipt--{status}">
  <p class="receipt__status">
    <svg
      class="receipt__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true">{@html ICONS[status]}</svg
    >
    {title}
  </p>
  {#if evidence}<p class="receipt__evidence">{evidence}</p>{/if}
  {#if action}<p class="receipt__action">{action}</p>{/if}
  <slot />
</div>
