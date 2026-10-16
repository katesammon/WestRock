import { z } from 'zod'
const text = z.string().trim().min(1).max(200)
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    'Invalid date',
  )
export const decimal = (places = 3, max = 1e8) =>
  z
    .string()
    .regex(new RegExp(`^\\d+(\\.\\d{1,${places}})?$`))
    .refine((v) => Number(v) <= max, 'Value too large')
export const money = decimal(2, 1e10)
export const role = z.enum([
  'owner',
  'admin',
  'project_manager',
  'estimator',
  'foreman',
])
export const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128),
})
export const signup = credentials.extend({ name: text, company: text })
export const projectInput = z
  .object({
    job_number: text,
    name: text,
    client: text,
    state: text,
    region: text,
    county: text,
    city: text,
    project_type: text,
    start_date: date,
    end_date: date.nullable().default(null),
    contract: money,
    budget: money,
    primary_activity: text,
    production_unit: z.enum(['LF', 'CY', 'TON', 'EA']),
    contract_quantity: decimal(),
    status: z.enum(['active', 'planned', 'completed']),
    notes: z.string().max(5000).default(''),
  })
  .refine(
    (v) => !v.end_date || v.end_date >= v.start_date,
    'Completion date must follow start date',
  )
export const classificationInput = z.object({
  name: text,
  union_type: z.enum(['Union', 'Non-union']),
})
export const laborRateInput = z
  .object({
    classification_id: text,
    effective_date: date,
    expiration_date: date.nullable().default(null),
    base: money,
    pension: money,
    health: money,
    vacation: money,
    training: money,
    other_fringe: money,
    payroll: money,
    burden: money,
    ot_multiplier: decimal(2, 3),
    dt_multiplier: decimal(2, 4),
  })
  .refine(
    (v) => Number(v.ot_multiplier) >= 1 && Number(v.dt_multiplier) >= 1,
    'Multipliers must be at least 1',
  )
export const itemInput = z.object({
  code: text,
  category: z.enum(['equipment', 'material', 'disposal']),
  name: text,
  unit: z.enum(['HR', 'DAY', 'LF', 'CY', 'TON', 'EA']),
  specification: z.string().max(500).default(''),
  vendor: z.string().max(200).default(''),
})
export const itemRateInput = z.object({
  item_id: text,
  effective_date: date,
  expiration_date: date.nullable().default(null),
  rate: money,
  source_note: z.string().max(500).default(''),
  derived: z.boolean().default(false),
  annual_ownership: money.default('0'),
  annual_operating: money.default('0'),
  annual_utilization: decimal(2, 8784).default('0'),
})
export const reportDraft = z.object({
  activity: z.string().max(200).default(''),
  quantity: decimal().nullable().default(null),
  unit: z.enum(['LF', 'CY', 'TON', 'EA']),
  workday_hours: decimal(2, 24).nullable().default(null),
  depth: decimal(2, 1000).nullable().default(null),
  conditions: z.string().max(2000).default(''),
  weather: z.string().max(500).default(''),
  safety: z.string().max(2000).default(''),
  delays: z.string().max(2000).default(''),
  notes: z.string().max(5000).default(''),
  labor: z
    .array(
      z.object({
        classification_id: text,
        workers: z.number().int().min(1).max(1000),
        regular: decimal(2, 24).nullable(),
        overtime: decimal(2, 24).nullable(),
        doubletime: decimal(2, 24).nullable(),
      }),
    )
    .max(100),
  usage: z
    .array(z.object({ item_id: text, quantity: decimal().nullable() }))
    .max(100),
  questions: z.array(z.string().max(500)).max(20).default([]),
  inherited_from: z.string().nullable().default(null),
  attribution_confirmed: z.boolean().default(false),
})
export type Draft = z.infer<typeof reportDraft>
