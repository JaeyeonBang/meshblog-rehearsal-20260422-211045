#!/usr/bin/env tsx
/**
 * scripts/build-tokens.ts
 * Reads design.md frontmatter → emits src/styles/tokens.css
 * Run: bun run build-tokens
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const ROOT = path.resolve(import.meta.dirname, '..');
const DESIGN_MD = path.join(ROOT, 'design.md');
const OUT_CSS = path.join(ROOT, 'src', 'styles', 'tokens.css');

// ── helpers ──────────────────────────────────────────────────────────────────

function die(msg: string): never {
  console.error(`[build-tokens] ERROR: ${msg}`);
  process.exit(1);
}

function requireField(data: Record<string, unknown>, field: string): unknown {
  if (data[field] === undefined || data[field] === null) {
    die(`design.md frontmatter missing required field: "${field}"`);
  }
  return data[field];
}

// ── parse ─────────────────────────────────────────────────────────────────────

if (!fs.existsSync(DESIGN_MD)) {
  die(`design.md not found at ${DESIGN_MD}`);
}

const src = fs.readFileSync(DESIGN_MD, 'utf-8');
let parsed: matter.GrayMatterFile<string>;
try {
  parsed = matter(src);
} catch (e) {
  die(`Failed to parse design.md frontmatter: ${(e as Error).message}`);
}

const d = parsed.data as Record<string, unknown>;

// Validate required top-level sections
for (const section of ['colors', 'fonts', 'scale', 'motion', 'rules', 'shadows', 'layout']) {
  requireField(d, section);
}

const colors  = d.colors  as Record<string, string>;
const fonts   = d.fonts   as Record<string, string>;
const scale   = d.scale   as { radius: Record<string, number>; space: number[]; type: Record<string, number> };
const motion  = d.motion  as Record<string, string>;
const shadows = d.shadows as Record<string, string>;
const layout  = d.layout  as Record<string, string>;

// Validate sub-fields
if (!colors.ink)       die('colors.ink missing');
if (!colors.paper)     die('colors.paper missing');
if (!fonts.display)    die('fonts.display missing');
if (!scale.space?.length) die('scale.space missing or empty');
if (!scale.type)       die('scale.type missing');

// ── font stack helpers ────────────────────────────────────────────────────────

const F_DISP  = `'${fonts.display}', 'Pretendard', Georgia, serif`;
const F_SERIF = `'${fonts.serif ?? fonts.display}', 'Pretendard', Georgia, serif`;
const F_SANS  = `'${fonts.sans}', -apple-system, system-ui, sans-serif`;
const F_MONO  = `'${fonts.mono}', ui-monospace, Menlo, monospace`;

// ── space stops (11 named stops) ─────────────────────────────────────────────

const SPACE_NAMES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 24];
const spaceTokens = scale.space
  .slice(0, SPACE_NAMES.length)
  .map((v, i) => `  --space-${SPACE_NAMES[i]}: ${v}px;`)
  .join('\n');

// ── type scale ────────────────────────────────────────────────────────────────

const t = scale.type;
const typeTokens = [
  `  --fs-xs:   ${t.xs}px;`,
  `  --fs-sm:   ${t.sm}px;`,
  `  --fs-base: ${t.base}px;`,
  `  --fs-md:   ${t.md}px;`,
  `  --fs-lg:   ${t.lg}px;`,
  `  --fs-xl:   ${t.xl}px;`,
  `  --fs-2xl:  ${t['2xl']}px;`,
  `  --fs-3xl:  ${t['3xl']}px;`,
  `  --fs-4xl:  ${t['4xl']}px;`,
  `  --fs-5xl:  ${t['5xl']}px;`,
  `  --fs-hero:     clamp(44px, 6vw, 82px);`,
  `  --fs-article:  clamp(38px, 5vw, 64px);`,
  `  --fs-notfound: 160px;`,
].join('\n');

// ── radius ────────────────────────────────────────────────────────────────────

const r = scale.radius;
const radiusTokens = [
  `  --r-xs:   ${r.xs}${r.xs === 0 ? '' : 'px'};`,
  `  --r-sm:   ${r.sm}px;`,
  `  --r-md:   ${r.md}px;`,
  `  --r-pill: ${r.pill}px;`,
].join('\n');

// ── OKLab / OKLAB lightness inversion ────────────────────────────────────────
// Formulas from Björn Ottosson's 2020 post: https://bottosson.github.io/posts/oklab/
// L_dark = 1 - L_light; preserve a and b channels to retain hue/warmth.

/** Parse a 3- or 6-digit hex color (no alpha) → [r,g,b] in [0,1]. */
function hexToLinear(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '');
  let r: number, g: number, b: number;
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16) / 255;
    g = parseInt(h[1] + h[1], 16) / 255;
    b = parseInt(h[2] + h[2], 16) / 255;
  } else if (h.length === 6) {
    r = parseInt(h.slice(0, 2), 16) / 255;
    g = parseInt(h.slice(2, 4), 16) / 255;
    b = parseInt(h.slice(4, 6), 16) / 255;
  } else {
    return null;
  }
  // sRGB → linear
  const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return [toLinear(r), toLinear(g), toLinear(b)];
}

/** Linear sRGB → OKLAB [L, a, b]. */
function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

/** OKLAB [L, a, b] → linear sRGB. */
function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

/** Clamp and convert linear [0,1] → sRGB byte [0,255]. */
function linearToByte(c: number): number {
  const clamped = Math.max(0, Math.min(1, c));
  const srgb = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, srgb * 255)));
}

/**
 * Invert the OKLab lightness of a hex color (L_dark = 1 - L_light).
 * Preserves a/b channels so warmth/hue character is retained.
 * Falls through unchanged for non-hex values (e.g. CSS vars, oklch()).
 */
