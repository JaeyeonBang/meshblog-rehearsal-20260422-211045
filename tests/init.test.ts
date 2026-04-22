/**
 * tests/init.test.ts — D1 regression: EPERM symlink fallback
 *
 * Mocks fs.symlinkSync to throw { code: 'EPERM' }, then verifies that
 * linkVault() falls back to fs.cpSync + fs.watch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs"

// We import the helper after setting up vi.mock so the module is mocked.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>()
  return {
    ...actual,
    symlinkSync: vi.fn(),
    cpSync: vi.fn(),
    watch: vi.fn().mockReturnValue({ close: vi.fn() }),
    existsSync: vi.fn(),
    lstatSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
  }
})

// Import AFTER mock setup
import { linkVault } from "../scripts/init.ts"

const VAULT = "/fake/vault"
const TARGET = "/fake/content/notes"

describe("linkVault — EPERM fallback", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Default: target does not exist (no cleanup needed)
    vi.mocked(fs.existsSync).mockReturnValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("calls symlinkSync on the happy path", () => {
    vi.mocked(fs.symlinkSync).mockImplementation(() => undefined)

    linkVault(VAULT, TARGET)

    expect(fs.symlinkSync).toHaveBeenCalledWith(VAULT, TARGET, "dir")
    expect(fs.cpSync).not.toHaveBeenCalled()
    expect(fs.watch).not.toHaveBeenCalled()
  })

  it("falls back to cpSync when symlinkSync throws EPERM", () => {
    const eperm = Object.assign(new Error("EPERM"), { code: "EPERM" })
    vi.mocked(fs.symlinkSync).mockImplementation(() => { throw eperm })
    vi.mocked(fs.cpSync).mockImplementation(() => undefined)

    linkVault(VAULT, TARGET)

    expect(fs.cpSync).toHaveBeenCalledWith(VAULT, TARGET, { recursive: true })
  })

  it("registers fs.watch on the vault path after EPERM", () => {
    const eperm = Object.assign(new Error("EPERM"), { code: "EPERM" })
    vi.mocked(fs.symlinkSync).mockImplementation(() => { throw eperm })
    vi.mocked(fs.cpSync).mockImplementation(() => undefined)

    linkVault(VAULT, TARGET)

    expect(fs.watch).toHaveBeenCalledWith(
      VAULT,
      { recursive: true },
      expect.any(Function),
    )
  })

  it("falls back to cpSync when symlinkSync throws EACCES", () => {
    const eacces = Object.assign(new Error("EACCES"), { code: "EACCES" })
    vi.mocked(fs.symlinkSync).mockImplementation(() => { throw eacces })
    vi.mocked(fs.cpSync).mockImplementation(() => undefined)

    linkVault(VAULT, TARGET)

    expect(fs.cpSync).toHaveBeenCalledWith(VAULT, TARGET, { recursive: true })
    expect(fs.watch).toHaveBeenCalledWith(VAULT, { recursive: true }, expect.any(Function))
  })

  it("re-throws unexpected errors (not EPERM/EACCES)", () => {
    const unknown = Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    vi.mocked(fs.symlinkSync).mockImplementation(() => { throw unknown })

    expect(() => linkVault(VAULT, TARGET)).toThrow("ENOENT")
    expect(fs.cpSync).not.toHaveBeenCalled()
  })

  it("removes an existing symlink at target before re-linking", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as fs.Stats)
    vi.mocked(fs.symlinkSync).mockImplementation(() => undefined)

    linkVault(VAULT, TARGET)

    expect(fs.unlinkSync).toHaveBeenCalledWith(TARGET)
    expect(fs.symlinkSync).toHaveBeenCalledWith(VAULT, TARGET, "dir")
  })
})
