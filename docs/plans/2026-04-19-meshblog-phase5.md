<!-- /autoplan restore point: /home/qkdwodus777/.gstack/projects/meshblog/main-autoplan-restore-20260419-133852.md -->
# meshblog Phase 4.5 + Phase 5 — Content Sprint + Design Polish Plan

**Date:** 2026-04-19
**Phase:** 4.5 (content sprint) + 5 (polish) of PRD roadmap (§7)
**Status:** CEO-reviewed, Premise Gate passed (2026-04-19), pending Design+Eng review
**Depends on:** Phase 3 shipped (backend + pipeline + React islands + SSG, 126/126 tests)

> **Premise Gate decisions (2026-04-19):**
> 1. **Content first** — split into Phase 4.5 (content sprint) then Phase 5 (polish)
> 2. **N=5 reviewers + forced-choice** question to defeat politeness bias
> 3. **Hand-rolled CSS variables** (no Tailwind 4) — small surface, faster, no beta risk
> 4. **QA-first hero** — search input + sample chips above fold; posts list second screen

---

## 1. Goal

Turn the shipped Phase 3 pipeline into something worth sharing. PRD success criterion B: "친구/트위터/HN에 이거 봐봐 보낼 만한 퀄리티."

**CEO review flagged:** polish-first is the wrong problem. The site only has 2 real posts. No visual polish can hide an empty site. **Content is the bottleneck, not CSS.** Ship Phase 4.5 (content) first, then Phase 5 (polish).

### Phase 4.5 — Content Sprint
Write/import 10–15 real posts + 20–30 real notes so the pipeline has something to show. No visual work yet.

### Phase 5 — Polish
Hand-rolled CSS variables + QA-first homepage + article layout + QA chips polish. Ship to 5 reviewers with forced-choice question.

---

## 2. Scope

### Phase 4.5 — In scope
- Write 10–15 new posts (~600–1500 words each) OR import from existing vault
- Write/import 20–30 notes (short-form, 100–400 words)
- Re-run full pipeline against real content (live LLM, not fixtures)
- Sanity-check QA generation quality on real posts (spot-check 20 cards)
- Fix any pipeline regressions exposed by real content volume

### Phase 5 — In scope
- **Hand-rolled CSS variables** in `src/styles/tokens.css` (colors, type, spacing, radii, shadows, motion) — no Tailwind
- Typography pass including Korean font fallback (Pretendard subset)
- **QA-first homepage**: search + sample chips hero above fold; posts list second screen
- Post / note page article layout polish
- QA chips visual refresh + interaction polish (focus states, truncation, empty states)
- Responsive pass (360 / 768 / 1440)
- Color contrast audit (WCAG AA minimum)
- 5-reviewer round with forced-choice question, applied

### Deferred to Phase 6 (not this sprint)
- Graph page aesthetic pass — keep as-is; graph is secondary
- OG card visual redesign — current minimal version ships
- Analytics / tracking
- Comments / social share widgets
- Dark mode toggle (system preference only)
- New routes (no `/search`, no `/archive`, no `/about`)
- i18n routing
- Service worker / offline
- 200-note scale test

### Carryover from Phase 3
Design audit 8-item hand-off (`~/.gstack/projects/meshblog/designs/design-audit-20260418/`):
1. Drop "Phase 1" from `<title>` — **done in Phase 3** (Base.astro overrides title per page)
2. i18n lang strategy — **AF1 heuristic applied**; revisit if multi-lang posts ship
3. nav / main / skip-link / landmarks — **AF6 done**
4. meta description + OG + Twitter cards — **done** in Base.astro
5. Tailwind tokens — **Phase 5 Task 0**
6. Graph viz design — **Phase 5 Task 4**
7. Q&A chip design — **Phase 5 Task 5**
8. Homepage redesign — **Phase 5 Task 2**

### Deferred TODOS.md items addressed by this phase
- T2: Related notes vs backlinks distinction → Task 3 (article page)
- T3: Graph node encoding (color/size) → Task 4
- T4: Site tagline → Task 2 (hero)
- T5: Long answer overflow (QA truncation) → Task 5

