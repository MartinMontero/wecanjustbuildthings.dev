// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';

// The production origin. Override with SITE_URL for preview deploys if desired.
const site = process.env.SITE_URL ?? 'https://wecanjustbuildthings.dev';

// Plausible is opt-in: only injected when PLAUSIBLE_DOMAIN is set, so local dev
// and forks stay analytics-free by default (privacy-first, see /privacy).
const plausibleDomain = process.env.PLAUSIBLE_DOMAIN;
const plausibleHead = plausibleDomain
  ? [
      {
        tag: /** @type {const} */ ('script'),
        attrs: {
          defer: true,
          'data-domain': plausibleDomain,
          src: 'https://plausible.io/js/script.js',
        },
      },
    ]
  : [];

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    starlight({
      title: 'We Can Just Build Things',
      tagline: 'Build the tools your community needs — freedom tech, made with an AI agent, grounded in a verified catalog you can trust.',
      description:
        'Liberation tech for builders: a verified catalog of Nostr, AT Protocol, and freedom-tech tools, a guided flow from idea to shipped, and safeguards that keep what you build clean — so organizers, nonprofits, and collectives can ship production-grade, privacy-respecting software with an AI agent like Goose or Claude Code.',
      logo: { src: './src/assets/logo.svg', alt: 'We Can Just Build Things' },
      favicon: '/favicon.svg',
      // Site-wide locale picker. English is the root locale (no /en/ prefix);
      // Spanish and Arabic (RTL) are available everywhere. Untranslated pages
      // fall back to the English content, so the catalog stays usable while we
      // translate the high-traffic pages (homepage, nav) incrementally.
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        es: { label: 'Español', lang: 'es' },
        ar: { label: 'العربية', lang: 'ar', dir: 'rtl' },
      },
      head: [
        ...plausibleHead,
        {
          // Override Starlight's default viewport meta (Starlight dedups by
          // name): opt into the display safe-area (viewport-fit=cover, paired
          // with env(safe-area-inset-*) in CSS) and let the on-screen keyboard
          // resize the layout viewport instead of overlapping fixed UI.
          tag: 'meta',
          attrs: {
            name: 'viewport',
            content:
              'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
          },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: `${site}/og.png` },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary_large_image' },
        },
      ],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/martinmontero/wecanjustbuildthings.dev',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/martinmontero/wecanjustbuildthings.dev/edit/main/',
      },
      lastUpdated: true,
      components: {
        SiteTitle: './src/components/overrides/SiteTitle.astro',
        Hero: './src/components/overrides/Hero.astro',
        PageTitle: './src/components/overrides/PageTitle.astro',
        SocialIcons: './src/components/overrides/SocialIcons.astro',
        // Appends the persistent compact-viewport bottom nav on every page.
        Header: './src/components/overrides/Header.astro',
      },
      customCss: ['./src/styles/tokens.css', './src/styles/theme.css', './src/styles/components.css'],
      sidebar: [
        {
          label: 'Start here',
          translations: { es: 'Empieza aquí', ar: 'ابدأ هنا' },
          items: [
            { label: 'What this is', translations: { es: 'Qué es esto', ar: 'ما هذا' }, link: '/start/' },
            { label: 'How it works', translations: { es: 'Cómo funciona', ar: 'كيف يعمل' }, link: '/start/how-it-works/' },
            { label: 'Why not just use Goose?', translations: { es: '¿Por qué no usar solo Goose?', ar: 'لماذا لا تكتفي بـ Goose؟' }, link: '/start/vs-harness/' },
            { label: 'Quickstart with an agent', translations: { es: 'Inicio rápido con un agente', ar: 'بداية سريعة مع وكيل' }, link: '/start/quickstart/' },
          ],
        },
        {
          label: 'Tools',
          translations: { es: 'Herramientas', ar: 'الأدوات' },
          items: [
            { label: 'Build Studio', translations: { es: 'Estudio de construcción', ar: 'استوديو البناء' }, link: '/build/', badge: { text: 'new', variant: 'default' } },
            { label: 'Check a dependency', translations: { es: 'Verifica una dependencia', ar: 'افحص اعتمادية' }, link: '/check/' },
            { label: 'Hosting cost estimator', translations: { es: 'Estimador de costes de alojamiento', ar: 'مُقدّر تكاليف الاستضافة' }, link: '/build/cost/' },
            { label: 'Model Compass', translations: { es: 'Brújula de modelos', ar: 'بوصلة النماذج' }, link: '/build/models/' },
          ],
        },
        {
          label: 'Guides',
          translations: { es: 'Guías', ar: 'الأدلة' },
          items: [{ autogenerate: { directory: 'guides' } }],
        },
        {
          label: 'Socratic Intent (the method)',
          translations: { es: 'Intención socrática (el método)', ar: 'النية السقراطية (المنهج)' },
          items: [{ autogenerate: { directory: 'method' } }],
        },
        {
          label: 'The build flow (PIE)',
          translations: { es: 'El flujo de construcción (PIE)', ar: 'تدفّق البناء (PIE)' },
          items: [{ autogenerate: { directory: 'pie' } }],
        },
        {
          // The catalog has >1,000 entries — browse via the overview + search
          // rather than an autogenerated sidebar (which would bloat every page).
          label: 'Catalog',
          translations: { es: 'Catálogo', ar: 'الكتالوج' },
          items: [{ label: 'Browse the catalog', translations: { es: 'Explorar el catálogo', ar: 'تصفّح الكتالوج' }, link: '/catalog/' }],
        },
        {
          label: 'Recipes',
          translations: { es: 'Recetas', ar: 'الوصفات' },
          items: [{ autogenerate: { directory: 'recipes' } }],
        },
        {
          label: 'Policies & trust',
          translations: { es: 'Políticas y confianza', ar: 'السياسات والثقة' },
          items: [
            { label: 'The exclusion policy', translations: { es: 'La política de exclusión', ar: 'سياسة الاستبعاد' }, link: '/policies/' },
            { label: 'How enforcement works', translations: { es: 'Cómo funciona la aplicación', ar: 'كيف يعمل الإنفاذ' }, link: '/policies/enforcement/' },
            { label: 'Supply-chain security', translations: { es: 'Seguridad de la cadena de suministro', ar: 'أمن سلسلة التوريد' }, link: '/policies/supply-chain-security/' },
            { label: 'Privacy', translations: { es: 'Privacidad', ar: 'الخصوصية' }, link: '/privacy/' },
            { label: 'Security', translations: { es: 'Seguridad', ar: 'الأمان' }, link: '/security/' },
          ],
        },
        {
          label: 'Contribute',
          translations: { es: 'Contribuir', ar: 'ساهم' },
          items: [
            { label: 'Add a tool', translations: { es: 'Añadir una herramienta', ar: 'أضف أداة' }, link: '/contribute/' },
            { label: 'About & maintenance', translations: { es: 'Acerca de y mantenimiento', ar: 'عن المشروع والصيانة' }, link: '/about/' },
          ],
        },
      ],
    }),
    sitemap(),
    svelte(),
  ],
});
