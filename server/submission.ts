import { Decimal } from 'decimal.js'
import type { Draft } from './validation.ts'
import { one } from './db.ts'
/** Field validation without querying or disclosing any financial rates. */
export function validateSubmission(draft: Draft) {
  const errors: string[] = []
  if (!draft.activity.trim() || !draft.quantity || Number(draft.quantity) <= 0)
    errors.push('Enter an activity and positive installed quantity.')
  if (!draft.workday_hours || Number(draft.workday_hours) <= 0)
    errors.push('Enter positive workday hours.')
  if (!draft.attribution_confirmed)
    errors.push('Confirm the activity attribution and reviewed inputs.')
  if (!draft.labor.length) errors.push('Add at least one labor classification.')
  const seen = new Set<string>()
  for (const l of draft.labor) {
    if (seen.has(l.classification_id))
      errors.push('Combine duplicate labor classifications.')
    seen.add(l.classification_id)
    if (
      !one(
        'SELECT id FROM classifications WHERE id=? AND active=1',
        l.classification_id,
      )
    )
      errors.push('Select a valid active labor classification.')
    if (l.regular === null || l.overtime === null || l.doubletime === null)
      errors.push('Complete all per-worker hours, including zeros.')
    else {
      const hours = new Decimal(l.regular).add(l.overtime).add(l.doubletime)
      if (hours.lte(0) || hours.gt(24))
        errors.push(
          'Hours must total more than zero and at most 24 per worker.',
        )
    }
  }
  seen.clear()
  for (const u of draft.usage) {
    if (seen.has(u.item_id)) errors.push('Combine duplicate usage items.')
    seen.add(u.item_id)
    if (!one('SELECT id FROM cost_items WHERE id=? AND active=1', u.item_id))
      errors.push('Select a valid active usage item.')
    if (!u.quantity || Number(u.quantity) <= 0)
      errors.push('Enter a positive quantity for every usage item.')
  }
  return errors
}
