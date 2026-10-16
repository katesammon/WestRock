import type { FieldConfig } from './components'
import { today } from './api'
export const projectFields: FieldConfig[] = [
  { name: 'job_number', label: 'Job number', required: true },
  { name: 'name', label: 'Project name', required: true },
  { name: 'client', label: 'Client', required: true },
  { name: 'project_type', label: 'Project type', required: true },
  { name: 'state', label: 'State', required: true },
  {
    name: 'region',
    label: 'Region',
    required: true,
    help: 'For example: Bay Area or Central Valley.',
  },
  { name: 'county', label: 'County', required: true },
  { name: 'city', label: 'City', required: true },
  {
    name: 'start_date',
    label: 'Start date',
    type: 'date',
    required: true,
    value: today(),
  },
  { name: 'end_date', label: 'Expected completion', type: 'date' },
  {
    name: 'contract',
    label: 'Contract value ($)',
    type: 'number',
    min: '0',
    step: '.01',
    required: true,
  },
  {
    name: 'budget',
    label: 'Direct-cost budget ($)',
    type: 'number',
    min: '0',
    step: '.01',
    required: true,
  },
  {
    name: 'primary_activity',
    label: 'Primary costed activity',
    required: true,
    help: 'Keep scope specific, e.g. 8-inch PVC sewer.',
  },
  {
    name: 'production_unit',
    label: 'Production unit',
    required: true,
    options: ['LF', 'CY', 'TON', 'EA'].map((v) => ({ label: v, value: v })),
  },
  {
    name: 'contract_quantity',
    label: 'Contract quantity · primary activity',
    type: 'number',
    step: '.001',
    min: '0',
    required: true,
  },
  {
    name: 'status',
    label: 'Project status',
    value: 'active',
    options: ['active', 'planned', 'completed'].map((v) => ({
      label: v,
      value: v,
    })),
  },
  { name: 'notes', label: 'Project notes' },
]
export const projectBody = (v: Record<string, string>) => ({
  ...v,
  end_date: v.end_date || null,
})
