import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { hasPermission } from '../shared/permissions.ts'

test('unknown roles are denied rather than inheriting permissions', () => {
  for (const role of ['', 'other', '__proto__', 'constructor'])
    assert.equal(hasPermission(role, 'users:manage'), false)
})
test(
  'server permissions, project boundaries, financial redaction, approval workflow, and access revocation',
  { timeout: 30000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'westrock-permissions-')),
      port = 41000 + Math.floor(Math.random() * 10000)
    const child = spawn(
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
    child.stdout.on('data', (d) => (logs += d))
    child.stderr.on('data', (d) => (logs += d))
    t.after(async () => {
      child.kill('SIGTERM')
      await once(child, 'exit')
      await rm(dir, { recursive: true, force: true })
    })
    const base = `http://127.0.0.1:${port}/api`
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + '/health')).ok) break
      } catch {}
      await delay(50)
      if (i === 99) throw new Error(logs)
    }
    type Result = { value: any; cookie: string }
    const call = async (
      cookie: string,
      path: string,
      method = 'GET',
      body?: unknown,
      expected = 200,
    ): Promise<Result> => {
      const response = await fetch(base + path, {
        method,
        headers: {
          Cookie: cookie,
          ...(body instanceof FormData
            ? {}
            : { 'Content-Type': 'application/json' }),
        },
        body:
          body === undefined
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body),
      })
      const value = await response.json()
      assert.equal(
        response.status,
        expected,
        `${method} ${path}: ${JSON.stringify(value)}\n${logs}`,
      )
      return {
        value,
        cookie: response.headers.get('set-cookie')?.split(';')[0] || '',
      }
    }
    const setup = await call(
        '',
        '/auth/setup',
        'POST',
        {
          name: 'Owner',
          company: 'Permission fixtures',
          email: 'owner@example.test',
          password: 'permission-test-password',
        },
        201,
      ),
      owner = setup.cookie
    const users: Record<string, { id: string; cookie: string }> = {
      owner: { id: setup.value.id, cookie: owner },
    }
    for (const role of [
      'admin',
      'project_manager',
      'estimator',
      'foreman',
      'second_foreman',
    ]) {
      const email = `${role}@example.test`,
        created = await call(
          owner,
          '/users',
          'POST',
          {
            name: role,
            email,
            password: 'permission-test-password',
            role: role === 'second_foreman' ? 'foreman' : role,
          },
          201,
        )
      const login = await call('', '/auth/login', 'POST', {
        email,
        password: 'permission-test-password',
      })
      users[role] = { id: created.value.id, cookie: login.cookie }
    }
    const pm = users.project_manager.cookie,
      foreman = users.foreman.cookie,
      second = users.second_foreman.cookie,
      estimator = users.estimator.cookie,
      admin = users.admin.cookie
    const classification = (
      await call(
        owner,
        '/classifications',
        'POST',
        { name: 'Operator', union_type: 'Union' },
        201,
      )
    ).value
    await call(
      owner,
      '/labor-rates',
      'POST',
      {
        classification_id: classification.id,
        effective_date: '2026-01-01',
        base: '40',
        pension: '0',
        health: '0',
        vacation: '0',
        training: '0',
        other_fringe: '0',
        payroll: '0',
        burden: '0',
        ot_multiplier: '1.5',
        dt_multiplier: '2',
      },
      201,
    )
    await call(
      owner,
      '/employees',
      'POST',
      {
        employee_code: 'TEST1',
        name: 'Private employee',
        role: 'Operator',
        classification_id: classification.id,
      },
      201,
    )
    const item = (
      await call(
        owner,
        '/items',
        'POST',
        {
          code: 'EX1',
          name: 'Excavator',
          category: 'equipment',
          unit: 'HR',
          vendor: 'Private vendor',
        },
        201,
      )
    ).value
    await call(
      owner,
      '/item-rates',
      'POST',
      { item_id: item.id, effective_date: '2026-01-01', rate: '100' },
      201,
    )
    const projectBody = {
      name: 'Assignment test',
      client: 'Client',
      state: 'CA',
      region: 'Bay Area',
      county: 'Alameda',
      city: 'Oakland',
      project_type: 'Sewer',
      start_date: '2026-01-01',
      contract: '100000',
      budget: '80000',
      primary_activity: '8-inch sewer',
      production_unit: 'LF',
      contract_quantity: '1000',
      status: 'active',
      notes: 'Private financial note',
    }
    const a = (
      await call(
        owner,
        '/projects',
        'POST',
        { ...projectBody, job_number: 'A' },
        201,
      )
    ).value.id
    const b = (
      await call(
        owner,
        '/projects',
        'POST',
        { ...projectBody, job_number: 'B' },
        201,
      )
    ).value.id
    assert.deepEqual((await call(foreman, '/projects')).value, [])
    assert.deepEqual((await call(pm, '/projects')).value, [])
    for (const role of ['project_manager', 'foreman', 'second_foreman'])
      await call(owner, `/projects/${a}/members/${users[role].id}`, 'PUT', {})
    const projects = (await call(foreman, '/projects')).value
    assert.equal(projects.length, 1)
    assert.equal(projects[0].id, a)
    for (const key of ['contract_cents', 'budget_cents', 'notes'])
      assert.equal(Object.hasOwn(projects[0], key), false)
    const data = (await call(foreman, '/data')).value
    assert.equal(data.laborRates.length, 0)
    assert.equal(data.itemRates.length, 0)
    assert.equal(data.employees.length, 0)
    assert.ok(!JSON.stringify(data).includes('base_cents'))
    assert.ok(!JSON.stringify(data).includes('rate_cents'))
    assert.equal(Object.hasOwn(data.items[0], 'metadata_json'), false)
    assert.equal((await call(pm, '/data')).value.employees.length, 0)
    assert.equal((await call(admin, '/data')).value.employees.length, 1)
    assert.equal((await call(estimator, '/data')).value.laborRates.length, 1)
    for (const actor of [foreman, second, estimator, pm]) {
      await call(actor, '/users', 'GET', undefined, 403)
      await call(actor, '/users', 'POST', {}, 403)
      await call(
        actor,
        `/users/${users.foreman.id}`,
        'PATCH',
        { role: 'admin' },
        403,
      )
      await call(
        actor,
        `/projects/${a}/members/${users.foreman.id}`,
        'DELETE',
        undefined,
        403,
      )
      await call(actor, '/audit', 'GET', undefined, 403)
      await call(actor, '/classifications', 'POST', {}, 403)
      await call(actor, '/labor-rates', 'POST', {}, 403)
      await call(actor, '/employees', 'POST', {}, 403)
      await call(actor, '/items', 'POST', {}, 403)
      await call(actor, '/item-rates', 'POST', {}, 403)
      await call(actor, '/rates/item/unknown/close', 'POST', {}, 403)
    }
    for (const actor of [foreman, second]) {
      await call(actor, `/projects/${a}/rates`, 'GET', undefined, 403)
      await call(actor, '/observations', 'GET', undefined, 403)
      await call(actor, '/projects', 'POST', projectBody, 403)
      await call(
        actor,
        `/projects/${a}/status`,
        'PATCH',
        { status: 'completed' },
        403,
      )
      await call(actor, `/projects/${a}/rates`, 'POST', {}, 403)
      await call(actor, `/projects/${a}/rates/unknown/close`, 'POST', {}, 403)
    }
    await call(
      pm,
      `/projects/${b}/status`,
      'PATCH',
      { status: 'completed' },
      403,
    )
    await call(pm, `/projects/${b}/rates`, 'GET', undefined, 403)
    await call(pm, `/observations?project_id=${b}`, 'GET', undefined, 403)
    await call(
      foreman,
      '/reports',
      'POST',
      { project_id: b, work_date: '2026-02-01' },
      403,
    )
    await call(
      estimator,
      '/reports',
      'POST',
      { project_id: a, work_date: '2026-02-01' },
      403,
    )
    const ownProject = (
      await call(
        pm,
        '/projects',
        'POST',
        { ...projectBody, job_number: 'PM' },
        201,
      )
    ).value.id
    assert.ok(
      (await call(pm, '/projects')).value.some((p: any) => p.id === ownProject),
    )
    const report = (
      await call(
        foreman,
        '/reports',
        'POST',
        { project_id: a, work_date: '2026-02-01' },
        201,
      )
    ).value.id
    await call(second, `/reports/${report}`, 'GET', undefined, 403)
    await call(estimator, `/reports/${report}`, 'GET', undefined, 403)
    await call(second, `/reports/${report}/audio`, 'GET', undefined, 403)
    await call(second, `/reports/${report}`, 'PUT', {}, 403)
    await call(second, `/reports/${report}/extract`, 'POST', {}, 403)
    for (const actor of [foreman, second, estimator]) {
      await call(actor, `/reports/${report}/calculate`, 'POST', {}, 403)
      await call(actor, `/reports/${report}/approve`, 'POST', {}, 403)
      await call(actor, `/reports/${report}/return`, 'POST', {}, 403)
    }
    await call(
      foreman,
      `/reports/${report}/submit`,
      'POST',
      { revision: 0 },
      400,
    )
    const draft = {
      activity: '8-inch sewer',
      quantity: '400',
      unit: 'LF',
      workday_hours: '8',
      depth: '9',
      labor: [
        {
          classification_id: classification.id,
          workers: 2,
          regular: '8',
          overtime: '0',
          doubletime: '0',
        },
      ],
      usage: [],
      attribution_confirmed: true,
    }
    await call(foreman, `/reports/${report}`, 'PUT', {
      transcript: 'Test field source',
      draft,
      revision: 0,
    })
    const audio = new FormData()
    audio.set(
      'audio',
      new Blob([new Uint8Array(44)], { type: 'audio/wav' }),
      'fixture.wav',
    )
    await call(foreman, `/reports/${report}/audio`, 'POST', audio)
    assert.equal(
      (
        await fetch(base + `/reports/${report}/audio`, {
          headers: { Cookie: foreman },
        })
      ).status,
      200,
    )
    await call(estimator, `/reports/${report}/audio`, 'GET', undefined, 403)
    await call(foreman, `/reports/${report}/submit`, 'POST', { revision: 1 })
    assert.equal(
      (await call(foreman, `/reports/${report}`)).value.status,
      'submitted',
    )
    await call(
      foreman,
      `/reports/${report}`,
      'PUT',
      { transcript: 'Cannot edit submitted', draft, revision: 2 },
      409,
    )
    await call(pm, `/reports/${report}/return`, 'POST', {
      reason: 'Confirm depth',
    })
    assert.equal(
      (await call(foreman, `/reports/${report}`)).value.review_note,
      'Confirm depth',
    )
    await call(foreman, `/reports/${report}/submit`, 'POST', { revision: 3 })
    const cost = (await call(pm, `/reports/${report}/calculate`, 'POST', {}))
      .value
    assert.equal(cost.total_cents, 64000)
    await call(pm, `/reports/${report}/approve`, 'POST', {
      revision: cost.revision,
      calculation_hash: cost.calculation_hash,
    })
    const fieldView = (await call(foreman, `/reports/${report}`)).value
    assert.equal(fieldView.status, 'approved')
    assert.deepEqual(fieldView.lines, [])
    assert.equal(fieldView.observation, null)
    assert.ok(!JSON.stringify(fieldView).includes('base_cents'))
    assert.ok(!JSON.stringify(fieldView).includes('total_cents'))
    assert.equal(
      Object.hasOwn((await call(foreman, '/reports')).value[0], 'total_cents'),
      false,
    )
    assert.deepEqual((await call(second, '/reports')).value, [])
    assert.equal((await call(estimator, '/reports')).value.length, 1)
    assert.equal(
      (await call(estimator, `/reports/${report}`)).value.observation
        .total_cents,
      64000,
    )
    assert.equal(
      (await call(estimator, '/observations')).value.observations.length,
      1,
    )
    // Another job's approved costs are not exposed to an assigned project manager.
    const otherReport = (
      await call(
        owner,
        '/reports',
        'POST',
        { project_id: b, work_date: '2026-02-01' },
        201,
      )
    ).value.id
    await call(owner, `/reports/${otherReport}`, 'PUT', {
      transcript: 'Other job',
      draft,
      revision: 0,
    })
    const otherCost = (
      await call(owner, `/reports/${otherReport}/calculate`, 'POST', {})
    ).value
    await call(owner, `/reports/${otherReport}/approve`, 'POST', {
      revision: otherCost.revision,
      calculation_hash: otherCost.calculation_hash,
    })
    assert.equal((await call(pm, '/observations')).value.observations.length, 1)
    assert.equal(
      (await call(estimator, '/observations')).value.observations.length,
      2,
    )
    await call(pm, `/reports/${otherReport}`, 'GET', undefined, 403)
    // Assignment removal and account disablement take effect on existing sessions immediately.
    await call(owner, `/projects/${a}/members/${users.foreman.id}`, 'DELETE')
    await call(foreman, `/reports/${report}`, 'GET', undefined, 403)
    await call(foreman, `/reports/${report}/audio`, 'GET', undefined, 403)
    assert.deepEqual((await call(foreman, '/projects')).value, [])
    await call(
      admin,
      `/users/${setup.value.id}`,
      'PATCH',
      { role: 'admin' },
      400,
    )
    await call(owner, `/users/${users.estimator.id}`, 'PATCH', {
      role: 'foreman',
    })
    await call(estimator, '/data', 'GET', undefined, 401)
    await call(owner, `/users/${users.second_foreman.id}`, 'PATCH', {
      active: false,
    })
    await call(second, '/data', 'GET', undefined, 401)
    await call(
      '',
      '/auth/login',
      'POST',
      {
        email: 'second_foreman@example.test',
        password: 'permission-test-password',
      },
      401,
    )
    const events = (await call(owner, '/audit')).value
    assert.ok(events.some((e: any) => e.action === 'project.member_removed'))
    assert.ok(events.some((e: any) => e.action === 'report.submitted'))
    assert.ok(events.some((e: any) => e.action === 'user.access_changed'))
  },
)