function invertLightness(hex: string): string {
  const rgb = hexToLinear(hex);
  if (!rgb) return hex; // not a hex color, return as-is
  const [L, a, b] = linearToOklab(...rgb);
  const darkL = 1 - L;
  const [dr, dg, db] = oklabToLinear(darkL, a, b);
  const rB = linearToByte(dr), gB = linearToByte(dg), bB = linearToByte(db);
  return `#${rB.toString(16).padStart(2, '0')}${gB.toString(16).padStart(2, '0')}${bB.toString(16).padStart(2, '0')}`;
}

// ── dark-mode derived colors ──────────────────────────────────────────────────
// Strategy: if design.md has a `darkColors:` block, use it directly.
// Otherwise fall back to OKLab lightness inversion (L_dark = 1 - L_light,
// preserving a/b channels to keep hue/warmth character).

const darkColorsOverride = d.darkColors as Record<string, string> | undefined;

function getDark(key: string, lightFallback: string): string {
  if (darkColorsOverride && darkColorsOverride[key]) return darkColorsOverride[key];
  return invertLightness(lightFallback);
}

const darkInk      = getDark('ink',       colors.ink);
const darkInk2     = getDark('ink-2',     colors['ink-2'] ?? '#1a1a1a');
const darkInk3     = getDark('ink-3',     colors['ink-3'] ?? '#555');
const darkInk4     = getDark('ink-4',     colors['ink-4'] ?? '#888');
const darkInk5     = getDark('ink-5',     colors['ink-5'] ?? '#bbb');
const darkPaper    = getDark('paper',     colors.paper);
const darkPaper2   = getDark('paper-2',   colors['paper-2'] ?? '#f6f6f4');
const darkRuleSoft = getDark('rule-soft', colors['rule-soft'] ?? '#d9d9d6');

// ── assemble CSS ──────────────────────────────────────────────────────────────

const lightBlock = `\
:root {
  /* ── color (${d.name ?? 'variant'}) ──────────────────────────────────────── */
  --ink:       ${colors.ink};
  --ink-2:     ${colors['ink-2']};
  --ink-3:     ${colors['ink-3']};
  --ink-4:     ${colors['ink-4']};
  --ink-5:     ${colors['ink-5']};
  --paper:     ${colors.paper};
  --paper-2:   ${colors['paper-2']};
  --rule:      ${colors.rule ?? colors.ink};
  --rule-soft: ${colors['rule-soft']};
  --accent:    ${colors.accent};

  /* ── focus (a11y) ─────────────────────────────────────────────────────── */
  --focus-ring: ${colors['focus-ring'] ?? '#0066ff'};

  /* ── type families ────────────────────────────────────────────────────── */
  --f-disp:  ${F_DISP};
  --f-serif: ${F_SERIF};
  --f-sans:  ${F_SANS};
  --f-mono:  ${F_MONO};

  /* ── type scale ───────────────────────────────────────────────────────── */
${typeTokens}

  /* ── spacing (4-based, 11 stops) ─────────────────────────────────────── */
${spaceTokens}

  /* ── radii ────────────────────────────────────────────────────────────── */
${radiusTokens}

  /* ── motion ───────────────────────────────────────────────────────────── */
  --ease:     ${motion.ease};
  --dur-fast: ${motion['dur-fast']};
  --dur:      ${motion.dur};

  /* ── elevation (⌘K only) ──────────────────────────────────────────────── */
  --shadow-hard: ${shadows.hard};

  /* ── layout rails ─────────────────────────────────────────────────────── */
  --w-page:          ${layout['w-page']};
  --w-page-graph:    ${layout['w-page-graph']};
  --w-prose:         ${layout['w-prose']};
  --w-side:          ${layout['w-side']};
  --w-reader-side:   ${layout['w-reader-side']};
  --w-graph-side:    ${layout['w-graph-side']};
  --w-search-box:    ${layout['w-search-box']};
}`;

const darkColorVars = `\
    /* ── color (dark — ink↔paper inverted) ──────────────────────────────── */
    --ink:       ${darkInk};
    --ink-2:     ${darkInk2};
    --ink-3:     ${darkInk3};
    --ink-4:     ${darkInk4};
    --ink-5:     ${darkInk5};
    --paper:     ${darkPaper};
    --paper-2:   ${darkPaper2};
    --rule:      ${darkInk};
    --rule-soft: ${darkRuleSoft};
    --accent:    var(--ink);`;

const lightColorVars = `\
    /* ── color (light — forced light on dark-OS users) ──────────────────── */
    --ink:       ${colors.ink};
    --ink-2:     ${colors['ink-2']};
    --ink-3:     ${colors['ink-3']};
    --ink-4:     ${colors['ink-4']};
    --ink-5:     ${colors['ink-5']};
    --paper:     ${colors.paper};
    --paper-2:   ${colors['paper-2']};
    --rule:      ${colors.rule ?? colors.ink};
    --rule-soft: ${colors['rule-soft']};
    --accent:    ${colors.accent};`;

const darkBlock = `\
@media (prefers-color-scheme: dark) {
  :root {
${darkColorVars}
  }
}

[data-theme="dark"] {
${darkColorVars}
}

[data-theme="light"] {
${lightColorVars}
}`;

const banner = `/* AUTOGENERATED by scripts/build-tokens.ts from design.md — do not edit directly */\n\n`;

const output = banner + lightBlock + '\n\n' + darkBlock + '\n';

// ── write ─────────────────────────────────────────────────────────────────────

fs.mkdirSync(path.dirname(OUT_CSS), { recursive: true });
fs.writeFileSync(OUT_CSS, output, 'utf-8');

const lines = output.split('\n').length;
console.log(`[build-tokens] OK — wrote ${OUT_CSS} (${lines} lines)`);
