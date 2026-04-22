---
name: "Editorial B&W"
variant: a
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
darkColors:
  ink:       "#fff"
  ink-2:     "#e8e8e6"
  ink-3:     "#aaa"
  ink-4:     "#777"
  ink-5:     "#444"
  paper:     "#000"
  paper-2:   "#1a1a1a"
  rule-soft: "#2a2a2a"
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

# Editorial B&W

## Brand Personality

Three words: *quiet · editorial · considered*.

This is a reading room, not a dashboard. The reader arrives from a link or a search, sits down for a single piece of writing, and follows a thread — related notes, concept clusters, Q&A chips — without feeling funnelled. The job is to slow them down by half a beat.

Voice: a long-form essay in a small print magazine. Confident enough to use one serif typeface and hold the page with it. Careful enough to set its own margins.

## Six Design Principles

1. **Hairlines only.** Every dividing line is 1px. Emphasis borders are 3px tops — pull-quotes, section openers — never full-bordered cards. The page breathes through whitespace and rule, not enclosure.

2. **Hover-invert.** All interactive surfaces invert on hover: background becomes `--ink`, text becomes `--paper`. No colour-shift, no underline-only, no opacity. The inversion is the signal — it reads equally well in light and dark mode.

3. **Fraunces holds the page.** Headlines, drop caps, lede paragraphs, and pull-quotes are set in Fraunces (optical size axis, opsz 9–144). Don't reach for a display typeface for impact — use size, weight variation, and the opsz axis. Never gradient-fill text. Never track out all-caps headings longer than two words.

4. **Mono eyebrows.** Labels, categories, counts, and meta text use JetBrains Mono with `letter-spacing: 0.2em` and `text-transform: uppercase`. They are signals, not prose. Size: 11px (`--fs-xs`). This creates a clear register separation without a second sans-serif.

5. **Rules, not boxes.** Separate content with hairlines (1px), whitespace, or a single top-border — never with full-bordered cards stacked on each other. No left-stripe accent borders. No drop shadows except `--shadow-hard` on the ⌘K overlay.

6. **Asymmetry over centering.** The homepage and article layouts lean left or sit in a narrow column offset from centre. Centred layouts are reserved for moments that genuinely want ceremony — the 404 numerals, perhaps the footer mark. On mobile, the first layout is a pocket-size zine: generous `line-height: 1.7`, comfortable 60ch column, no horizontal chrome.
