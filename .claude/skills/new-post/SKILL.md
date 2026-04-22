---
name: new-post
description: Scaffold a new note in content/notes/ with standard frontmatter (draft:true by default)
---

# /new-post

Scaffold a new note in `content/notes/` with the standard frontmatter. Safe to run anytime — new notes are `draft: true` by default so they won't leak to production until you explicitly flip the flag.

## What it does
1. Asks for the note title.
2. Slugifies it to `content/notes/{slug}.md`.
3. Writes the frontmatter template (draft: true, empty tags/aliases, no level_pin).

## Run
`bun run scripts/new-post.ts "My Note Title"`
