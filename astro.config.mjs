// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';

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
      tagline: 'Verified open-source tools and a guided flow for building Nostr, AT Protocol, and freedom-tech with AI agents.',
      description:
        'A values-enforced catalog and guided build flow: every dependency license-checked at a commit and screened against a Meta/OpenAI/xAI exclusion policy, so anyone can ship production-grade, privacy-respecting tools with an AI agent harness like Goose or Claude Code.',
      logo: { src: './src/assets/logo.svg', alt: 'We Can Just Build Things' },
      favicon: '/favicon.svg',
      head: [
        ...plausibleHead,
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
      customCss: ['./src/styles/theme.css'],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'What this is', link: '/start/' },
            { label: 'Why not just use Goose?', link: '/start/vs-harness/' },
            { label: 'Quickstart with an agent', link: '/start/quickstart/' },
          ],
        },
        {
          label: 'The build flow (PIE)',
          items: [{ autogenerate: { directory: 'pie' } }],
        },
        {
          label: 'Catalog',
          collapsed: true,
          items: [{ autogenerate: { directory: 'catalog' } }],
        },
        {
          label: 'Recipes',
          items: [{ autogenerate: { directory: 'recipes' } }],
        },
        {
          label: 'Policies & trust',
          items: [
            { label: 'The exclusion policy', link: '/policies/' },
            { label: 'How enforcement works', link: '/policies/enforcement/' },
            { label: 'Privacy', link: '/privacy/' },
            { label: 'Security', link: '/security/' },
          ],
        },
        {
          label: 'Contribute',
          items: [
            { label: 'Add a tool', link: '/contribute/' },
            { label: 'About & maintenance', link: '/about/' },
          ],
        },
      ],
    }),
    sitemap(),
  ],
});
