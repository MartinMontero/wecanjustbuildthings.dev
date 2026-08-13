/**
 * Pull Starlight's own virtual-module declarations into `astro check`.
 * Overrides that reuse stock subcomponents (the Footer's EditLink /
 * LastUpdated / Pagination) import `virtual:starlight/components/*`; the
 * declarations ship inside the package but nothing in this repo referenced
 * them until now, so tsc could not resolve the modules. One reference to the
 * upstream file — no local re-declaration to drift out of sync.
 */
/// <reference path="../../node_modules/@astrojs/starlight/virtual-internal.d.ts" />
