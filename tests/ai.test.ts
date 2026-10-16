import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extract } from '../server/ai.ts'
import { provenance } from '../server/provenance.ts'

test('AI integration rejects unknown IDs and malformed output; original suggestions remain separate', async (t) => {
  const originalFetch = globalThis.fetch,
    originalKey = process.env.AI_API_KEY
  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.AI_API_KEY
    else process.env.AI_API_KEY = originalKey
  })
  delete process.env.AI_API_KEY
  await assert.rejects(
    () => extract('field notes', {}, null, null),
    /not configured/,
  )
  process.env.AI_API_KEY = 'mock-test-key'
  const catalog = {
    classifications: [{ id: 'operator', name: 'Operator' }],
    items: [],
  }
  const draft = {
    activity: 'Sewer',
    quantity: '400',
    unit: 'LF',
    workday_hours: null,
    labor: [
      {
        classification_id: 'operator',
        workers: 6,
        regular: null,
        overtime: null,
        doubletime: null,
      },
    ],
    usage: [],
    questions: ['How many hours?'],
    attribution_confirmed: false,
  }
  globalThis.fetch = async () =>
    Response.json({
      model: 'mock-model',
      choices: [{ message: { content: JSON.stringify(draft) } }],
    })
  const result = await extract(
    'six operators, 400 feet',
    catalog,
    { job_number: '125' },
    null,
  )
  assert.equal(result.draft.workday_hours, null)
  assert.equal(result.draft.labor[0].regular, null)
  assert.equal(result.draft.attribution_confirmed, false)
  assert.equal(JSON.parse(result.raw).quantity, '400')
  const sources = provenance({ ...result.draft, quantity: '450' }, result.draft)
  assert.equal(sources.quantity.source, 'User entry · human confirmed')
  assert.equal(sources.activity.source, 'AI extraction · human confirmed')
  assert.equal(sources.quantity.extracted, '400')
  globalThis.fetch = async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              ...draft,
              labor: [{ ...draft.labor[0], classification_id: 'invented' }],
            }),
          },
        },
      ],
    })
  await assert.rejects(
    () => extract('field notes', catalog, {}, null),
    /unknown catalog item/,
  )
  globalThis.fetch = async () =>
    Response.json({ choices: [{ message: { content: 'invalid-json' } }] })
  await assert.rejects(
    () => extract('field notes', catalog, {}, null),
    /failed validation/,
  )
  globalThis.fetch = async () => new Response('', { status: 429 })
  await assert.rejects(
    () => extract('field notes', catalog, {}, null),
    /HTTP 429/,
  )
})
