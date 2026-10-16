import { Decimal } from 'decimal.js'
import { createHash } from 'node:crypto'
import { all, one } from './db.ts'
import { laborCost, lineCost, productionMetrics } from './finance.ts'
import type { Draft } from './validation.ts'
export function calculate(projectId: string, workDate: string, draft: Draft) {
  const errors: string[] = []
  const lines: any[] = []
  if (!draft.activity.trim()) errors.push('Specify the production activity.')
  if (!draft.quantity || Number(draft.quantity) <= 0)
    errors.push('Enter a positive installed quantity.')
  if (!draft.workday_hours || Number(draft.workday_hours) <= 0)
    errors.push('Enter positive workday hours.')
  if (!draft.labor.length) errors.push('Add at least one labor classification.')
  if (!draft.attribution_confirmed)
    errors.push('Confirm that all direct costs belong to this single activity.')
  const seen = new Set<string>()
  for (const entry of draft.labor) {
    if (seen.has(entry.classification_id)) {
      errors.push('Combine duplicate labor classifications.')
      continue
    }
    seen.add(entry.classification_id)
    const classification = one(
      'SELECT * FROM classifications WHERE id=?',
      entry.classification_id,
    )
    const rate = one(
      'SELECT * FROM labor_rates WHERE classification_id=? AND effective_date<=? AND (expiration_date IS NULL OR expiration_date>=?) ORDER BY effective_date DESC LIMIT 1',
      entry.classification_id,
      workDate,
      workDate,
    )
    if (!classification || !rate) {
      errors.push(
        `Missing labor rate for ${classification?.name || 'unknown classification'} on ${workDate}.`,
      )
      continue
    }
    if (
      entry.regular === null ||
      entry.overtime === null ||
      entry.doubletime === null
    ) {
      errors.push(
        `Complete hours for ${classification.name}; enter zero where appropriate.`,
      )
      continue
    }
    try {
      if (
        new Decimal(entry.regular)
          .add(entry.overtime)
          .add(entry.doubletime)
          .lte(0)
      )
        throw new Error('Total hours must be positive')
      const cost = laborCost(
        {
          ...entry,
          regular: entry.regular,
          overtime: entry.overtime,
          doubletime: entry.doubletime,
        },
        rate,
      )
      lines.push({
        category: 'labor',
        label: classification.name,
        quantity: new Decimal(entry.regular)
          .add(entry.overtime)
          .add(entry.doubletime)
          .mul(entry.workers)
          .toString(),
        unit: 'HR',
        rate_id: rate.id,
        rate_source: 'Company labor rate',
        rate_snapshot: {
          ...rate,
          workers: entry.workers,
          regular: entry.regular,
          overtime: entry.overtime,
          doubletime: entry.doubletime,
        },
        cost_cents: cost,
      })
    } catch (e) {
      errors.push(`${classification.name}: ${(e as Error).message}`)
    }
  }
  seen.clear()
  for (const entry of draft.usage) {
    if (seen.has(entry.item_id)) {
      errors.push('Combine duplicate equipment/material/disposal entries.')
      continue
    }
    seen.add(entry.item_id)
    const item = one('SELECT * FROM cost_items WHERE id=?', entry.item_id)
    const override = one(
      'SELECT * FROM project_rates WHERE project_id=? AND item_id=? AND effective_date<=? AND (expiration_date IS NULL OR expiration_date>=?) ORDER BY effective_date DESC LIMIT 1',
      projectId,
      entry.item_id,
      workDate,
      workDate,
    )
    const rate =
      override ||
      one(
        'SELECT * FROM item_rates WHERE item_id=? AND effective_date<=? AND (expiration_date IS NULL OR expiration_date>=?) ORDER BY effective_date DESC LIMIT 1',
        entry.item_id,
        workDate,
        workDate,
      )
    if (!item || !rate) {
      errors.push(
        `Missing cost rate for ${item?.name || 'unknown item'} on ${workDate}.`,
      )
      continue
    }
    if (entry.quantity === null || Number(entry.quantity) <= 0) {
      errors.push(`Enter a positive quantity for ${item.name} (${item.unit}).`)
      continue
    }
    lines.push({
      category: item.category,
      label: item.name,
      quantity: entry.quantity,
      unit: item.unit,
      rate_id: rate.id,
      rate_source: override ? 'Project override' : 'Company rate',
      rate_snapshot: rate,
      cost_cents: lineCost(entry.quantity, rate.rate_cents),
    })
  }
  const totals = { labor: 0, equipment: 0, material: 0, disposal: 0 }
  for (const line of lines)
    totals[line.category as keyof typeof totals] += line.cost_cents
  const total_cents = Object.values(totals).reduce((a, b) => a + b, 0)
  if (!Number.isSafeInteger(total_cents))
    errors.push('Total exceeds supported range.')
  const metrics =
    draft.quantity &&
    Number(draft.quantity) > 0 &&
    draft.workday_hours &&
    Number(draft.workday_hours) > 0
      ? productionMetrics(total_cents, draft.quantity, draft.workday_hours)
      : null
  return {
    errors,
    lines,
    totals,
    total_cents,
    ...metrics,
    calculation_hash: createHash('sha256')
      .update(JSON.stringify({ projectId, workDate, draft, lines, totals }))
      .digest('hex'),
  }
}
export function catalogs() {
  return {
    classifications: all('SELECT * FROM classifications ORDER BY name'),
    laborRates: all('SELECT * FROM labor_rates ORDER BY effective_date DESC'),
    employees: all('SELECT * FROM employees ORDER BY name'),
    items: all('SELECT * FROM cost_items ORDER BY category,name'),
    itemRates: all('SELECT * FROM item_rates ORDER BY effective_date DESC'),
  }
}
