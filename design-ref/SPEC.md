# meshblog · blog-bw redesign — SPEC

> **Canonical contract** for all 3 implementation agents.
> Reference: `design-ref/handoff/project/blog-bw.html` (1628 lines, 6 pages, 25+ components).
> Design intent: editorial B&W, hairlines only, hover-invert, Fraunces + Pretendard, JSON-themable via `design.md`.

---

## 1 · File Ownership (NO OVERLAPS)

| Agent | Owns | Must not touch |
|---|---|---|
| **Agent 1 — Foundation** | `design.md`, `design.variants/*.md`, `scripts/build-tokens.ts`, `src/styles/tokens.css`, `src/styles/fonts.css`, `public/fonts/**`, `.claude/skills/{design-md-sync,component-extract,blog-bw-polish,theme-variant}/**`, `package.json` (scripts only) | components, layouts, pages |
| **Agent 2 — Components** | `src/components/ui/**`, `src/styles/article.css`, `src/components/QAChips.module.css`, `src/components/GraphView.module.css` | tokens.css, fonts.css, layouts, pages |
| **Agent 3 — Pages** | `src/layouts/Base.astro`, `src/pages/**/*.astro`, `test/responsive.test.ts` | tokens, components (only imports them) |

**Shared invariant**: all CSS must reference the token names from §3. No hex literals outside `tokens.css` + `fonts.css`.

---

## 2 · Typography

| Role | Family | Notes |
|---|---|---|
| `--f-disp` | **Fraunces** (opsz 9..144, wght 400–800, italic) | Display + body serif — all headlines, drop caps, lede |
| `--f-serif` | **Fraunces** | Body prose (18px/1.7, 60ch) — same family as disp |
| `--f-sans` | **Pretendard** | UI labels, buttons, nav, Korean runs |
| `--f-mono` | **JetBrains Mono** | Code, eyebrow labels (mono + letter-spacing 0.2em uppercase), kbd, meta |

Fraunces + JetBrains Mono loading: **Agent 1 adds Google Fonts `<link>` to Base.astro via a slot** — self-host is a future TODO. Pretendard remains self-hosted per existing `fonts.css` (92 chunks).

---

## 3 · Token Names (EXACT — all 3 agents use these verbatim)

All tokens live at `:root` (light) + `@media (prefers-color-scheme: dark)` (dark). Variant switch = rewrite these values only.

```css
/* ── color (A · Editorial B&W default) ──────────────────── */
--ink:       #000;         /* primary text + borders + hover bg  */
--ink-2:     #1a1a1a;      /* near-black body                    */
--ink-3:     #555;          /* secondary text, mono meta           */
--ink-4:     #888;          /* tertiary, placeholder              */
--ink-5:     #bbb;          /* subtle, kbd border                 */
--paper:     #fff;         /* page bg                            */
--paper-2:   #f6f6f4;      /* sunk surface (code inline, hover)  */
--rule:      #000;         /* primary 1px rules                  */
--rule-soft: #d9d9d6;      /* soft 1px rules (between post-cards)*/
--accent:    var(--ink);   /* B&W: everything IS the accent      */

/* ── focus (a11y — not present in blog-bw but required) ── */
--focus-ring: #0066ff;     /* visible on both paper and ink bg   */

/* ── type families ──────────────────────────────────────── */
--f-disp:  'Fraunces', 'Pretendard', Georgia, serif;
--f-serif: 'Fraunces', 'Pretendard', Georgia, serif;
--f-sans:  'Pretendard', -apple-system, system-ui, sans-serif;
--f-mono:  'JetBrains Mono', ui-monospace, Menlo, monospace;

/* ── type scale ─────────────────────────────────────────── */
--fs-xs:   11px;          /* mono eyebrow, kbd */
--fs-sm:   13px;          /* nav-link, btn, related meta */
--fs-base: 15px;          /* body default */
--fs-md:   16px;          /* post excerpt */
--fs-lg:   18px;          /* prose body */
--fs-xl:   20px;          /* article lede */
--fs-2xl:  22px;          /* pull-quote */
--fs-3xl:  28px;          /* h3 page-qa, sm home h1 */
--fs-4xl:  34px;          /* post-card h2 */
--fs-5xl:  48px;          /* graph h1 */
--fs-hero: clamp(44px, 6vw, 82px);   /* home-hero h1 */
--fs-article: clamp(38px, 5vw, 64px); /* article-header h1 */
--fs-notfound: 160px;     /* 404 big numeral */

/* ── spacing (4-based, 11 stops) ─────────────────────────── */
--space-1:  4px;   --space-2:  8px;   --space-3: 12px;
--space-4: 16px;   --space-5: 20px;   --space-6: 24px;
--space-8: 32px;   --space-10: 40px;  --space-12: 48px;
--space-16: 64px;  --space-24: 96px;

/* ── radii ──────────────────────────────────────────────── */
--r-xs: 0;  --r-sm: 2px;  --r-md: 4px;  --r-pill: 999px;

/* ── motion ─────────────────────────────────────────────── */
--ease: cubic-bezier(.22,1,.36,1);
--dur-fast: 140ms;
--dur: 240ms;

/* ── elevation (single shadow for ⌘K only) ───────────────── */
--shadow-hard: 12px 12px 0 var(--ink);

/* ── layout rails ───────────────────────────────────────── */
--w-page: 1280px;          /* home, reader, footer */
--w-page-graph: 1400px;
--w-prose: 60ch;           /* article body */
--w-side: 320px;           /* home aside */
--w-reader-side: 240px;    /* article sticky aside */
--w-graph-side: 300px;
--w-search-box: 760px;
```

