import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

test('permission migration preserves existing approved records and snapshots without granting project access', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'westrock-migration-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'westrock.sqlite')
  const schema = (
    await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8')
  )
    .replace(', submitted_at TEXT', '')
    .split('\n')
    .filter(
      (line) =>
        !line.startsWith('CREATE TABLE IF NOT EXISTS project_members') &&
        !line.startsWith('CREATE INDEX IF NOT EXISTS project_members_user'),
    )
    .join('\n')
  const legacy = new DatabaseSync(file)
  legacy.exec(schema)
  assert.ok(
    !(
      legacy.prepare('PRAGMA table_info(reports)').all() as { name: string }[]
    ).some((c) => c.name === 'submitted_at'),
  )
  const insert = (table: string, row: Record<string, string | number | null>) =>
    legacy
      .prepare(
        `INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(
          row,
        )
          .map(() => '?')
          .join(',')})`,
      )
      .run(...Object.values(row))
  insert('companies', {
    id: 'company',
    name: 'Legacy test company',
    created_at: '2026-01-01',
  })
  insert('users', {
    id: 'owner',
    company_id: 'company',
    name: 'Legacy owner',
    email: 'owner@example.test',
    password_hash: 'test-only',
    role: 'owner',
    active: 1,
    created_at: '2026-01-01',
  })
  insert('users', {
    id: 'pm',
    company_id: 'company',
    name: 'Legacy manager',
    email: 'pm@example.test',
    password_hash: 'test-only',
    role: 'project_manager',
    active: 1,
    created_at: '2026-01-01',
  })
  insert('projects', {
    id: 'project',
    job_number: '125',
    name: 'Legacy project',
    client: 'Client',
    state: 'CA',
    region: 'Bay Area',
    county: 'Alameda',
    city: 'Oakland',
    project_type: 'Sewer',
    start_date: '2026-01-01',
    end_date: null,
    contract_cents: 10000000,
    budget_cents: 8000000,
    primary_activity: 'Sewer',
    production_unit: 'LF',
    contract_quantity: '1000',
    status: 'active',
    notes: 'Original notes',
    created_at: '2026-01-01',
  })
  insert('reports', {
    id: 'report',
    project_id: 'project',
    author_id: 'pm',
    work_date: '2026-02-01',
    status: 'approved',
    transcript: 'Original source',
    audio_key: null,
    extraction_json: null,
    draft_json: '{"original":"draft"}',
    approved_json: '{"original":"verified"}',
    created_at: '2026-02-01',
    approved_at: '2026-02-02',
    approved_by: 'owner',
    revision: 3,
  })
  insert('cost_lines', {
    id: 'line',
    report_id: 'report',
    category: 'labor',
    label: 'Operator',
    quantity: '16',
    unit: 'HR',
    rate_id: 'legacy-rate',
    rate_source: 'Company labor rate',
    rate_snapshot_json: '{"base_cents":4000}',
    cost_cents: 64000,
  })
  const before = {
    report: legacy.prepare('SELECT * FROM reports').get(),
    lines: legacy.prepare('SELECT * FROM cost_lines').all(),
    users: legacy.prepare('SELECT * FROM users ORDER BY id').all(),
  }
  legacy.close()
  for (let i = 0; i < 2; i++)
    await promisify(execFile)(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        "const {db}=await import('./server/db.ts');db.close()",
      ],
      { env: { ...process.env, DATA_DIR: dir } },
    )
  const migrated = new DatabaseSync(file)
  try {
    const { submitted_at, ...after } = migrated
      .prepare('SELECT * FROM reports')
      .get() as Record<string, unknown>
    assert.equal(submitted_at, null)
    assert.deepEqual(after, { ...before.report })
    assert.deepEqual(
      migrated.prepare('SELECT * FROM cost_lines').all(),
      before.lines,
    )
    assert.deepEqual(
      migrated.prepare('SELECT * FROM users ORDER BY id').all(),
      before.users,
    )
    assert.equal(
      migrated.prepare('SELECT COUNT(*) AS count FROM project_members').get()!
        .count,
      0,
    )
  } finally {
    migrated.close()
  }
})
