import { readdirSync } from "node:fs"
import { join } from "node:path"

export type DiscoveredFile = { path: string; folder: string }

export interface DiscoverOptions {
  skipUnderscore?: boolean
}

/**
 * Walk one or more base directories and return all `.md` files found.
 *
 * @param baseDirs  Directories to search (silently skipped when unreadable).
 * @param opts.skipUnderscore  When true (default), files whose names start
 *   with `_` are excluded — matching the behaviour of build-index.ts.
 *   Pass `{ skipUnderscore: false }` to include them (e.g. audit-drafts).
 */
export function discoverMarkdown(
  baseDirs: string[],
  opts?: DiscoverOptions,
): DiscoveredFile[] {
  const skipUnderscore = opts?.skipUnderscore ?? true
  const found: DiscoveredFile[] = []
  for (const dir of baseDirs) {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (skipUnderscore && name.startsWith("_")) continue
      if (!name.endsWith(".md")) continue
      found.push({ path: join(dir, name), folder: dir })
    }
  }
  return found
}