**Dark mode** (Agent 1 defines in tokens.css): invert paper↔ink; `--rule-soft` becomes near-black (#2a2a2a); hover-invert still works (bg→paper, text→ink).

**⚠ Legacy tokens removed**: `--meshblog-color-*`, `--meshblog-font-*`, `--meshblog-space-*`, `--meshblog-radius-*`, `--meshblog-graph-*`, `--meshblog-dur-*`, `--meshblog-ease` are all replaced by the short names above. Agents 2 and 3 delete references.

---

## 4 · Component Inventory (25 — Agent 2 builds all)

Target directory layout:

```
src/components/ui/
  atoms/
    Badge.astro            # generic wrapper; KindBadge/TierBadge specialize
    Button.astro           # variants: default | primary | ghost | icon · size: md | sm
    Input.astro            # standard 1px border input
    Kbd.astro              # <span class="kbd">
    KindBadge.astro        # post (inverted) | note (outlined)
    Logo.astro             # wordmark: serif + slash + mono sub
    Tag.astro              # bottom-border tag pill
    TierBadge.astro        # note | concept | global
  molecules/
    Breadcrumbs.astro      # home / section / slug with · separator
    CodeBlock.astro        # inverted black codeblock · <pre><code>
    HeroFigure.astro       # X-pattern diagonal + label
    MiniMesh.astro         # SVG grid + positioned .mesh-node spans
    NoteRow.astro          # 72px num | title | meta
    PageQa.astro           # 3px top + 1px bottom rules, qa-list block
    Pager.astro            # prev/next grid with 1px divider
    PostCard.astro         # variants: default | with-thumb
    PullQuote.astro        # 3px top / 1px bottom, italic
    QaCard.astro           # q + a toggle; .open class swaps +/−
    RelatedGrid.astro      # 2×2 grid of related items
    SectionBreak.astro     # mono label + count + rule (horizontal separator)
    TOC.astro              # contents · related mesh · backlinks (reusable "aside section")
  organisms/
    CmdK.astro             # ⌘K overlay + backdrop; global in Base.astro
    Footer.astro           # 3px/1px footer-box, 4-col grid
    GraphControls.astro    # mode + level btn-groups, share/list buttons
    PageNav.astro          # route switcher (dev only; opt-in via prop)
    TopBar.astro           # logo + nav-links + search button
```

**Prop shape convention** (Agent 2 + Agent 3 agree):

```ts
// Button
interface Props { variant?: 'default'|'primary'|'ghost'|'icon'; size?: 'md'|'sm'; href?: string; }

// KindBadge
interface Props { kind: 'post'|'note'; number?: string|number; }  // renders "post / 01"

// TierBadge
interface Props { tier: 'note'|'concept'|'global'; }

// Logo
interface Props { sub?: string; }  // "est. 2026" etc.

// TopBar
interface Props { active?: 'posts'|'notes'|'graph'|'about'; showSearch?: boolean; }

// Breadcrumbs
interface Props { items: Array<{ label: string; href?: string; current?: boolean }>; }

// PostCard
interface Props { kind: 'post'|'note'; number: string; href: string; title: string;
                   excerpt?: string; date?: string; readingTime?: string;
                   tags?: string[]; thumb?: boolean; }

// NoteRow
interface Props { number: string; title: string; meta: string; href: string; }

// QaCard
interface Props { question: string; answer?: string; open?: boolean; }

// PageQa
interface Props { scope: 'page'|'note'|'global'; items: Array<{ question: string; answer?: string; open?: boolean }>; }

// Pager
interface Props { prev?: { number: string; title: string; href: string };
                   next?: { number: string; title: string; href: string }; }

// TOC
interface Props { label: string; items?: Array<{ label: string; level?: 1|2; href?: string; active?: boolean }>;
                   mesh?: boolean;  /* render a MiniMesh instead of list */ }

// HeroFigure
interface Props { label?: string; src?: string; alt?: string; }

// CodeBlock
interface Props { lang?: string; code: string; }

// PullQuote
interface Props { cite?: string; }  // slot = quote body

// SectionBreak
interface Props { label: string; count?: string; }

// RelatedGrid
interface Props { items: Array<{ kind: 'post'|'note'; number: string; title: string; meta: string; href: string }>; }

// GraphControls
interface Props { mode: 'notes'|'concepts'; level: 1|2|3; }  /* client-side wired by Agent 3 */

// MiniMesh
interface Props { nodes: Array<{ label: string; x: number; y: number;
                                   kind?: 'default'|'hub'|'concept'|'selected' }>;
                   edges: Array<{ from: number; to: number }>;
                   size?: 'sm'|'md'; }

// CmdK: no props (global — opened via window.dispatchEvent(new Event('cmdk:open')))
```

**Component-scoped CSS**: each `.astro` file has a `<style>` block with rules scoped to that component. No globals except `--*` tokens + the prose rules in `article.css`.

---

## 5 · `article.css` (Agent 2 rewrites)

Prose styles from blog-bw.html:373–456:
- `.prose` : max 60ch, Fraunces serif 18/1.7, color `--ink`
- `.prose p.drop:first-letter` : 5em drop cap, opsz 144
- `.prose h2` : top 1px rule `--rule-soft`, `§ ` prefix (mono 14px)
- `.prose h3` : 22px, Fraunces 600
- `.prose a` : bottom-border + hover invert
- `.prose code` : mono, `--paper-2` bg, 1px border
- `.prose blockquote` : left 3px solid `--ink`, italic Fraunces 22px, `<cite>` with em-dash
- `.prose ul > li::before` : em-dash mono bullet
- `.pull-quote` : top 3px solid / bottom 1px solid `--ink`, Fraunces italic 28px
- `.codeblock` : bg `--ink`, color `--paper`, mono 13.5px, 1px border

---

## 6 · Pages (Agent 3 builds — using Agent 2 components)

### `/` (index.astro) — home-layout

```
<TopBar active="posts" />
<div class="home-layout">
  <div class="home-main">
    <section class="home-hero">  <!-- kept inline, simple enough -->
    <div class="feed">
      {posts.map(p => <PostCard ... />)}
      <SectionBreak label="notes · atomic" count="14 entries" />
      {notes.map(n => <NoteRow ... />)}
      <Button href="/notes">notes 전체 보기 →</Button>
    </div>
  </div>
  <aside class="home-side">
    <TOC label="ask the vault">
      <Input placeholder="e.g. RAG란?" />
      {qa.map(q => <QaCard ... />)}
    </TOC>
    <TOC label="concept mesh">
      <MiniMesh nodes={...} edges={...} />
      <Button href="/graph">전체 그래프 →</Button>
    </TOC>
    <TOC label="feed">
      <a>→ atom · rss</a> ...
    </TOC>
  </aside>
</div>
<Footer />
```

### `/posts/[slug]`, `/notes/[slug]` — reader-layout
Breadcrumbs → article-header (KindBadge + meta · h1 · lede · tags) → HeroFigure → `.prose` body → PullQuote → CodeBlock → PageQa → RelatedGrid → Pager / sticky aside with TOC (contents, related mesh, backlinks).

Notes variant: no HeroFigure, note KindBadge, single-column prose 52ch.

### `/graph` — graph-layout
`.graph-header` (h1 + meta) → `GraphControls` → `.graph-main` (`.graph-canvas` with existing React `GraphView` island + `.graph-aside`).

Existing `GraphView.tsx` stays — Agent 2 just re-skins `GraphView.module.css` to match blog-bw node styles.

### `/404` — notfound
Double-frame `.box` (outer 1px border + inner `::before` 1px inset 8px) · mono error code · 160px Fraunces "404" · h1 + p · `<Button variant="primary">← 홈으로` · Suggests section with NoteRow list.

### ⌘K overlay
`Base.astro` mounts `<CmdK />` globally. Opens on `⌘K`/`Ctrl+K`/window event `cmdk:open`. Initially static results; wiring real search is out of scope for this redesign.

---

## 7 · `design.md` Schema (Agent 1 defines)

```markdown
---
name: "Editorial B&W"
variant: a
colors:
  ink:       "#000"
  ink-2:     "#1a1a1a"
  ink-3:     "#555"
  # ... all color tokens from §3
fonts:
  display:  "Fraunces"
  serif:    "Fraunces"
  sans:     "Pretendard"
  mono:     "JetBrains Mono"
scale:
  radius:   { xs: 0, sm: 2, md: 4, pill: 999 }
  space:    [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96]
  type:     { xs: 11, sm: 13, base: 15, md: 16, lg: 18, xl: 20, 2xl: 22, 3xl: 28, 4xl: 34, 5xl: 48 }
motion:
  ease: "cubic-bezier(.22,1,.36,1)"
  dur-fast: "140ms"
  dur: "240ms"
rules:
  hairline: 1
  emphasis: 3
  hover: invert
shadows:
  hard: "12px 12px 0 var(--ink)"
---

# {name}

Brand personality, principles — free prose (absorbed from .impeccable.md but variant-specific).
```

**Build script**: `scripts/build-tokens.ts` reads `design.md` frontmatter → emits `src/styles/tokens.css` (both `:root` light + dark override). Runs via `bun run build-tokens` + wired into `bun run build-all`.

**Variants A/B/C**: Agent 1 ships `design.variants/a.md` (B&W), `b.md` (Paper & Ink warm), `c.md` (Newspaper dense). Switch = `cp design.variants/X.md design.md && bun run build-tokens`.

---

## 8 · Skills (Agent 1 writes `.claude/skills/*`)

Each skill = a folder with `SKILL.md` (YAML frontmatter + instructions), reusable across future projects. Names + purpose:

1. **design-md-sync** — "edit design.md safely, regenerate tokens.css, preview in dev server"
2. **component-extract** — "given an HTML prototype, extract into Astro atoms/molecules/organisms with this SPEC's conventions"
3. **blog-bw-polish** — "lint: no hex outside tokens.css, hairline ≤1px, hover-invert on all interactive surfaces"
4. **theme-variant** — "swap design.md between variants A/B/C and verify no broken references"

Each SKILL.md: under 80 lines, concrete steps, example commands.

---

## 9 · Accessibility floor

- All interactive: `focus-visible` outline using `--focus-ring` (2px, 2px offset). Base.astro still exports skip-link + `.sr-only`.
- Kind-badge / tier-badge: decorative — content conveys meaning via title; no `aria-hidden` needed but colors must meet 4.5:1 (blog-bw `--ink`/`--paper` does).
- `⌘K` overlay: `role="dialog"`, `aria-modal="true"`, focus trap, esc to close (already in blog-bw script).

---

## 10 · Verification (Agent 3 owns at end)

```bash
bun run build-tokens       # Agent 1's script → regenerates tokens.css
bun run build:fixture      # full build with seeded data
npx vitest run test/responsive.test.ts
```

HTML verification (global rule):
```bash
curl -s http://localhost:4321/ | grep -q 'class="home-layout"' && echo OK
```

---

## Do not

- ❌ Add hex literals outside `tokens.css`/`fonts.css`
- ❌ Add shadows other than `--shadow-hard` (⌘K only)
- ❌ Add border-radius > 4px except `--r-pill` for kbd legacy
- ❌ Keep any `--meshblog-*` prefixed variable (migrate to short names)
- ❌ Touch files outside your §1 ownership
- ❌ Mock build output — run real `bun run build-tokens` + real `astro build`