---

## 3. Premises (post-CEO-review, post-Premise-Gate)

**P1** — ~~Visual polish is the current bottleneck.~~ **Content volume is the bottleneck.** The site has 2 posts. Polish on 2 posts = polished empty site. Ship content (4.5) first, then polish (5).

**P2** — ~~Tailwind 4~~ **Hand-rolled CSS custom properties** are the right tool for this surface size (4 pages, ~8 components). Faster to set up, no beta risk, no bundler config, no migration cost.

**P3** — System fonts + Pretendard subset for Korean is sufficient. Self-hosted Inter / custom fonts are premature optimization.

**P4** — ~~1–2 reviewers~~ **5 reviewers + forced-choice question** defeats politeness bias. Single question: "Would you share this with a specific person? Who and why?" Forcing a name converts social nicety into a concrete signal.

**P5** — Graph page stays deferred. Taste-driven rabbit hole; not on the share-readiness path.

**P6** — Dark mode defaults to system preference (no toggle). Reason: toggle state + flash-of-wrong-theme adds complexity not worth it for v1.

**P7** (new) — QA-first hero matches the actual product thesis. The novelty is pre-answered Q&A, not "another blog." Lead with it.

---

## 4. Task Breakdown

### Phase 4.5 — Content Sprint (precedes all Phase 5 tasks)

| # | Title | Effort | Blast radius | Notes |
|---|-------|--------|--------------|-------|
| C0 | Content audit — inventory vault | 30 min (user) | None (read-only) | Count existing drafts in Obsidian/vault. Decide: import N existing vs write N new. Target: 10–15 posts + 20–30 notes total after sprint |
| C1 | Import/author posts (10–15) | user wall-clock, ~1 week | `content/posts/*.md` | Real writing — not CC's job. User ships posts into `content/posts/`. Each with frontmatter (title, date, slug optional, draft false) |
| C2 | Import/author notes (20–30) | user wall-clock, ~1 week | `content/notes/*.md` | Short-form notes into `content/notes/`. Can be partial/WIP — mesh value comes from volume |
| C3 | Live-pipeline dry run | 60 min CC | Full pipeline | `bun run build-index` without FIXTURE_ONLY against real content. Sanity-check LLM costs (expect ~$0.50–$2 for ~40 items). Fix any regression |
| C4 | QA quality spot-check | 30 min user + 15 min CC | Read-only report | Sample 20 QA cards across tiers. User rates each: useful / neutral / bad. Flag systemic bad-generation patterns to fix in prompts |
| C5 | Pipeline regression fixes | 30–60 min CC | `src/lib/pipeline/*` | Only if C3 or C4 exposes real bugs. Budget-capped |

**Phase 4.5 gate:** ≥10 posts + ≥20 notes live, QA spot-check ≥70% useful, pipeline green.

### Phase 5 — Polish (after Phase 4.5 gate passes)

