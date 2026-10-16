import { Decimal } from 'decimal.js'

Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP })
export const dollarsToCents = (value: string | number) => {
  const d = new Decimal(value)
  if (!d.isFinite() || d.isNegative() || d.decimalPlaces() > 2 || d.gt(1e10))
    throw new Error('Invalid dollar amount')
  return d.mul(100).toNumber()
}
export const lineCost = (quantity: string | number, rateCents: number) => {
  const q = new Decimal(quantity)
  if (
    !q.isFinite() ||
    q.isNegative() ||
    !Number.isSafeInteger(rateCents) ||
    rateCents < 0
  )
    throw new Error('Invalid cost inputs')
  const result = q.mul(rateCents).toDecimalPlaces(0).toNumber()
  if (!Number.isSafeInteger(result))
    throw new Error('Cost exceeds supported range')
  return result
}
export function laborCost(
  input: {
    workers: number
    regular: string
    overtime: string
    doubletime: string
  },
  rate: {
    base_cents: number
    fringe_cents: number
    payroll_cents: number
    burden_cents: number
    ot_multiplier: string
    dt_multiplier: string
  },
) {
  if (!Number.isInteger(input.workers) || input.workers < 1)
    throw new Error('Invalid worker count')
  const fringe = new Decimal(rate.fringe_cents)
    .add(rate.payroll_cents)
    .add(rate.burden_cents)
  const hourly = (multiplier: string) =>
    new Decimal(rate.base_cents).mul(multiplier).add(fringe)
  const hours = [input.regular, input.overtime, input.doubletime].map(
    (v) => new Decimal(v),
  )
  if (
    hours.some((h) => !h.isFinite() || h.isNegative()) ||
    Decimal.sum(...hours).gt(24)
  )
    throw new Error('Hours must total at most 24 per worker')
  const result = hours[0]
    .mul(hourly('1'))
    .add(hours[1].mul(hourly(rate.ot_multiplier)))
    .add(hours[2].mul(hourly(rate.dt_multiplier)))
    .mul(input.workers)
    .toDecimalPlaces(0)
    .toNumber()
  if (!Number.isSafeInteger(result))
    throw new Error('Cost exceeds supported range')
  return result
}
export function productionMetrics(
  totalCents: number,
  quantity: string,
  hours: string,
) {
  const q = new Decimal(quantity),
    h = new Decimal(hours)
  if (!q.isFinite() || !h.isFinite() || q.lte(0) || h.lte(0))
    throw new Error('Production quantity and workday hours must be positive')
  return {
    unit_cost_cents: new Decimal(totalCents)
      .div(q)
      .toDecimalPlaces(4)
      .toString(),
    production_per_hour: q.div(h).toDecimalPlaces(4).toString(),
  }
}
export function derivedEquipmentRate(
  ownership: string,
  operating: string,
  utilization: string,
) {
  if (new Decimal(utilization).lte(0))
    throw new Error('Annual utilization must be positive')
  return new Decimal(dollarsToCents(ownership))
    .add(dollarsToCents(operating))
    .div(utilization)
    .toDecimalPlaces(0)
    .toNumber()
}
export function statistics(
  observations: {
    total_cents: number
    quantity: string
    unit_cost_cents: string
  }[],
) {
  if (!observations.length) return null
  const rates = observations
    .map((o) => new Decimal(o.unit_cost_cents))
    .sort((a, b) => a.cmp(b))
  const middle = Math.floor(rates.length / 2)
  return {
    count: rates.length,
    min: rates[0].toNumber(),
    max: rates.at(-1)!.toNumber(),
    average: Decimal.sum(...rates)
      .div(rates.length)
      .toNumber(),
    median: (rates.length % 2
      ? rates[middle]
      : rates[middle - 1].add(rates[middle]).div(2)
    ).toNumber(),
    weighted: Decimal.sum(...observations.map((o) => o.total_cents))
      .div(Decimal.sum(...observations.map((o) => o.quantity)))
      .toNumber(),
  }
}
