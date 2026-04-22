---
name: "Warm Editorial"
variant: d
colors:
  ink:        "#1a1611"
  ink-2:      "#2e2820"
  ink-3:      "#6b5f50"
  ink-4:      "#9e9284"
  ink-5:      "#c8bfb2"
  paper:      "#fbfaf6"
  paper-2:    "#f4f1ea"
  rule:       "#1a1611"
  rule-soft:  "#ddd8cf"
  accent:     "oklch(0.52 0.11 35)"
  focus-ring: "#0066ff"
darkColors:
  ink:       "#f4f1ea"
  ink-2:     "#ddd8cf"
  ink-3:     "#9e9284"
  ink-4:     "#6b5f50"
  ink-5:     "#2e2820"
  paper:     "#1a1611"
  paper-2:   "#231d16"
  rule-soft: "#2e2820"
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

# Warm Editorial

## Brand Personality

Three words: *warm · considered · handmade*.

Warm Editorial is what happens when the strict B&W of variant A is held over a candle for a moment — not scorched, just gently toasted. The paper is aged uncoated stock (`#fbfaf6`), the ink is warm near-black (`#1a1611`) rather than cold pure black. The tonal ladder runs through warm greys with a consistent amber undertone throughout.

The single accent — a muted terracotta in OKLCH (`oklch(0.52 0.11 35)`) — appears only on active interactive elements, focus rings, and the occasional categorical marker. It reads as a rubber stamp or a hand-drawn underline: editorial annotation rather than UI chrome. Everything else stays ink on warm paper.

This is the variant for readers who prefer printed matter to glowing screens.

## Six Design Principles

1. **Hairlines only.** Every dividing line is 1px. Emphasis borders are 3px tops — pull-quotes, section openers. The warm paper surface separates sections through tone and whitespace, not boxes.

2. **Hover-invert.** All interactive surfaces invert on hover: background becomes `--ink` (warm near-black `#1a1611`), text becomes `--paper` (warm off-white `#fbfaf6`). The inversion reads consistently whether the OS is in light or dark mode.

3. **Fraunces holds the page.** Headlines, drop caps, lede paragraphs, and pull-quotes are set in Fraunces. The warmth of the palette enhances Fraunces's humanist, ink-on-paper quality — avoid cold type-on-screen associations.

4. **Mono eyebrows.** Labels and meta text use JetBrains Mono uppercase at 0.2em tracking and 11px. Against warm paper, the monospaced letterforms read as a typographer's annotation in a different register from the display serif.

5. **Rules, not boxes.** Soft rules use `#ddd8cf` — a warm sand-grey that reads like a pencil line on old paper. No accent-coloured borders, no shadows except `--shadow-hard` on ⌘K.

6. **Asymmetry over centering.** Same column structure as variant A. The warmth of the palette evokes letterpress; the asymmetric layout confirms this is a reading surface, not a portfolio showcase.
