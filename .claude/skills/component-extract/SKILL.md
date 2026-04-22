---
name: component-extract
description: Extract reusable Astro atoms/molecules/organisms from an HTML prototype. Use when given a new HTML design file to translate into the meshblog component library, or when inline markup should become a reusable component.
---

# component-extract

Translate HTML+CSS prototypes → scoped Astro components under `src/components/ui/{atoms,molecules,organisms}/`.

## Classification rubric

| Tier | Definition | Examples |
|---|---|---|
| Atom | Single HTML element (+ pseudo-elements), stateless | Button, Input, Kbd, Badge, Tag, Logo |
| Molecule | 2–6 atoms composed for one purpose; owns layout, no route logic | PostCard, NoteRow, QaCard, Pager, TOC, PullQuote |
| Organism | Composed section with state or global behavior | TopBar, Footer, CmdK, GraphControls |

## Steps

1. Read the prototype section (HTML + scoped CSS).
2. Name the component per `design-ref/SPEC.md` §4 (PascalCase file, matches role).
3. Extract props — anything that varies across usages becomes a prop. Define `interface Props` in frontmatter.
4. Write the `.astro` file:
   - Frontmatter: `export interface Props { ... }` + `const { ... } = Astro.props`
   - Template: HTML reproducing the prototype
   - `<style>` block: CSS scoped to this component (Astro scopes automatically)
5. Replace hex/legacy tokens — use `var(--ink)`, `var(--paper)`, etc. from SPEC §3. Run `grep -E '#[0-9a-fA-F]{3,6}' NewComponent.astro` → empty.
6. Use slots for variable content — default slot for primary, named slots for secondary.
7. Focus states — interactive atoms get `:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }`.
8. Import wherever used, verify in `bun run dev`.

## Do not

- Combine unrelated concerns in one component
- Use `!important` — if specificity fights, rename
- Add animation beyond `--dur-fast` / `--dur` / `--ease`
- Create a new shadow token — the only shadow is `--shadow-hard` on CmdK

## Output paths

```
src/components/ui/atoms/<Name>.astro
src/components/ui/molecules/<Name>.astro
src/components/ui/organisms/<Name>.astro
```
