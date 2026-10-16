import { DatabaseSync } from 'node:sqlite'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
export const dataDir = resolve(process.env.DATA_DIR || '.data')
mkdirSync(resolve(dataDir, 'audio'), { recursive: true, mode: 0o700 })
export const db = new DatabaseSync(resolve(dataDir, 'westrock.sqlite'))
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;')
db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
if (
  !(db.prepare('PRAGMA table_info(reports)').all() as { name: string }[]).some(
    (c) => c.name === 'revision',
  )
)
  db.exec('ALTER TABLE reports ADD COLUMN revision INTEGER NOT NULL DEFAULT 0')
// Rows cross a schema-validated API boundary; SQLite returns dynamic record types.
export const all = (sql: string, ...params: any[]): any[] =>
  db.prepare(sql).all(...params)
export const one = (sql: string, ...params: any[]): any =>
  db.prepare(sql).get(...params)
export const run = (sql: string, ...params: any[]) =>
  db.prepare(sql).run(...params)
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const value = fn()
    db.exec('COMMIT')
    return value
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

if (
  !(db.prepare('PRAGMA table_info(reports)').all() as { name: string }[]).some(
    (c) => c.name === 'submitted_at',
  )
)
  db.exec('ALTER TABLE reports ADD COLUMN submitted_at TEXT')
