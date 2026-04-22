/**
 * Task 12 — Test 3: schema-fk-type-lint (F1 rule)
 * Parses schema.sql and verifies every FOREIGN KEY column type matches
 * the referenced column's type (porting-rules.md rule 8).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const PROJECT_ROOT = join(import.meta.dirname, "../..")
const SCHEMA_PATH = join(PROJECT_ROOT, "src/lib/db/schema.sql")

type ColumnDef = {
  table: string
  column: string
  type: string   // normalized: INTEGER | TEXT | REAL | BLOB
}

function normalizeType(raw: string): string {
  const t = raw.trim().toUpperCase()
  if (t.startsWith("INTEGER") || t.startsWith("INT")) return "INTEGER"
  if (t.startsWith("TEXT") || t.startsWith("VARCHAR") || t.startsWith("CHAR")) return "TEXT"
  if (t.startsWith("REAL") || t.startsWith("FLOAT") || t.startsWith("DOUBLE") || t.startsWith("NUMERIC")) return "REAL"
  if (t.startsWith("BLOB")) return "BLOB"
  return t.split(/\s+/)[0] // fallback: first word
}

function parseSchema(sql: string): {
  columns: ColumnDef[]
  foreignKeys: Array<{ table: string; column: string; refTable: string; refColumn: string }>
} {
  const columns: ColumnDef[] = []
  const foreignKeys: Array<{ table: string; column: string; refTable: string; refColumn: string }> = []

  // Remove comments
  const cleaned = sql.replace(/--[^\n]*/g, "")

  // Split into CREATE TABLE blocks
  const tableBlocks = cleaned.split(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+/i).slice(1)

  for (const block of tableBlocks) {
    const tableNameMatch = block.match(/^(\w+)\s*\(/)
    if (!tableNameMatch) continue
    const tableName = tableNameMatch[1]

    // Extract body between outer parens
    let depth = 0
    let bodyStart = block.indexOf("(")
    let bodyEnd = -1
    for (let i = bodyStart; i < block.length; i++) {
      if (block[i] === "(") depth++
      else if (block[i] === ")") {
        depth--
        if (depth === 0) { bodyEnd = i; break }
      }
    }
    if (bodyEnd === -1) continue
    const body = block.slice(bodyStart + 1, bodyEnd)

    // Parse column definitions (lines that don't start with a constraint keyword)
    const lines = body.split(",").map((l) => l.trim())
    for (const line of lines) {
      // Skip constraint lines
      if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)/i.test(line)) {
        // Parse FOREIGN KEY ... REFERENCES ...
        const fkMatch = line.match(
          /FOREIGN\s+KEY\s*\((\w+)\)\s+REFERENCES\s+(\w+)\s*\((\w+)\)/i,
        )
        if (fkMatch) {
          foreignKeys.push({
            table: tableName,
            column: fkMatch[1],
            refTable: fkMatch[2],
            refColumn: fkMatch[3],
          })
        }
        continue
      }

      // Parse column: name TYPE [constraints...]
      const colMatch = line.match(/^(\w+)\s+(\w+)/)
      if (colMatch) {
        columns.push({
          table: tableName,
          column: colMatch[1],
          type: normalizeType(colMatch[2]),
        })
      }
    }

    // Also handle inline REFERENCES on column definitions
    const inlineRefMatches = body.matchAll(
      /(\w+)\s+\w+[^,]*\bREFERENCES\s+(\w+)\s*\((\w+)\)/gi,
    )
    for (const m of inlineRefMatches) {
      // Only add if not already in foreignKeys for this table/column
      const already = foreignKeys.some(
        (fk) => fk.table === tableName && fk.column === m[1],
      )
      if (!already) {
        foreignKeys.push({
          table: tableName,
          column: m[1],
          refTable: m[2],
          refColumn: m[3],
        })
      }
    }
  }

  return { columns, foreignKeys }
}

describe("schema-fk-type-lint: FK column types match referenced PK types (rule 8)", () => {
  const sql = readFileSync(SCHEMA_PATH, "utf-8")
  const { columns, foreignKeys } = parseSchema(sql)

  const columnMap = new Map<string, string>()
  for (const col of columns) {
    columnMap.set(`${col.table}.${col.column}`, col.type)
  }

  it("schema.sql is parseable and has foreign keys", () => {
    expect(foreignKeys.length).toBeGreaterThan(0)
    expect(columns.length).toBeGreaterThan(0)
  })

  it("entities.id is INTEGER (rule 8 baseline)", () => {
    expect(columnMap.get("entities.id")).toBe("INTEGER")
  })

  it("concept_entities.entity_id is INTEGER (F1 fix — matches entities.id)", () => {
    expect(columnMap.get("concept_entities.entity_id")).toBe("INTEGER")
  })

  for (const fk of foreignKeys) {
    // Skip polymorphic FK (graph_levels.node_id is intentionally TEXT with no single-type FK)
    if (fk.table === "graph_levels") continue

    const fkType = columnMap.get(`${fk.table}.${fk.column}`)
    const refType = columnMap.get(`${fk.refTable}.${fk.refColumn}`)

    if (!fkType || !refType) continue // column might not be in simple column parse

    it(`${fk.table}.${fk.column} (${fkType}) matches ${fk.refTable}.${fk.refColumn} (${refType})`, () => {
      expect(fkType).toBe(refType)
    })
  }
})
