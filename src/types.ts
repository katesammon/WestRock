export type Role =
  'owner' | 'admin' | 'project_manager' | 'foreman' | 'estimator'
export interface User {
  id: string
  name: string
  email: string
  role: Role
}
export interface Classification {
  id: string
  name: string
  union_type: string
}
export interface LaborRate {
  id: string
  classification_id: string
  effective_date: string
  expiration_date: string | null
  base_cents: number
  fringe_cents: number
  payroll_cents: number
  burden_cents: number
  ot_multiplier: string
  dt_multiplier: string
  details_json: string
}
export interface Item {
  id: string
  code: string
  name: string
  category: 'equipment' | 'material' | 'disposal'
  unit: string
  metadata_json: string
}
export interface ItemRate {
  id: string
  item_id: string
  effective_date: string
  expiration_date: string | null
  rate_cents: number
  basis_json?: string
  source_note?: string
  name?: string
  category?: string
  unit?: string
}
export interface Data {
  classifications: Classification[]
  laborRates: LaborRate[]
  employees: {
    id: string
    employee_code: string
    name: string
    role: string
    classification_id: string
  }[]
  items: Item[]
  itemRates: ItemRate[]
  company: { id: string; name: string }
  aiEnabled: boolean
}
export interface Project {
  id: string
  job_number: string
  name: string
  client: string
  state: string
  region: string
  county: string
  city: string
  project_type: string
  start_date: string
  end_date: string | null
  contract_cents: number
  budget_cents: number
  primary_activity: string
  production_unit: string
  contract_quantity: string
  status: 'active' | 'planned' | 'completed'
  notes: string
}
export interface ReportSummary {
  id: string
  project_id: string
  author_id: string
  work_date: string
  status: 'draft' | 'approved'
  created_at: string
  approved_at: string | null
  project_name: string
  job_number: string
  author_name: string
  total_cents: number | null
  quantity: string | null
  unit: string | null
}
export interface Draft {
  activity: string
  quantity: string | null
  unit: 'LF' | 'CY' | 'TON' | 'EA'
  workday_hours: string | null
  depth: string | null
  conditions: string
  weather: string
  safety: string
  delays: string
  notes: string
  labor: {
    classification_id: string
    workers: number
    regular: string | null
    overtime: string | null
    doubletime: string | null
  }[]
  usage: { item_id: string; quantity: string | null }[]
  questions: string[]
  inherited_from: string | null
  attribution_confirmed: boolean
}
export interface CostLine {
  id?: string
  category: string
  label: string
  quantity: string
  unit: string
  rate_id: string
  rate_source: string
  rate_snapshot_json?: string
  rate_snapshot?: Record<string, unknown>
  cost_cents: number
}
export interface Calculation {
  revision: number
  calculation_hash: string
  errors: string[]
  lines: CostLine[]
  totals: Record<string, number>
  total_cents: number
  unit_cost_cents?: string
  production_per_hour?: string
}
export interface Observation {
  id: string
  report_id: string
  project_id: string
  work_date: string
  state: string
  region: string
  county: string
  city: string
  project_type: string
  activity: string
  unit: string
  quantity: string
  workday_hours: string
  depth: string | null
  conditions: string
  labor_cents: number
  equipment_cents: number
  material_cents: number
  disposal_cents: number
  total_cents: number
  unit_cost_cents: string
  production_per_hour: string
  job_number: string
  project_name: string
}
export interface Report extends ReportSummary {
  revision: number
  transcript: string
  audio_key: string | null
  draft: Draft
  extraction: {
    draft: Draft
    transcript: string
    model: string
    created_at: string
  } | null
  approved: {
    values: Draft
    source: string
    transcript: string
    provenance: Record<
      string,
      { source: string; verified: unknown; extracted?: unknown }
    >
  } | null
  lines: CostLine[]
  observation: Observation | null
  previous: { id: string; work_date: string; draft: { values: Draft } } | null
}
export interface Stats {
  activity: string
  unit: string
  count: number
  min: number
  max: number
  average: number
  median: number
  weighted: number
  recent: { average: number; median: number; count: number }
}
export interface Intelligence {
  observations: Observation[]
  groups: Stats[]
}
