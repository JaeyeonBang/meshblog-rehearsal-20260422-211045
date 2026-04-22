---
name: "Newspaper Dense"
variant: c
colors:
  ink:        "#000"
  ink-2:      "#1a1a1a"
  ink-3:      "#555"
  ink-4:      "#888"
  ink-5:      "#bbb"
  paper:      "#fff"
  paper-2:    "#f6f6f4"
  rule:       "#000"
  rule-soft:  "#d9d9d6"
  accent:     "var(--ink)"
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
    lg:   15
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
  w-prose:         "36ch"
  w-side:          "320px"
  w-reader-side:   "240px"
  w-graph-side:    "300px"
  w-search-box:    "760px"
---

# Newspaper Dense

## Brand Personality

Three words: *dense · structured · information-forward*.

This variant borrows from broadsheet newspaper typography: tight columns, compressed line-height, and maximum information per viewport. The same Fraunces typeface and B&W palette remain — but where variants A and B favour white space and reading comfort, Newspaper Dense optimises for scanning, comparison, and reference.

Best used by readers who already know the site and want to move fast through a large backlog.

## Six Design Principles

1. **Hairlines only.** Column rules and section breaks are still 1px — the density comes from tighter spacing and narrower column widths, not from heavier borders.

2. **Hover-invert.** Same inversion pattern as variant A. Density does not reduce interactive affordances; if anything, clear hover states are more important when targets are closer together.

3. **Fraunces holds the page.** Set at 15px/1.5 in the prose column — the same face but tighter metrics. Drop caps are retained; pull-quotes are shortened. The narrow 36ch column echoes a newspaper's half-width text block.

4. **Mono eyebrows.** JetBrains Mono uppercase at 11px becomes even more useful as a navigation aid in dense layouts: it visually separates section headers from body text at a glance.

5. **Rules as columns.** Vertical 1px rules divide the two-column prose layout. Horizontal section breaks are 1px `--rule-soft`. The grid is strict: 36ch left column, fixed gutter, 36ch right column.

6. **Two-column prose hint.** On viewports ≥ 900px, `.prose` splits into two 36ch columns with a 1px column rule. On mobile, it collapses to a single column. The result reads like a broadsheet interior page — and loads with no layout shift because column widths are `ch`-anchored.

---

> **Override tokens** (relative to variant A):
> - `--w-prose: 36ch` (was 60ch)
> - `--fs-lg: 15px` (was 18px — prose body same as base)
> - `--space-4: 12px` (was 16px — tighter default spacing unit)
> - Line-height for prose: 1.5 (set via article.css override — not a token)
