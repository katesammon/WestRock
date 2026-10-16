import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout } from 'node:timers/promises'

test(
  'authenticated project → reviewed report → immutable historical observation',
  { timeout: 30000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'westrock-test-')),
      port = 31000 + Math.floor(Math.random() * 10000)
    const server = spawn(
      process.execPath,
      ['--import', 'tsx', 'server/index.ts'],
      {
        env: {
          ...process.env,
          DATA_DIR: dir,
          PORT: String(port),
          NODE_ENV: 'test',
          AI_API_KEY: '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let logs = ''
    server.stdout.on('data', (d) => (logs += d))
    server.stderr.on('data', (d) => (logs += d))
    t.after(async () => {
      server.kill('SIGTERM')
      await once(server, 'exit')
      await rm(dir, { recursive: true, force: true })
    })
    const base = `http://127.0.0.1:${port}/api`
    for (let n = 0; n < 100; n++) {
      try {
        if ((await fetch(base + '/health')).ok) break
      } catch {}
      await setTimeout(50)
      if (n === 99) throw new Error(logs)
    }
    let cookie = ''
    async function request(
      path: string,
      method = 'GET',
      body?: unknown,
      expected = 200,
      session = cookie,
    ) {
      const response = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: session },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const value = (await response.json()) as any
      assert.equal(
        response.status,
        expected,
        JSON.stringify(value) + '\n' + logs,
      )
      return {
        value,
        cookie: response.headers.get('set-cookie')?.split(';')[0] || '',
      }
    }
    await request('/projects', 'GET', undefined, 401)
    const first = await request(
      '/auth/setup',
      'POST',
      {
        name: 'Test owner',
        company: 'Test construction',
        email: 'owner@example.test',
        password: 'correct-test-password',
      },
      201,
    )
    cookie = first.cookie
    await request(
      '/auth/setup',
      'POST',
      {
        name: 'Second owner',
        company: 'Another',
        email: 'second@example.test',
        password: 'correct-test-password',
      },
      409,
    )
    const cross = await fetch(base + '/classifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://other.example',
      },
      body: JSON.stringify({ name: 'Invalid', union_type: 'Union' }),
    })
    assert.equal(cross.status, 403)
    const { value: classification } = await request(
      '/classifications',
      'POST',
      { name: 'Operator', union_type: 'Union' },
      201,
    )
    const { value: rate } = await request(
      '/labor-rates',
      'POST',
      {
        classification_id: classification.id,
        effective_date: '2026-01-01',
        base: '40',
        pension: '10',
        health: '5',
        vacation: '5',
        training: '0',
        other_fringe: '0',
        payroll: '5',
        burden: '5',
        ot_multiplier: '1.5',
        dt_multiplier: '2',
      },
      201,
    )
    await request(
      '/labor-rates',
      'POST',
      {
        classification_id: classification.id,
        effective_date: '2026-06-01',
        base: '45',
        pension: '10',
        health: '5',
        vacation: '5',
        training: '0',
        other_fringe: '0',
        payroll: '5',
        burden: '5',
        ot_multiplier: '1.5',
        dt_multiplier: '2',
      },
      400,
    )
    const { value: equipment } = await request(
      '/items',
      'POST',
      { code: 'EX-1', name: 'Excavator', category: 'equipment', unit: 'HR' },
      201,
    )
    const { value: material } = await request(
      '/items',
      'POST',
      { code: 'AG-1', name: 'Aggregate', category: 'material', unit: 'TON' },
      201,
    )
    const { value: disposal } = await request(
      '/items',
      'POST',
      { code: 'DS-1', name: 'Clean spoils', category: 'disposal', unit: 'CY' },
      201,
    )
    await request(
      '/item-rates',
      'POST',
      {
        item_id: equipment.id,
        effective_date: '2026-01-01',
        rate: '0',
        derived: true,
        annual_ownership: '120000',
        annual_operating: '80000',
        annual_utilization: '2000',
      },
      201,
    )
    await request(
      '/item-rates',
      'POST',
      { item_id: material.id, effective_date: '2026-01-01', rate: '50' },
      201,
    )
    await request(
      '/item-rates',
      'POST',
      { item_id: disposal.id, effective_date: '2026-01-01', rate: '25' },
      201,
    )
    const { value: project } = await request(
      '/projects',
      'POST',
      {
        job_number: '125',
        name: 'Test sewer',
        client: 'Test client',
        state: 'CA',
        region: 'Bay Area',
        county: 'Alameda',
        city: 'Oakland',
        project_type: 'Sewer',
        start_date: '2026-01-01',
        contract: '1000000',
        budget: '800000',
        primary_activity: '8-inch PVC sewer',
        production_unit: 'LF',
        contract_quantity: '12400',
        status: 'active',
      },
      201,
    )
    await request(
      `/projects/${project.id}/rates`,
      'POST',
      {
        item_id: material.id,
        effective_date: '2026-01-01',
        rate: '35',
        source_note: 'Test job quote',
      },
      201,
    )
    const { value: report } = await request(
      '/reports',
      'POST',
      { project_id: project.id, work_date: '2026-02-02' },
      201,
    )
    const empty = (await request(`/reports/${report.id}/calculate`, 'POST'))
      .value
    assert.ok(empty.errors.length >= 3)
    await request(
      `/reports/${report.id}/approve`,
      'POST',
      { revision: 0, calculation_hash: '0'.repeat(64) },
      400,
    )
    const draft = {
      activity: '8-inch PVC sewer',
      quantity: '400',
      unit: 'LF',
      workday_hours: '8',
      depth: '9',
      conditions: 'Dry soil',
      labor: [
        {
          classification_id: classification.id,
          workers: 6,
          regular: '8',
          overtime: '0',
          doubletime: '0',
        },
      ],
      usage: [
        { item_id: equipment.id, quantity: '8' },
        { item_id: material.id, quantity: '40' },
        { item_id: disposal.id, quantity: '60' },
      ],
      attribution_confirmed: true,
    }
    await request(`/reports/${report.id}`, 'PUT', {
      transcript: 'Test fixture only, not company data.',
      draft,
      revision: 0,
    })
    const cost = (await request(`/reports/${report.id}/calculate`, 'POST'))
      .value
    assert.deepEqual(cost.errors, [])
    assert.equal(cost.total_cents, 706000)
    assert.equal(cost.unit_cost_cents, '1765')
    assert.equal(cost.production_per_hour, '50')
    assert.equal(
      cost.lines.find((l: any) => l.category === 'material').rate_source,
      'Project override',
    )
    await request(
      `/reports/${report.id}/approve`,
      'POST',
      { revision: 0, calculation_hash: cost.calculation_hash },
      409,
    )
    await request(
      `/reports/${report.id}`,
      'PUT',
      { transcript: 'stale draft', draft, revision: 0 },
      409,
    )
    await request(`/reports/${report.id}/approve`, 'POST', {
      revision: cost.revision,
      calculation_hash: cost.calculation_hash,
    })
    await request(
      `/reports/${report.id}/approve`,
      'POST',
      { revision: 0, calculation_hash: '0'.repeat(64) },
      400,
    )
    await request(
      `/reports/${report.id}`,
      'PUT',
      { transcript: 'overwrite', draft, revision: 1 },
      400,
    )
    const result = (
      await request(
        '/observations?region=Bay%20Area&activity=8-inch%20PVC%20sewer',
      )
    ).value
    assert.equal(result.observations.length, 1)
    assert.equal(result.groups[0].weighted, 1765)
    assert.equal(result.observations[0].county, 'Alameda')
    assert.equal(
      (await request('/observations?region=Central%20Valley')).value
        .observations.length,
      0,
    )
    await request(
      `/rates/labor/${rate.id}/close`,
      'POST',
      { expiration_date: '2026-02-01' },
      400,
    )
    await request(`/rates/labor/${rate.id}/close`, 'POST', {
      expiration_date: '2026-02-28',
    })
    const after = (await request(`/reports/${report.id}`)).value
    assert.equal(after.observation.total_cents, 706000)
    assert.equal(after.lines.length, 4)
    assert.equal(after.approved.values.quantity, '400')
    const { value: next } = await request(
      '/reports',
      'POST',
      { project_id: project.id, work_date: '2026-02-03' },
      201,
    )
    assert.equal(
      (await request(`/reports/${next.id}`)).value.previous.id,
      report.id,
    )
    await request(`/reports/${next.id}`, 'PUT', {
      transcript: 'next test draft',
      draft,
      revision: 0,
    })
    const nextCost = (await request(`/reports/${next.id}/calculate`, 'POST'))
      .value
    await request(
      `/projects/${project.id}/rates`,
      'POST',
      {
        item_id: equipment.id,
        effective_date: '2026-02-03',
        rate: '101',
        source_note: 'Changed quote after review',
      },
      201,
    )
    await request(
      `/reports/${next.id}/approve`,
      'POST',
      {
        revision: nextCost.revision,
        calculation_hash: nextCost.calculation_hash,
      },
      409,
    )
    const { value: earlier } = await request(
      '/reports',
      'POST',
      { project_id: project.id, work_date: '2026-02-01' },
      201,
    )
    assert.equal((await request(`/reports/${earlier.id}`)).value.previous, null)
    await request(`/reports/${next.id}/transcribe`, 'POST', {}, 400)
    await request(`/reports/${next.id}/extract`, 'POST', {}, 400)
    await request(
      '/users',
      'POST',
      {
        name: 'Estimator',
        email: 'estimate@example.test',
        password: 'estimator-test-password',
        role: 'estimator',
      },
      201,
    )
    const estimator = (
      await request('/auth/login', 'POST', {
        email: 'estimate@example.test',
        password: 'estimator-test-password',
      })
    ).cookie
    await request(
      '/reports',
      'POST',
      { project_id: project.id, work_date: '2026-02-03' },
      403,
      estimator,
    )
    await request('/projects', 'GET', undefined, 200, estimator)
    await request('/users', 'GET', undefined, 403, estimator)
    await request(
      '/users',
      'POST',
      {
        name: 'Foreman',
        email: 'foreman@example.test',
        password: 'foreman-test-password',
        role: 'foreman',
      },
      201,
    )
    const foremanUser = (await request('/users')).value.find(
      (u: any) => u.email === 'foreman@example.test',
    )
    await request(
      `/projects/${project.id}/members/${foremanUser.id}`,
      'PUT',
      {},
    )
    const foreman = (
      await request('/auth/login', 'POST', {
        email: 'foreman@example.test',
        password: 'foreman-test-password',
      })
    ).cookie
    await request(
      `/reports/${next.id}`,
      'PUT',
      { transcript: 'not author', draft, revision: 0 },
      403,
      foreman,
    )
    const own = (
      await request(
        '/reports',
        'POST',
        { project_id: project.id, work_date: '2026-02-03' },
        201,
        foreman,
      )
    ).value
    await request(
      `/reports/${own.id}`,
      'PUT',
      { transcript: 'own report', draft, revision: 0 },
      200,
      foreman,
    )
    await request(
      '/classifications',
      'POST',
      { name: 'Denied', union_type: 'Union' },
      403,
      foreman,
    )
    await request('/auth/logout', 'POST', {})
    await request('/projects', 'GET', undefined, 401)
  },
)
