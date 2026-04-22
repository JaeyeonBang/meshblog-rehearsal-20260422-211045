---
name: blog-bw-polish
description: Lint meshblog CSS/Astro for blog-bw editorial invariants — no hex outside tokens.css, hairline rules only, hover-invert on interactives, single shadow. Use before commits touching UI code or when reviewing a new component.
---

# blog-bw-polish

Enforces the 6 invariants of the editorial B&W direction.

## The 6 rules

1. No hex literals outside `src/styles/tokens.css` + `src/styles/fonts.css`
2. Hairlines only — `border: 1px solid` default; `3px` reserved for emphasis (pull-quote top, page-qa top, footer top)
3. Hover-invert — every interactive surface flips `background/color` on `:hover` (paper↔ink) OR gains an underline; no subtle opacity shifts
4. Mono eyebrow — uppercase labels use `font-family: var(--f-mono)` + `letter-spacing: 0.2em` + `text-transform: uppercase` + `font-size: 10–11px` + `color: var(--ink-3)`
5. One shadow only — `box-shadow: var(--shadow-hard)` allowed on `.cmdk` only
6. Radius ≤4px except `--r-pill` for `.kbd` legacy

## Run order

```bash
cd /mnt/d/projects/meshblog

# 1. Hex leak
grep -rn --include='*.astro' --include='*.css' --include='*.module.css' \
  -E '#[0-9a-fA-F]{3,8}([^0-9a-fA-F]|$)' \
  src/ | grep -v 'src/styles/tokens.css' | grep -v 'src/styles/fonts.css'

# 2. Legacy tokens
grep -rn --include='*.astro' --include='*.css' \
  -E '--meshblog-(color|font|space|radius|dur|graph)-' src/

# 3. Stray shadows
grep -rn --include='*.astro' --include='*.css' 'box-shadow' src/ \
  | grep -v 'CmdK.astro' | grep -v '--shadow-hard'

# 4. Hairline violations
grep -rn --include='*.astro' --include='*.css' -E 'border(-[a-z]+)?:\s*([2-9]|1[0-9])px' src/ \
  | grep -v -E '(3px solid var\(--ink\))|(pull-quote|page-qa|footer-box)'

# 5. Radius violations
grep -rn --include='*.astro' --include='*.css' -E 'border-radius:\s*([5-9]|1[0-9])px' src/

# 6. Oversized transition beyond motion tokens
grep -rn --include='*.astro' --include='*.css' -E 'transition:[^;]*[0-9]+ms' src/ \
  | grep -v -E '(var\(--dur-fast\)|var\(--dur\))'
```

All 6 should output nothing on a clean codebase.

## Fix order

1. Hex → replace with token
2. Legacy `--meshblog-*` → short name per SPEC §3
3. Stray shadow → delete
4. Border width → 1px (or 3px for emphasis elements)
5. Radius → 0 / 2 / 4 / pill
6. Transition → `var(--dur-fast) var(--ease)` or `var(--dur) var(--ease)`

## Exemptions

- `fonts.css` `@font-face src:` URLs may contain hashes — not hex colors
- `article.css` prose drop-cap `font-size: 5em` — intentional, not a shadow or border violation
