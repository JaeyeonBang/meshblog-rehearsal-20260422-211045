---
name: "Paper & Ink Warm"
variant: b
colors:
  ink:        "oklch(0.22 0.015 85)"
  ink-2:      "oklch(0.28 0.012 85)"
  ink-3:      "oklch(0.45 0.010 85)"
  ink-4:      "oklch(0.60 0.008 85)"
  ink-5:      "oklch(0.78 0.006 85)"
  paper:      "oklch(0.982 0.008 85)"
  paper-2:    "oklch(0.960 0.010 85)"
  rule:       "oklch(0.22 0.015 85)"
  rule-soft:  "oklch(0.88 0.008 85)"
  accent:     "oklch(0.400 0.090 265)"
  focus-ring: "#0066ff"
fonts:
  display: "Fraunces"
  serif:   "Fraunces"
  sans:    "Pretendard"
  mono:    "JetBrains Mono"
scale:
  radius:
    xs:   0
    sm:   2
    md:   4
    pill: 999
  space: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96]
  type:
    xs:   11
    sm:   13
    base: 15
    md:   16
    lg:   18
    xl:   20
    2xl:  22
    3xl:  28
    4xl:  34
    5xl:  48
motion:
  ease:     "cubic-bezier(.22,1,.36,1)"
  dur-fast: "140ms"
  dur:      "240ms"
rules:
  hairline: 1
  emphasis: 3
  hover:    invert
shadows:
  hard: "12px 12px 0 var(--ink)"
layout:
  w-page:          "1280px"
  w-page-graph:    "1400px"
  w-prose:         "60ch"
  w-side:          "320px"
  w-reader-side:   "240px"
  w-graph-side:    "300px"
  w-search-box:    "760px"
---

# Paper & Ink Warm

## Brand Personality

Three words: *lamp-lit · warm · unhurried*.

Where the Editorial B&W variant is strictly monochrome, Paper & Ink Warm introduces the slight temperature of aged uncoated stock. Surfaces read like the interior pages of a small literary quarterly printed on off-white — not clinical white, not sepia, but the particular buff of a journal kept on a desk under a reading lamp.

The single accent — a deep, desaturated indigo (`oklch(0.400 0.090 265)`) — appears only on active links, focus rings, and the rare interactive affordance. Everything else remains ink on paper.

## Six Design Principles

1. **Hairlines only.** Every dividing line is 1px. Emphasis borders are 3px tops — pull-quotes, section openers — never full-bordered cards. The warm paper surface does the work of differentiation; boxes are redundant.

2. **Hover-invert.** All interactive surfaces invert on hover: background becomes `--ink` (warm near-black), text becomes `--paper` (warm off-white). The indigo accent appears on focus rings only — not on hover.

3. **Fraunces holds the page.** Headlines, drop caps, lede paragraphs, and pull-quotes are set in Fraunces at its optical sweet spot. The warm palette complements Fraunces's humanist curves — together they read as handset type on quality stock.

4. **Mono eyebrows.** Labels, categories, and meta text use JetBrains Mono uppercase at 0.2em tracking. Against the warm paper, mono text reads as a typographer's annotation — deliberate contrast of cold register against warm surface.

5. **Rules, not boxes.** Soft rules use `oklch(0.88 0.008 85)` — a warm light-grey that reads as a pencil line on warm paper. No accent-coloured borders. No shadows except `--shadow-hard` on ⌘K.

6. **Asymmetry over centering.** Same column structure as variant A. The warmth of the palette evokes print; the asymmetric layout reinforces that this is a reading surface, not a showcase.