| # | Title | Effort (CC) | Blast radius | Notes |
|---|-------|------------|--------------|-------|
| **P0** | **Test infra setup** | 45 min | `package.json`, `test/` | NEW pre-req. Install `axe-core` + `happy-dom`; add bundle-size budget test on `dist/_astro/*.js` (≤100kb gz total); fix `fixture-mode.test.ts` ↔ `build-smoke.test.ts` DB race (Phase 3 carryover); schedule post-T2 update to build-smoke h1 assertion |
| **P1** | **Site URL lock** | 15 min | `astro.config.mjs`, artifact rebuild | NEW pre-req. Set `site: 'https://qkdwodus777.github.io'` + `base: '/meshblog'` (github.io subpath, reverted from Vercel 2026-04-19 after user audit — see §14 correction). Re-run `build-og` + `build-rss` so atom.xml + OG images carry correct absolute URLs. Must run BEFORE C3 live pipeline |
| T0 | CSS variable token system | 30 min | `src/styles/tokens.css` + `Base.astro` import | Hand-rolled `:root { --meshblog-color-*, --meshblog-space-*, --meshblog-font-size-*, --meshblog-radius-*, --meshblog-shadow-*, --meshblog-ease, --meshblog-dur-* }`. `--meshblog-` prefix for grep-auditability. Dark mode via `@media (prefers-color-scheme: dark)` override. Light SSR default (no flash). No Tailwind. Pre-commit grep gate: no hex literals outside tokens.css |
| T0.5 | Token migration of existing hardcoded values | 20 min | `src/pages/notes/[slug].astro`, `src/components/QAChips.tsx` | Replace hardcoded `#6b7280`, `#f3f4f6`, `#e5e7eb`, `0.7rem`, `2px 6px` in notes kind-badge `<style>`; replace QAChips inline `fontSize: '16px'` with `var(--meshblog-font-size-base)` |
| T1 | Typography + Korean font | 45 min | `src/styles/fonts.css`, `Base.astro` `<head>` | Self-hosted Pretendard Hangul+Latin subset, **weight 400 only** (optionally +700 if budget allows, ≤50kb each). `<link rel="preload" as="font" type="font/woff2" crossorigin>`. `font-display: swap`, `size-adjust` descriptor, `unicode-range` split. Fallback stack: `Pretendard, -apple-system, system-ui, "Apple SD Gothic Neo", sans-serif`. Article scale override: h1 `3.5rem / 2.25rem mobile`, h2 bumped to `3xl` to open h1:h2 gap |
| T4 | QA chips polish | 45 min | `src/components/QAChips.tsx` | Runs BEFORE T2 (reorder from original §8). Card styling via tokens (padding `space-4 space-5`, gap `space-3`, `radius-md`). Search input `min-height: 44px` (iOS tap), full-width <768 / max 480px ≥768. Focus ring via `--meshblog-color-focus-ring`. Long-answer 3-line CSS clamp + expand. Keyboard nav visible focus. No-results empty state |
| T2 | **QA-first homepage** | 60 min | `src/pages/index.astro` | Hero = `<h1>meshblog</h1>` + tagline + `<QAChips client:idle scope="global" />` (search input + top chips above fold). Ranking rule: `tier=global ORDER BY rank DESC` fallback to `tier=concept` highest-pagerank. Show top **4 chips at 360**, 6 at ≥768. Posts-strip (5 latest) directly below hero within first viewport. Third screen = graph link. Lazy-import Fuse inside first keystroke |
| T3 | Article page polish (posts + notes) | 60 min | `src/pages/posts/[slug].astro`, `src/pages/notes/[slug].astro` | Hand-rolled `.prose` class in tokens.css (max 65ch, `padding-inline: var(--meshblog-space-4)` at 360). Reading-time badge, kind badge (post/note), related-aside card style, metadata row. Distinguish backlinks (notes→post) vs related (topic similarity) |
| T5 | Responsive pass | 75 min | All 4 pages | Bumped from 45m. Test 360 / 768 / 1440. Fix overflow / unreadable / broken stacks. Mobile-first CSS. Verify below-fold posts-strip first-visible on scroll <200px at 360 |
| T6 | Color contrast + axe-core + focus | 60 min | Tokens + components + test | Bumped from 30m (axe-core is new infra per P0). WCAG AA body (4.5:1). Visible focus rings (`--meshblog-color-focus-ring` ≥3:1 vs border). Run axe-core in smoke test |
| T7 | Deploy to GitHub Pages + reviewer outreach | 60 min CC + async | `qkdwodus777.github.io/meshblog` | Reverted from Vercel 2026-04-19. `.github/workflows/deploy.yml` already ships to gh-pages. Push to main → workflow builds and deploys. Verify OG previews render on Slack/Twitter. DM 5 reviewers (≥2 weak-ties — author DM'd <5× last year) with URL + forced-choice: *"Name one specific person you'd send this URL to in the next 7 days, and paste the exact DM text you'd write. If you wouldn't send it to anyone, say so — that's also valid."* Outreach starts IN PARALLEL with T0 |
| T8 | Review ingest + top-3 fixes | 60 min | TBD from feedback | After ≥3 reviewer responses, triage top 3 actionable items. Apply. Re-ping reviewers if patched |
| T10 | 404.astro custom page | 15 min | `src/pages/404.astro` | NEW. Brand-consistent 404 with link home + search. Called out in Phase 3 retro §6 + architecture.md:111 |
| T9 | Phase 5 Retro | 15 min | `docs/retro/2026-05-??-phase5.md` | Ship summary, drift, Lighthouse scores, reviewer quotes (names + DM text samples), Phase 6 handoff |

**Phase 5 CC effort revised: ~10.5h active + async reviewer wall-clock.** (Original 6h + 2.5h from review fixes + 2h sandbagged buffers.)

---

## 5. Design token draft (for T0)

Input to CEO/Design review — feedback welcome:

```
color (all prefixed --meshblog-color-* in CSS):
  bg: #fafafa (light) / #0a0a0a (dark)
  surface: #ffffff / #141414
  border: #e5e5e5 / #262626
  text-primary: #171717 / #fafafa
  text-secondary: #525252 / #a3a3a3
  accent: #1d4ed8 (deeper ink blue, user-approved)  ← was #0066ff
  accent-hover: #1e40af
  muted: #737373 (light) / #8a8a8a (dark)           ← split to pass AA at 12px
  focus-ring: #2563eb (separate from accent, ≥3:1 vs border both modes)
  success: #10b981
  warn: #f59e0b
  error: #ef4444

type scale (rem, 1rem=16px):
  xs: 0.75  sm: 0.875  base: 1  lg: 1.125  xl: 1.25
  2xl: 1.5  3xl: 1.875  4xl: 2.25  5xl: 3

article scale override (in .prose):
  h1: 3.5rem desktop / 2.25rem mobile  ← bumped from 3rem to open h1:h2 gap
  h2: 1.875rem (3xl)
  h3: 1.25rem  (xl, demoted from 3xl)

spacing: 4-based (0.25rem increments). 1-2-3-4-5-6-8-10-12-16-24-32
  ← space-5 (1.25rem = 20px) added for paragraph gap
  ← space-10 (2.5rem = 40px) added for section break on mobile

radii: sm=4  md=8  lg=12  full=9999

shadow:
  sm: 0 1px 2px rgba(0,0,0,0.05)
  md: 0 4px 12px rgba(0,0,0,0.08)
  lg: 0 12px 32px rgba(0,0,0,0.12)

motion:
  ease: cubic-bezier(0.4, 0, 0.2, 1)
  duration-fast: 120ms
  duration-base: 200ms
  duration-slow: 400ms
```

**Dark mode default (resolved):** light-mode SSR + `@media (prefers-color-scheme: dark)` override in tokens.css. No toggle. No JS. No flash.

---

## 6. Risks

**R1 — Content sprint stalls** (Phase 4.5). User is bottleneck, not CC. Mitigation: C0 audit first — if vault has ≥10 draftable posts, import is fast. If not, allow "rough draft" posts; mesh value is in volume, not perfection.

**R2 — Live-pipeline LLM cost surprises (C3).** FIXTURE_ONLY masks real-world token spend. Mitigation: run on 5 items first, extrapolate, then full. Hard cap: stop if >$5.

**R3 — QA quality regression at real scale (C4).** Fixture cards look fine but real posts generate junk Qs. Mitigation: spot-check is mandatory gate. If <70% useful, revise prompts before Phase 5.

**R4 — Reviewer silence (T7).** N=5 async means some won't respond. Mitigation: over-invite (DM 7–8 to get 5 back). Forced-choice lowers effort; should get ≥3 responses in 48h.

**R5 — Pretendard webfont size.** ~150kb full family. Mitigation: subset to weights 400/500/700, Korean + Latin only, ~40kb.

**R6 — Politeness bias even with forced-choice.** Close friends still lie. Mitigation: include ≥2 weak-tie reviewers (acquaintances, not best friends). Weight their answers heavier.

**R7 — Hand-rolled CSS drift.** Without a linter, tokens.css can diverge from component usage. Mitigation: single source of truth (`--color-*`, `--space-*`) and grep-audit for hex literals before shipping.

---

## 7. Success criteria

### Phase 4.5 gate
- ≥10 posts + ≥20 notes in `content/` and indexed
- Live pipeline runs green end-to-end on real content
- QA spot-check ≥70% "useful" on 20-card sample
- LLM spend under $5

### Phase 5 gate
- **Design audit rerun** shows ≥B average across hierarchy/typography/spacing/color/content (currently C/F/F/B/C).
- **Lighthouse** on 4 pages: Performance ≥90, Accessibility ≥95, Best Practices ≥95, SEO ≥95.
- **WCAG contrast**: all body text ≥4.5:1, headings ≥7:1.
- **≥3 of 5 reviewers** answer the forced-choice question with a specific name. At least 1 names a weak-tie (not close friend).
- **Zero functional regressions**: all 126 tests still pass. Build smoke green.
- **Bundle size**: total initial page weight ≤100kb gzipped (incl. fonts, JS islands).

---

## 8. Timeline

### Phase 4.5 (content — user wall-clock)
- Week of 2026-04-20: C0 audit + C1/C2 writing/import (~1 week user time)
- 2026-04-27: C3 live pipeline + C4 spot-check + C5 fixes if any (~2h CC)
- **4.5 gate:** content + pipeline green

### Phase 5 (polish — CC time, revised order)
- Day 0 (2026-04-27): **P0 test infra + P1 site URL lock** (~1h) — pre-reqs, blocks all else
- Day 1 (2026-04-28): T0 tokens + T0.5 token migration + T1 fonts + **T7 outreach started async** (~2h + async)
- Day 2 (2026-04-29): **T4 QA chips** (FIRST — embedded in T2) + T2 homepage (~2h)
- Day 3 (2026-04-30): T3 article + T10 404.astro (~1.25h)
- Day 4 (2026-05-01): T5 responsive + T6 a11y+axe-core (~2.25h)
- Day 5+ (2026-05-02+): T8 reviewer ingest (async-gated, ≥3 responses required), T9 retro (~1.25h)

**Total active CC time across both phases: ~12.5h (Phase 4.5 ~2h + Phase 5 ~10.5h). User writing time: ~1 week for C1/C2.**

---

## 9. Validation plan

- Per-task: visual diff (before/after screenshot), no test regressions, tsc clean
- Mid-phase (after T3): internal QA pass using `/qa` skill
- End-of-phase: design audit via `/design-review`, Lighthouse run, external reviewer

---

## 10. Open questions (for Design + Eng review)

1. ~~Tailwind 4 vs 3~~ — **resolved: hand-rolled CSS vars**
2. Pretendard vs system Korean fallback — is the 40kb worth it?
3. ~~Graph node encoding~~ — **resolved: deferred to Phase 6**
4. Dark mode default — light, dark, or system? (leaning system)
5. Reading-time badge on notes — useful or noise?
6. Long-answer truncate threshold — 3 lines? 200 chars? Something else?
7. QA-first hero: how many sample chips above fold? (3? 6? 10?)
8. Forced-choice question wording — is "who would you share this with" too invasive? Alt: "would you bookmark this, and for what purpose?"
9. Reviewer selection: all Korean audience or mixed? (content is partly Korean)
10. Live-pipeline $ budget: is $5 cap realistic for ~40 items?

---

## 11. Phase 1 — CEO Review findings (2026-04-19)

CEO review (Claude opus subagent) returned 6/6 NO on consensus. Summary:

- **Premise P1 invalid** — polish is not the bottleneck; content volume is. Site has only 2 posts. No CSS can rescue an empty site.
- **Premise P4 invalid** — N=1–2 reviewers + open-ended question is dominated by politeness bias. Need N≥5 + forced-choice.
- **Scope miscalibrated** — 11 tasks, only 4 are load-bearing for share-readiness (homepage, article, QA chips, tokens). Graph + OG redesign are rabbit holes for this sprint.
- **Tailwind 4 is overkill** for this surface and adds beta risk. Hand-rolled CSS variables are faster and safer.
- **Budget 2x optimistic** on graph + OG tasks specifically.
- **6-month regret likely** if shipped as drafted: polished site with 2 posts gets dismissed as a demo, not a blog.

### Premise Gate (passed 2026-04-19)
User answers:
1. Core premise: **Content sprint first** (split into 4.5 then 5) ✅
2. Reviewer plan: **5 reviewers + forced-choice** ✅
3. CSS tooling: **Hand-rolled CSS variables** ✅
4. Hero framing: **QA-first hero** ✅

All four decisions are reflected in §2/§3/§4/§6/§7/§8 above.

---

## 12. Phase 2 — Design Review findings (2026-04-19, Claude opus subagent)

### Verdicts
| Dim | Area | Verdict |
|-----|------|---------|
| D1 | Hierarchy / IA | RISK — QA hero works only if 4.5 ships ≥10 posts; add posts-strip below hero |
| D2 | Typography | FIX — Pretendard subset at 40kb is optimistic; drop weight 500, Hangul-only, single-weight 400 realistic at ~50kb |
| D3 | Color & contrast | FIX — `#0066ff` reads as SaaS; `muted #737373` on dark at 12px fails AA; add `--color-focus-ring` separate from accent |
| D4 | Spacing rhythm | OK — but add `space-5 = 20px` to scale (paragraph gap) |
| D5 | Component cohesion | FIX — existing `notes/[slug].astro` + `QAChips` already have hardcoded hex/inline styles; add token prefix + grep gate |
| D6 | Responsive & mobile | RISK — T5 45min optimistic; search input needs 44px tap target; 360px chip wrapping pushes posts-strip below fold |
| D7 | Reviewer forced-choice | RISK — "who would you share with" still has escape hatches; add "paste the exact DM text OR explicitly decline" |

### Design-level fixes to integrate
1. §4 T2 — add ranking rule for top-6 chips (`tier=global ORDER BY rank DESC`) and a posts-strip directly below hero within first viewport
2. §4 T1 + §5 + §7 — Pretendard Hangul-only, weight 400 + 700 (drop 500), budget ≤50kb per weight; update bundle budget with per-font sub-limit
3. §5 — swap accent `#0066ff` → signature ink (e.g. `#1d4ed8` or warmer); add `--color-focus-ring` at ≥3:1 vs border; add `--color-muted-on-dark: #8a8a8a` for 12px AA
4. §5 — insert `space-5 = 1.25rem` (20px)
5. §4 T0 — token naming prefix `--meshblog-*`, pre-commit grep gate against hex literals outside tokens.css
6. §4 T0.5 NEW — migrate hardcoded values in `notes/[slug].astro` + `QAChips` to tokens
7. §4 T4 — search input `min-height: 44px`, full-width <768 / max 480px ≥768
8. §4 T2 — at 360px show top 4 chips (not 6); §8 Timeline — run T4 (QA chips polish) BEFORE T2 (homepage) to avoid circular restyle
9. §4 T7 — rewrite forced-choice question: *"Name one specific person you'd send this URL to in the next 7 days, and paste the exact DM text you'd write. Explicit no is also valid."* Add reviewer roster rule: ≥2 weak-ties (author DM'd <5× in last year)
10. §4 C4 — add 3-criterion "useful" rubric (factual / non-trivial / well-phrased, 2-of-3 = pass)

### Open design questions bubbled up for user
- Accent color: generic blue vs signature ink (taste call)
- Reviewer pool KO/EN mix (affects Pretendard justification)
- Is "paste the exact DM" too invasive and will drop response rate from 3/5 to 2/5?
- Long-answer truncate: 3-line CSS clamp confirmed (= ~195 chars @ 65ch)
- Dark-mode default: light SSR with `prefers-color-scheme: dark` override (no-flash)

---

## 13. Phase 3 — Eng Review findings (2026-04-19, Claude opus subagent)

### Verdicts
| Dim | Area | Verdict |
|-----|------|---------|
| E1 | Pipeline at real scale | RISK — plan misattributes LLM cost model: `generate-qa` shells to local `claude` CLI (Anthropic plan, not $); real $-cost is ~$0.25 for ~40 items (gpt-4o-mini entity extraction + embeddings). $5 cap safe but for wrong reason. Add pre-flight 3-item dry run |
| E2 | QAChips hydration budget | FIX — `client:load` will violate 100kb budget; react+react-dom ~45kb gz + Fuse ~12kb gz + Pretendard ~40kb = ~100kb before anything else. **Use `client:idle` + lazy-import Fuse inside first keystroke** |
| E3 | Test gate sufficiency | RISK — axe-core NOT installed; T6 is new infra not a one-line add; build-smoke h1 assertion will break when T2 changes hero; no bundle-size test; `fixture-mode.test.ts` + `build-smoke.test.ts` DB race still unfixed from Phase 3 |
| E4 | CSS vars architecture | RISK — Pretendard via `<link>` on Korean-majority text flashes + CLS; use `<link rel="preload" as="font" type="font/woff2" crossorigin>` + `font-display: swap` + `size-adjust` descriptor; tokens.css imported from Base.astro (not per-page); `@import` is render-blocking, use native link order |
| E5 | Pretendard delivery | FIX — 40kb is *per weight* optimistic; 3 weights × Hangul+Latin subset = 120-240kb. Specify: self-hosted, weight 400 only (+ optionally 700), Korean+Latin unicode-range split, preload |
| E6 | Deploy + URL plumbing | FIXED 2026-04-19 — Set `site: 'https://qkdwodus777.github.io'` + `base: '/meshblog'` in `astro.config.mjs`; added `src/lib/url.ts::withBase()` helper; refactored root-absolute hrefs in index/posts/notes/404/graph pages + GraphView.tsx. Earlier E6 claim that "subpath is a no-go without base refactor" was true but refactor was ~30min, not impossible — see §14 correction |

### Eng-level fixes to integrate
1. **Pre-T0 NEW task: Test infra setup** — install axe-core + happy-dom, add bundle-size budget test on `dist/_astro/*.js`, fix build-smoke/fixture-mode DB race, update build-smoke h1 assertion scheduled post-T2 (~45min)
2. **Pre-C3 NEW task: Set site URL** — add `site: 'https://…'` to `astro.config.mjs`, re-run `build-og` + `build-rss` so atom.xml and OG images carry correct absolute URLs (~15min)
3. **T2 refactor**: QAChips uses `client:idle` (not `client:load`); lazy-import Fuse on first keystroke
4. **T1 rewrite**: self-hosted single-weight 400 Pretendard Hangul+Latin subset, preloaded, unicode-range split, `font-display: swap`, `size-adjust` (+15min)
5. **T6 rewrite**: axe-core infra is new, not one-line (+30min)
6. **C3 pre-flight**: add "run on 3 items, log spend, extrapolate" as explicit subtask
7. Document: `claude -p` is Anthropic-plan-metered not $; commit `.data/qa/` JSON for deploy since generate-qa can't run on CI
8. Add 404.astro custom page (called out in Phase 3 retro §6, architecture.md:111) — not in current plan

### Missing tasks
- Pre-T0 test infra
- Pre-C3 site URL setup
- 404.astro
- Fix `fixture-mode.test.ts` ↔ `build-smoke.test.ts` DB race (Phase 3 carryover)

### Budget reality check
**Original: 8h CC. Revised: 10–11h active.** Under-budgets:
- T1 30m→60m, T6 30m→60m, T7 30m→60m
- +45m test infra pre-task, +15m site URL pre-task, +15m client:idle/Fuse lazy
- If held to 8h, casualties will be T6 (axe-core cut), T5 (rushed responsive), or T8 (reviewer ingest deferred)

---

## 14. Phase 4 — Final Approval Gate (PASSED 2026-04-19)

### User decisions at Final Gate
1. **Fix scope**: Apply ALL recommended fixes (adds ~2.5h budget, closes every named gap)
2. **Accent color**: Deeper ink blue `#1d4ed8` (swapped from `#0066ff`)
3. **Reviewer question**: Name + DM text + explicit-no permitted
4. **Deploy target**: ~~Vercel apex `meshblog.vercel.app`~~ → **Reverted to GitHub Pages** (`qkdwodus777.github.io/meshblog`) on 2026-04-19 after user audit. See correction below.

All four decisions reflected in §4 (tasks), §5 (tokens), §8 (timeline). Plan is now actionable.

### Correction 2026-04-19 — deploy target reverted to GitHub Pages

User audit flagged drift from original PRD (`Hosted on github.io`, `/publish → gh-pages push`) into Vercel. Trigger was E6 reviewer framing "subpath is a no-go without base refactor" — which ruled github.io out without surfacing the actual cost (20-30 min base path wiring). User never saw "github.io + base refactor" as an option at Final Gate.

**Remediation applied:**
- `astro.config.mjs` → `site: 'https://qkdwodus777.github.io'` + `base: '/meshblog'`
- `src/lib/url.ts::withBase()` — BASE_URL-aware path helper
- Refactored root-absolute hrefs: `src/pages/{index,404,graph}.astro`, `src/pages/{posts,notes}/[slug].astro`, `src/components/GraphView.tsx`
- `src/layouts/Base.astro` — font/favicon/atom/nav hrefs base-prefixed
- `scripts/build-rss.ts` fallback SITE → github.io
- `package.json` build script → `NODE_ENV=production astro build` (React prod build drops bundle from 145→92 KB gz)
- `test/responsive.test.ts` — `extractLinkedCSS` strips base prefix to find dist files
- `.github/workflows/deploy.yml` — already pointed at gh-pages (never switched, only plan doc drifted)

**Verified:** 28/28 tests pass (smoke + bundle + responsive). Bundle: 92 KB gz total, 58 KB max single file. Atom.xml URLs + built hrefs all use `qkdwodus777.github.io/meshblog/...`.

### Consensus themes
- **Bundle budget (≤100kb gz) is the single biggest tension.** Design wants Pretendard + all weights; Eng says realistic is 1 weight / 40kb. Both agree: lazy Fuse + `client:idle` QAChips + single-weight Pretendard are non-optional if the budget holds.
- ~~**Deploy URL must be locked before any artifact rebuild.** Vercel apex or custom domain; GitHub Pages subpath is out.~~ **[SUPERSEDED 2026-04-19]** — See §14 correction. GitHub Pages subpath works with `base: '/meshblog'` + `withBase()` helper. Vercel pivot was drift.
- **"Share-worthy" verdict hinges on content volume + reviewer question design together.** Weak content + good question = reviewers decline cleanly; good content + weak question = fake-positive noise. Fix both.
- **Test infra gap is a real gate.** axe-core + bundle-size budget + smoke-h1 migration are all new, and must precede T0.
- **Taste calls only the user can make:** accent color, reviewer pool KO/EN mix, DM-text friction vs response rate.

### Recommended plan diffs (to apply if user accepts)
1. Add **Pre-T0 Test Infra** task (~45min)
2. Add **Pre-C3 Site URL Lock** task (~15min)
3. Add **T0.5 Token Migration** task (migrate hardcoded hex in existing components)
4. Add **T10 404.astro** task (~15min)
5. Rewrite T1 (Pretendard delivery specifics) + T2 (`client:idle` + lazy Fuse + ranked chips + posts-strip) + T4 first in §8 timeline + T7 (revised forced-choice question)
6. Swap accent `#0066ff` → `#1d4ed8` pending user taste call
7. Update §5 with `space-5`, `--color-focus-ring`, `--color-muted-on-dark`
8. Update budget §4 total: 8h → ~10.5h
9. Update §7 bundle budget with per-font sub-limit

_Plan approved and actionable. Next step: begin Phase 4.5 C0 content audit (user-driven) or P0 test infra (CC-driven, can start in parallel)._

---

## 14. Phase 4 — Final Approval Gate

_Pending phases 2 + 3._

---

_Plan mid-`/autoplan`. Phase 1 complete, premise gate passed, phases 2 + 3 next._
