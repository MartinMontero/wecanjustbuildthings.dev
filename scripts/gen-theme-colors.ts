/**
 * Generate the colour token layer for the whole site.
 *
 * The visual identity is the project's own — paper / ink / forest-green / coral,
 * taken from the Design Field Card (the brand source of truth). Those anchors are
 * fixed; Material Color Utilities (MCU, Apache-2.0) fills the accessible tonal
 * steps *around* them (container + on-* pairs), per Design Field Manual §7.1
 * ("generate accessible tonal palettes with MCU") and §7.3 ("all colour via
 * semantic tokens — no raw hex in components"). This generated file IS that token
 * layer, so the hex lives here and nowhere else.
 *
 * Forest green is the primary "do" colour; coral is the single accent. Surfaces
 * are warm paper, never cold tech-grey. Both themes verified against §3 contrast.
 *
 * Emits src/styles/colors.generated.css. Build-time only; MCU never ships.
 * Run: npm run gen:colors
 */
import { writeFileSync } from 'node:fs';
import { argbFromHex, hexFromArgb, TonalPalette } from '@material/material-color-utilities';

/* Brand anchors — Design Field Card. */
const GREEN = '#0E5A3C'; // forest green (light primary)
const CORAL = '#CE3D26'; // coral (accent)
const green = TonalPalette.fromInt(argbFromHex(GREEN));
const coral = TonalPalette.fromInt(argbFromHex(CORAL));
const g = (t: number) => hexFromArgb(green.tone(t)); // accessible green steps
const c = (t: number) => hexFromArgb(coral.tone(t)); // accessible coral steps

/* Each theme's full token set. Neutrals are hand-tuned warm paper/ink (Field
   Card); accent + container fills come from the MCU ramps above. */
type Vars = Record<string, string>;

const dark: Vars = {
  // Material roles (used by custom components + the Studio)
  'primary': '#46C088', // brand dark green
  'on-primary': '#06140C',
  'primary-container': g(26),
  'on-primary-container': g(90),
  'secondary': '#9FB0A4',
  'on-secondary': '#16221C',
  'secondary-container': '#26302A',
  'on-secondary-container': '#CFDAD2',
  'tertiary': '#FF6A4D', // brand coral, dark
  'on-tertiary': '#220A04',
  'tertiary-container': c(30),
  'on-tertiary-container': c(90),
  'error': '#FFB4AB',
  'on-error': '#690005',
  'error-container': '#93000A',
  'on-error-container': '#FFDAD6',
  'background': '#121613',
  'on-background': '#E7ECE3',
  'surface': '#121613',
  'on-surface': '#E7ECE3',
  'surface-variant': '#2A322B',
  'on-surface-variant': '#BFC9C1',
  'outline': '#717C75',
  'outline-variant': '#2A322B',
  'shadow': '#000000',
  'scrim': '#000000',
  'inverse-surface': '#E7ECE3',
  'inverse-on-surface': '#16221C',
  'inverse-primary': GREEN,
  // surface-container tonal steps (warm)
  'surface-dim': '#0E1310',
  'surface-bright': '#2C342E',
  'surface-container-lowest': '#0B0F0C',
  'surface-container-low': '#161C18',
  'surface-container': '#1A201B',
  'surface-container-high': '#202722',
  'surface-container-highest': '#28302A',
};

const darkSL: Vars = {
  // Starlight accent (links, active state, primary chrome)
  'accent-low': g(22),
  'accent': '#46C088',
  'accent-high': '#9BE0BE',
  // Starlight neutral ramp — warm, so the whole chrome reads as ink-on-paper
  'white': '#ECF1E9',
  'gray-1': '#DBE5DD',
  'gray-2': '#B6C2BA',
  'gray-3': '#8B978F',
  'gray-4': '#5B665F',
  'gray-5': '#2E3732',
  'gray-6': '#19211D',
  'gray-7': '#11160F',
  'black': '#121613',
};

