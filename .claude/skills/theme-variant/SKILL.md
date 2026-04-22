---
name: theme-variant
description: Swap the active design.md between preset variants (A Editorial B&W, B Paper & Ink Warm, C Newspaper Dense). Use when user wants to preview or adopt a different overall aesthetic without hand-editing tokens.
---

# theme-variant

Three presets live in `design.variants/`. Activating one = copy it to `design.md` → regenerate.

## Available variants

| ID | Name | Character |
|---|---|---|
| a | Editorial B&W | `#000` / `#fff`, Fraunces, hairlines, hover-invert (default) |
| b | Paper & Ink Warm | OKLCH warm paper (h=85°), indigo accent, same editorial layout |
| c | Newspaper Dense | B&W but tighter — 36ch prose, 15px body, 12px base space |

## Swap command

```bash
cd /mnt/d/projects/meshblog
cp design.variants/a.md design.md       # or b.md / c.md
bun run build-tokens
bun run dev
```

## Steps

1. Confirm target with user: A / B / C
2. Back up current if user has unsaved customizations:
   ```bash
   cp design.md design.variants/_user-backup.md
   ```
3. Copy variant → design.md:
   ```bash
   cp design.variants/<id>.md design.md
   ```
4. Regenerate:
   ```bash
   bun run build-tokens
   ```
5. Verify:
   ```bash
   head -20 src/styles/tokens.css
   ```
6. Preview:
   ```bash
   bun run dev
   ```

## After-swap sanity check

- Home page hero still fits (`--fs-hero` clamp)
- Article prose readable (`--w-prose` ≥ 36ch, `--fs-lg` ≥ 15px)
- Hover-invert still contrasts (dark variants may need `--rule-soft` bump)
- ⌘K overlay still visible on new background

## Create a new variant

1. `cp design.variants/a.md design.variants/d.md`
2. Edit frontmatter `name:` and token overrides
3. Document character in `# {name}` body
4. Add to this file's table
5. Activate via steps above

## Reverting

```bash
cp design.variants/a.md design.md && bun run build-tokens
```
