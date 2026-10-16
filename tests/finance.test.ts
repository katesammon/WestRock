import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dollarsToCents,
  lineCost,
  laborCost,
  productionMetrics,
  derivedEquipmentRate,
  statistics,
} from '../server/finance.ts'
const rate = {
  base_cents: 4000,
  fringe_cents: 2000,
  payroll_cents: 500,
  burden_cents: 500,
  ot_multiplier: '1.5',
  dt_multiplier: '2',
}
test('decimal money converts exactly and rejects fractional cents', () => {
  assert.equal(dollarsToCents('0.29'), 29)
  assert.equal(dollarsToCents('1234.56'), 123456)
  assert.throws(() => dollarsToCents('1.001'))
  assert.throws(() => dollarsToCents('-1'))
})
test('round half up once per cost line', () => {
  assert.equal(lineCost('0.5', 1), 1)
  assert.equal(lineCost('1.005', 100), 101)
  assert.equal(lineCost('40', 3500), 140000)
})
test('six workers, eight hours, loaded hourly rate', () => {
  assert.equal(
    laborCost(
      { workers: 6, regular: '8', overtime: '0', doubletime: '0' },
      rate,
    ),
    336000,
  )
})
test('overtime and doubletime multiply base only', () => {
  assert.equal(
    laborCost(
      { workers: 1, regular: '8', overtime: '2', doubletime: '1' },
      rate,
    ),
    85000,
  )
})
test('invalid labor hours and counts cannot produce cost', () => {
  assert.throws(() =>
    laborCost(
      { workers: 1, regular: '23', overtime: '2', doubletime: '0' },
      rate,
    ),
  )
  assert.throws(() =>
    laborCost(
      { workers: 0, regular: '8', overtime: '0', doubletime: '0' },
      rate,
    ),
  )
})
test('PRD cost and production example', () => {
  assert.deepEqual(productionMetrics(1064000, '400', '8'), {
    unit_cost_cents: '2660',
    production_per_hour: '50',
  })
})
test('zero production is not a valid historical unit cost', () => {
  assert.throws(() => productionMetrics(100, '0', '8'))
  assert.throws(() => productionMetrics(100, '1', '0'))
})
test('equipment ownership and operating costs use configured utilization', () => {
  assert.equal(derivedEquipmentRate('80000', '40000', '2000'), 6000)
  assert.throws(() => derivedEquipmentRate('1', '1', '0'))
})
test('statistics distinguish simple average, median, weighted cost', () => {
  const stats = statistics([
    { total_cents: 1000, quantity: '1', unit_cost_cents: '1000' },
    { total_cents: 2000, quantity: '10', unit_cost_cents: '200' },
  ])!
  assert.equal(stats.average, 600)
  assert.equal(stats.median, 600)
  assert.equal(stats.min, 200)
  assert.equal(stats.max, 1000)
  assert.ok(Math.abs(stats.weighted - 3000 / 11) < 1e-10)
})