const light: Vars = {
  'primary': GREEN, // brand forest green
  'on-primary': '#FFFFFF',
  'primary-container': g(90),
  'on-primary-container': g(20),
  'secondary': '#4C5851',
  'on-secondary': '#FFFFFF',
  'secondary-container': '#DCE6DD',
  'on-secondary-container': '#16221C',
  'tertiary': CORAL, // brand coral
  'on-tertiary': '#FFFFFF',
  'tertiary-container': c(90),
  'on-tertiary-container': c(20),
  'error': '#BA1A1A',
  'on-error': '#FFFFFF',
  'error-container': '#FFDAD6',
  'on-error-container': '#410002',
  'background': '#ECEFE8',
  'on-background': '#16221C',
  'surface': '#ECEFE8',
  'on-surface': '#16221C',
  'surface-variant': '#DEE4D8',
  'on-surface-variant': '#46524C',
  'outline': '#737E77',
  'outline-variant': '#CDD3C6',
  'shadow': '#000000',
  'scrim': '#000000',
  'inverse-surface': '#16221C',
  'inverse-on-surface': '#EDF0E8',
  'inverse-primary': '#46C088',
  'surface-dim': '#D9DED1',
  'surface-bright': '#F6F8F1',
  'surface-container-lowest': '#FFFFFF',
  'surface-container-low': '#F4F6F0',
  'surface-container': '#EAEEE3',
  'surface-container-high': '#E2E7D9',
  'surface-container-highest': '#DAE0CF',
};

const lightSL: Vars = {
  'accent-low': g(90),
  'accent': GREEN,
  'accent-high': g(20),
  'white': '#16221C',
  'gray-1': '#29332D',
  'gray-2': '#46524C',
  'gray-3': '#5C6862',
  'gray-4': '#7E8A83',
  'gray-5': '#C7CEC0',
  'gray-6': '#E4E8DD',
  'gray-7': '#EDF0E8',
  'black': '#ECEFE8',
};

/* Brand convenience tokens (warm paper editorial layer). The "-text" coral is
   AA-on-paper for use AS text; the plain coral is for fills/edges. */
const darkBrand: Vars = {
  'wcb-paper': '#121613',
  'wcb-ink': '#E7ECE3',
  'wcb-ink-soft': '#9FB0A4',
  'wcb-line': '#2A322B',
  'wcb-card': '#1A201B',
  'wcb-green': '#46C088',
  'wcb-coral': '#FF6A4D',
  'wcb-coral-text': '#FF8E78',
  'wcb-coral-ink': '#220A04',
  'wcb-on-accent': '#06140C',
};
const lightBrand: Vars = {
  'wcb-paper': '#ECEFE8',
  'wcb-ink': '#16221C',
  'wcb-ink-soft': '#46524C',
  'wcb-line': '#D2D7CC',
  'wcb-card': '#F4F6F0',
  'wcb-green': '#0E5A3C',
  'wcb-coral': '#CE3D26',
  'wcb-coral-text': '#AB2A14',
  'wcb-coral-ink': '#FFFFFF',
  'wcb-on-accent': '#FFFFFF',
};

const md = (v: Vars) =>
  Object.entries(v).map(([k, hex]) => `  --md-sys-color-${k}: ${hex};`).join('\n');
const sl = (v: Vars) =>
  Object.entries(v).map(([k, hex]) => `  --sl-color-${k}: ${hex};`).join('\n');
const brand = (v: Vars) =>
  Object.entries(v).map(([k, hex]) => `  --${k}: ${hex};`).join('\n');

const css = `/* GENERATED by scripts/gen-theme-colors.ts — DO NOT EDIT BY HAND.
   Brand palette: paper / ink / forest-green / coral (Design Field Card).
   Forest green = primary; coral = the one accent; surfaces are warm paper.
   MCU fills the accessible container/on-* tonal steps around the brand anchors.
   Regenerate with \`npm run gen:colors\`.
   :root = dark theme; [data-theme='light'] = light theme. */

:root {
  /* Material roles */
${md(dark)}

  /* Starlight chrome (accent + warm neutral ramp) */
${sl(darkSL)}

  /* Brand editorial tokens */
${brand(darkBrand)}
}

:root[data-theme='light'] {
  /* Material roles */
${md(light)}

  /* Starlight chrome (accent + warm neutral ramp) */
${sl(lightSL)}

  /* Brand editorial tokens */
${brand(lightBrand)}
}
`;

writeFileSync('src/styles/colors.generated.css', css);
console.log('Wrote src/styles/colors.generated.css — brand palette (green/coral/paper/ink)');
