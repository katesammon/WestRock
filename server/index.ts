import express from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { unlinkSync } from 'node:fs'
import { z, ZodError } from 'zod'
import { all, one, run, transaction, dataDir } from './db.ts'
import {
  authenticate,
  safeUser,
  hashPassword,
  verifyPassword,
  session,
  throttle,
  tokenFrom,
  tokenHash,
} from './auth.ts'
import {
  credentials,
  signup,
  role,
  projectInput,
  classificationInput,
  laborRateInput,
  itemInput,
  itemRateInput,
  reportDraft,
  date,
  money,
  decimal,
} from './validation.ts'
import { dollarsToCents, derivedEquipmentRate, statistics } from './finance.ts'
import { calculate, catalogs } from './costing.ts'
import { hasPermission } from '../shared/permissions.ts'
import {
  requirePermission as permit,
  requireProject,
  accessibleProjects,
  projectView,
  canReadReport,
  policy,
  reportStatus,
} from './access.ts'
import { provenance } from './provenance.ts'
import { validateSubmission } from './submission.ts'
import { transcribe, extract } from './ai.ts'

if (process.argv.includes('--production')) process.env.NODE_ENV = 'production'
const app = express()
app.disable('x-powered-by')
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
    const origin = new URL(req.headers.origin)
    if (origin.host !== req.headers.host) {
      res.status(403).json({ error: 'Cross-origin writes are not allowed.' })
      return
    }
  }
  next()
})
app.use(express.json({ limit: '1mb' }))
const now = () => new Date().toISOString()
function audit(
  actor: string | null,
  action: string,
  id: string,
  details: unknown = {},
) {
  run(
    'INSERT INTO audit_events VALUES (?,?,?,?,?,?)',
    randomUUID(),
    actor,
    action,
    id,
    JSON.stringify(details),
    now(),
  )
}
function required(row: any, label = 'Record') {
  if (!row)
    throw Object.assign(new Error(`${label} not found.`), { status: 404 })
  return row
}
function noOverlap(
  table: string,
  column: string,
  key: string,
  start: string,
  end: string | null,
  project?: string,
) {
  if (end && end < start)
    throw new Error('Expiration must be on or after effective date.')
  const existing = one(
    `SELECT id FROM ${table} WHERE ${column}=? ${project ? 'AND project_id=?' : ''} AND effective_date<=? AND (expiration_date IS NULL OR expiration_date>=?)`,
    ...[key, ...(project ? [project] : []), end || '9999-12-31', start],
  )
  if (existing)
    throw new Error(
      'Rate dates overlap an existing rate. Use a non-overlapping period. Close an open rate first.',
    )
}
function writableReport(
  req: express.Request,
  res: express.Response,
  review = false,
) {
  const r = required(
    one('SELECT * FROM reports WHERE id=?', req.params.id),
    'Report',
  )
  canReadReport(res.locals.user, r)
  if (r.submitted_at && !review)
    throw Object.assign(
      new Error(
        'This report is submitted for review. A manager must return it before editing.',
      ),
      { status: 409 },
    )
  if (r.status !== 'draft')
    throw new Error(
      'Approved reports are immutable. Create a new report for additional work.',
    )
  if (
    r.author_id !== res.locals.user.id &&
    !hasPermission(res.locals.user.role, 'reports:approve')
  )
    throw Object.assign(
      new Error('Only the author or a manager may change this draft.'),
      { status: 403 },
    )
  return r
}
function previous(
  projectId: string,
  workDate: string,
  actor: import('./access.ts').Actor,
) {
  const r = one(
    `SELECT id,work_date,approved_json FROM reports WHERE project_id=? AND work_date<? AND status='approved' ${policy(actor).reports === 'own' ? 'AND author_id=?' : ''} ORDER BY work_date DESC,approved_at DESC LIMIT 1`,
    projectId,
    workDate,
    ...(policy(actor).reports === 'own' ? [actor.id] : []),
  )
  return r
    ? { id: r.id, work_date: r.work_date, draft: JSON.parse(r.approved_json) }
    : null
}
app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/api/auth/status', (_req, res) =>
  res.json({ needsSetup: !one('SELECT id FROM users LIMIT 1') }),
)
app.post('/api/auth/setup', throttle, (req, res) => {
  const input = signup.parse(req.body)
  const user = transaction(() => {
    if (one('SELECT id FROM users LIMIT 1'))
      throw Object.assign(new Error('Setup is already complete. Sign in.'), {
        status: 409,
      })
    const company = randomUUID(),
      id = randomUUID()
    run('INSERT INTO companies VALUES (?,?,?)', company, input.company, now())
    run(
      'INSERT INTO users VALUES (?,?,?,?,?,?,1,?)',
      id,
      company,
      input.name,
      input.email,
      hashPassword(input.password),
      'owner',
      now(),
    )
    audit(id, 'company.created', company)
    return one('SELECT * FROM users WHERE id=?', id)
  })
  session(res, user.id)
  res.status(201).json(safeUser(user))
})
app.post('/api/auth/login', throttle, (req, res) => {
  const input = credentials.parse(req.body),
    user = one('SELECT * FROM users WHERE email=? AND active=1', input.email)
  // Do the same expensive hash operation even for unknown accounts.
  if (!user) {
    hashPassword(input.password)
    res.status(401).json({ error: 'Email or password is incorrect.' })
    return
  }
  if (!verifyPassword(input.password, user.password_hash)) {
    res.status(401).json({ error: 'Email or password is incorrect.' })
    return
  }
  session(res, user.id)
  res.json(safeUser(user))
})
app.use('/api', authenticate)
app.get('/api/me', (_req, res) => res.json(safeUser(res.locals.user)))
app.post('/api/auth/logout', (req, res) => {
  run('DELETE FROM sessions WHERE token_hash=?', tokenHash(tokenFrom(req)))
  res.clearCookie('westrock_session', { path: '/' })
  res.json({ ok: true })
})
app.post('/api/auth/password', (req, res) => {
  const input = z
    .object({
      current: z.string().max(128),
      password: z.string().min(12).max(128),
    })
    .parse(req.body)
  if (!verifyPassword(input.current, res.locals.user.password_hash))
    throw new Error('Current password is incorrect.')
  transaction(() => {
    run(
      'UPDATE users SET password_hash=? WHERE id=?',
      hashPassword(input.password),
      res.locals.user.id,
    )
    run('DELETE FROM sessions WHERE user_id=?', res.locals.user.id)
    audit(res.locals.user.id, 'password.changed', res.locals.user.id)
  })
  session(res, res.locals.user.id)
  res.json({ ok: true })
})
app.get('/api/data', (_req, res) => {
  const c = catalogs(),
    rates = hasPermission(res.locals.user.role, 'rates:read')
  res.json({
    ...c,
    laborRates: rates ? c.laborRates : [],
    itemRates: rates ? c.itemRates : [],
    employees: hasPermission(res.locals.user.role, 'employees:read')
      ? c.employees
      : [],
    items: rates
      ? c.items
      : c.items.map((item) => ({
          id: item.id,
          code: item.code,
          name: item.name,
          category: item.category,
          unit: item.unit,
          active: item.active,
        })),
    company: one('SELECT id,name FROM companies LIMIT 1'),
    aiEnabled: !!process.env.AI_API_KEY,
  })
})
app.get('/api/users', permit('users:manage'), (_req, res) =>
  res.json(all('SELECT id,name,email,role,active FROM users ORDER BY name')),
)
app.post('/api/users', permit('users:manage'), (req, res) => {
  const input = credentials
    .extend({
      name: z.string().trim().min(1).max(200),
      role: role.exclude(['owner']),
    })
    .parse(req.body)
  const id = randomUUID()
  run(
    'INSERT INTO users VALUES (?,?,?,?,?,?,1,?)',
    id,
    res.locals.user.company_id,
    input.name,
    input.email,
    hashPassword(input.password),
    input.role,
    now(),
  )
  audit(res.locals.user.id, 'user.created', id, { role: input.role })
  res.status(201).json({ id })
})
app.patch('/api/users/:id', permit('users:manage'), (req, res) => {
  const target = required(
    one(
      'SELECT * FROM users WHERE id=? AND company_id=?',
      req.params.id,
      res.locals.user.company_id,
    ),
    'User',
  )
  if (target.role === 'owner' || target.id === res.locals.user.id)
    throw new Error('Owner access and your own account cannot be changed here.')
  const v = z
    .object({
      role: role.exclude(['owner']).optional(),
      active: z.boolean().optional(),
    })
    .strict()
    .refine(
      (v) => v.role !== undefined || v.active !== undefined,
      'Provide role or active status',
    )
    .parse(req.body)
  transaction(() => {
    run(
      'UPDATE users SET role=?,active=? WHERE id=?',
      v.role ?? target.role,
      v.active === undefined ? target.active : Number(v.active),
      target.id,
    )
    run('DELETE FROM sessions WHERE user_id=?', target.id)
    audit(res.locals.user.id, 'user.access_changed', target.id, {
      role: v.role ?? target.role,
      active: v.active ?? !!target.active,
    })
  })
  res.json({ ok: true })
})
app.post('/api/classifications', permit('rates:manage'), (req, res) => {
  const v = classificationInput.parse(req.body),
    id = randomUUID()
  run('INSERT INTO classifications VALUES (?,?,?,1)', id, v.name, v.union_type)
  audit(res.locals.user.id, 'classification.created', id)
  res.status(201).json({ id })
})
app.post('/api/labor-rates', permit('rates:manage'), (req, res) => {
  const v = laborRateInput.parse(req.body)
  required(
    one('SELECT id FROM classifications WHERE id=?', v.classification_id),
    'Classification',
  )
  noOverlap(
    'labor_rates',
    'classification_id',
    v.classification_id,
    v.effective_date,
    v.expiration_date,
  )
  const id = randomUUID(),
    fringe = [
      v.pension,
      v.health,
      v.vacation,
      v.training,
      v.other_fringe,
    ].reduce((a, b) => a + dollarsToCents(b), 0)
  run(
    'INSERT INTO labor_rates VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    id,
    v.classification_id,
    v.effective_date,
    v.expiration_date,
    dollarsToCents(v.base),
    fringe,
    dollarsToCents(v.payroll),
    dollarsToCents(v.burden),
    v.ot_multiplier,
    v.dt_multiplier,
    JSON.stringify(v),
  )
  audit(res.locals.user.id, 'labor_rate.created', id)
  res.status(201).json({ id })
})
app.post('/api/employees', permit('rates:manage'), (req, res) => {
  const v = z
    .object({
      employee_code: z.string().min(1).max(100),
      name: z.string().min(1).max(200),
      role: z.string().min(1).max(200),
      classification_id: z.string(),
    })
    .parse(req.body)
  required(
    one('SELECT id FROM classifications WHERE id=?', v.classification_id),
    'Classification',
  )
  const id = randomUUID()
  run(
    'INSERT INTO employees VALUES (?,?,?,?,?,1)',
    id,
    v.employee_code,
    v.name,
    v.role,
    v.classification_id,
  )
  audit(res.locals.user.id, 'employee.created', id)
  res.status(201).json({ id })
})
app.post('/api/items', permit('rates:manage'), (req, res) => {
  const v = itemInput.parse(req.body)
  if (v.category === 'equipment' && !['HR', 'DAY', 'EA'].includes(v.unit))
    throw new Error('Equipment units must be HR, DAY, or EA.')
  const id = randomUUID()
  run(
    'INSERT INTO cost_items VALUES (?,?,?,?,?,?,1)',
    id,
    v.code,
    v.category,
    v.name,
    v.unit,
    JSON.stringify({ specification: v.specification, vendor: v.vendor }),
  )
  audit(res.locals.user.id, 'item.created', id)
  res.status(201).json({ id })
})
app.post('/api/item-rates', permit('rates:manage'), (req, res) => {
  const v = itemRateInput.parse(req.body),
    item = required(
      one('SELECT * FROM cost_items WHERE id=?', v.item_id),
      'Item',
    )
  if (v.derived && (item.category !== 'equipment' || item.unit !== 'HR'))
    throw new Error(
      'Derived ownership/operating rates require hourly equipment.',
    )
  noOverlap(
    'item_rates',
    'item_id',
    v.item_id,
    v.effective_date,
    v.expiration_date,
  )
  const id = randomUUID()
  const cents = v.derived
    ? derivedEquipmentRate(
        v.annual_ownership,
        v.annual_operating,
        v.annual_utilization,
      )
    : dollarsToCents(v.rate)
  run(
    'INSERT INTO item_rates VALUES (?,?,?,?,?,?)',
    id,
    v.item_id,
    v.effective_date,
    v.expiration_date,
    cents,
    JSON.stringify(v),
  )
  audit(res.locals.user.id, 'item_rate.created', id)
  res.status(201).json({ id })
})
// Close only open future eligibility, never modify an applicable historical rate amount.
app.post('/api/rates/:kind/:id/close', permit('rates:manage'), (req, res) => {
  const table =
    req.params.kind === 'labor'
      ? 'labor_rates'
      : req.params.kind === 'item'
        ? 'item_rates'
        : null
  if (!table) throw new Error('Invalid rate type')
  const end = date.parse(req.body.expiration_date),
    r = required(
      one(`SELECT * FROM ${table} WHERE id=?`, req.params.id),
      'Rate',
    )
  if (r.expiration_date) throw new Error('This rate is already closed.')
  if (end < r.effective_date)
    throw new Error('Expiration precedes effective date.')
  // No historical reports or snapshots are recalculated. Closing a rate cannot invalidate already approved usage.
  const latest = one(
    'SELECT MAX(r.work_date) AS date FROM cost_lines c JOIN reports r ON c.report_id=r.id WHERE c.rate_id=?',
    r.id,
  )
  if (latest?.date && end < latest.date)
    throw new Error(
      'Cannot close before an approved report that used this rate.',
    )
  run(`UPDATE ${table} SET expiration_date=? WHERE id=?`, end, r.id)
  audit(res.locals.user.id, 'rate.closed', r.id, { expiration_date: end })
  res.json({ ok: true })
})
app.get('/api/projects', (_req, res) =>
  res.json(
    accessibleProjects(res.locals.user).map((p) =>
      projectView(res.locals.user, p),
    ),
  ),
)
app.post('/api/projects', permit('projects:create'), (req, res) => {
  const v = projectInput.parse(req.body),
    id = randomUUID()
  run(
    'INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id,
    v.job_number,
    v.name,
    v.client,
    v.state,
    v.region,
    v.county,
    v.city,
    v.project_type,
    v.start_date,
    v.end_date,
    dollarsToCents(v.contract),
    dollarsToCents(v.budget),
    v.primary_activity,
    v.production_unit,
    v.contract_quantity,
    v.status,
    v.notes,
    now(),
  )
  if (policy(res.locals.user).projects === 'assigned')
    run(
      'INSERT INTO project_members VALUES (?,?,?,?)',
      id,
      res.locals.user.id,
      res.locals.user.id,
      now(),
    )
  audit(res.locals.user.id, 'project.created', id)
  res.status(201).json({ id })
})
app.patch('/api/projects/:id/status', permit('projects:edit'), (req, res) => {
  const status = z
    .enum(['active', 'planned', 'completed'])
    .parse(req.body.status)
  requireProject(res.locals.user, String(req.params.id))
  run('UPDATE projects SET status=? WHERE id=?', status, req.params.id)
  audit(res.locals.user.id, 'project.status_changed', String(req.params.id), {
    status,
  })
  res.json({ ok: true })
})
app.use('/api/projects/:id', (req, res, next) => {
  try {
    requireProject(res.locals.user, String(req.params.id))
    next()
  } catch (e) {
    next(e)
  }
})
app.get('/api/projects/:id/members', permit('projects:assign'), (req, res) =>
  res.json(
    all(
      'SELECT u.id,u.name,u.role,u.active FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY u.name',
      req.params.id,
    ),
  ),
)
app.put(
  '/api/projects/:id/members/:userId',
  permit('projects:assign'),
  (req, res) => {
    const user = required(
      one(
        'SELECT id FROM users WHERE id=? AND company_id=? AND active=1',
        req.params.userId,
        res.locals.user.company_id,
      ),
      'Active user',
    )
    run(
      'INSERT OR IGNORE INTO project_members VALUES (?,?,?,?)',
      req.params.id,
      user.id,
      res.locals.user.id,
      now(),
    )
    audit(
      res.locals.user.id,
      'project.member_assigned',
      String(req.params.id),
      { user_id: user.id },
    )
    res.json({ ok: true })
  },
)
app.delete(
  '/api/projects/:id/members/:userId',
  permit('projects:assign'),
  (req, res) => {
    run(
      'DELETE FROM project_members WHERE project_id=? AND user_id=?',
      req.params.id,
      req.params.userId,
    )
    audit(res.locals.user.id, 'project.member_removed', String(req.params.id), {
      user_id: req.params.userId,
    })
    res.json({ ok: true })
  },
)
app.get('/api/projects/:id/rates', permit('rates:read'), (req, res) => {
  requireProject(res.locals.user, String(req.params.id))
  res.json(
    all(
      'SELECT r.*,i.name,i.unit,i.category FROM project_rates r JOIN cost_items i ON i.id=r.item_id WHERE project_id=? ORDER BY effective_date DESC',
      req.params.id,
    ),
  )
})
app.post('/api/projects/:id/rates', permit('projects:edit'), (req, res) => {
  requireProject(res.locals.user, String(req.params.id))
  const v = z
    .object({
      item_id: z.string(),
      effective_date: date,
      expiration_date: date.nullable().default(null),
      rate: money,
      source_note: z.string().min(1).max(500),
    })
    .parse(req.body)
  required(one('SELECT id FROM cost_items WHERE id=?', v.item_id), 'Item')
  noOverlap(
    'project_rates',
    'item_id',
    v.item_id,
    v.effective_date,
    v.expiration_date,
    String(req.params.id),
  )
  const id = randomUUID()
  run(
    'INSERT INTO project_rates VALUES (?,?,?,?,?,?,?)',
    id,
    req.params.id,
    v.item_id,
    v.effective_date,
    v.expiration_date,
    dollarsToCents(v.rate),
    v.source_note,
  )
  audit(res.locals.user.id, 'project_rate.created', id)
  res.status(201).json({ id })
})
app.post(
  '/api/projects/:id/rates/:rateId/close',
  permit('projects:edit'),
  (req, res) => {
    const r = required(
        one(
          'SELECT * FROM project_rates WHERE id=? AND project_id=?',
          req.params.rateId,
          req.params.id,
        ),
        'Project rate',
      ),
      end = date.parse(req.body.expiration_date)
    if (r.expiration_date || end < r.effective_date)
      throw new Error(
        'Rate must be open and expiration must follow effective date.',
      )
    const latest = one(
      'SELECT MAX(r.work_date) AS date FROM cost_lines c JOIN reports r ON r.id=c.report_id WHERE c.rate_id=?',
      r.id,
    )
    if (latest?.date && end < latest.date)
      throw new Error('Cannot invalidate approved rate usage.')
    run('UPDATE project_rates SET expiration_date=? WHERE id=?', end, r.id)
    audit(res.locals.user.id, 'project_rate.closed', r.id, {
      expiration_date: end,
    })
    res.json({ ok: true })
  },
)
app.get('/api/reports', (_req, res) => {
  const user = res.locals.user,
    ids = new Set(accessibleProjects(user).map((p) => p.id)),
    scope = policy(user).reports
  const rows = all(
    'SELECT r.id,r.project_id,r.author_id,r.work_date,r.status,r.submitted_at,r.created_at,r.approved_at,p.name AS project_name,p.job_number,u.name AS author_name,o.total_cents,o.quantity,o.unit FROM reports r JOIN projects p ON p.id=r.project_id JOIN users u ON u.id=r.author_id LEFT JOIN observations o ON o.report_id=r.id ORDER BY r.work_date DESC,r.created_at DESC',
  )
  res.json(
    rows
      .filter(
        (r) =>
          ids.has(r.project_id) &&
          (scope !== 'own' || r.author_id === user.id) &&
          (scope !== 'approved' || r.status === 'approved'),
      )
      .map((r) => {
        const { total_cents, ...field } = r
        return {
          ...field,
          status: reportStatus(r),
          ...(hasPermission(user.role, 'costs:read') ? { total_cents } : {}),
        }
      }),
  )
})
app.post('/api/reports', permit('reports:write'), (req, res) => {
  const v = z
      .object({ project_id: z.string(), work_date: date })
      .parse(req.body),
    p = requireProject(res.locals.user, v.project_id)
  if (p.status === 'completed')
    throw new Error('Reopen this project before adding reports.')
  const id = randomUUID(),
    draft = reportDraft.parse({
      activity: p.primary_activity,
      unit: p.production_unit,
      labor: [],
      usage: [],
    })
  run(
    'INSERT INTO reports (id,project_id,author_id,work_date,status,transcript,audio_key,extraction_json,draft_json,approved_json,created_at,approved_at,approved_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id,
    p.id,
    res.locals.user.id,
    v.work_date,
    'draft',
    '',
    null,
    null,
    JSON.stringify(draft),
    null,
    now(),
    null,
    null,
  )
  audit(res.locals.user.id, 'report.created', id)
  res.status(201).json({ id })
})
app.get('/api/reports/:id', (req, res) => {
  const r = required(
    one(
      'SELECT r.*,u.name AS author_name FROM reports r JOIN users u ON u.id=r.author_id WHERE r.id=?',
      req.params.id,
    ),
    'Report',
  )
  canReadReport(res.locals.user, r)
  const finance = hasPermission(res.locals.user.role, 'costs:read')
  res.json({
    ...r,
    status: reportStatus(r),
    review_note:
      JSON.parse(
        one(
          "SELECT details_json FROM audit_events WHERE entity_id=? AND action='report.returned' ORDER BY created_at DESC LIMIT 1",
          r.id,
        )?.details_json || '{}',
      ).reason || null,
    draft: JSON.parse(r.draft_json),
    extraction: r.extraction_json ? JSON.parse(r.extraction_json) : null,
    approved: r.approved_json ? JSON.parse(r.approved_json) : null,
    lines: finance
      ? all('SELECT * FROM cost_lines WHERE report_id=?', r.id)
      : [],
    observation: finance
      ? one('SELECT * FROM observations WHERE report_id=?', r.id) || null
      : null,
    previous: previous(r.project_id, r.work_date, res.locals.user),
  })
})
app.put('/api/reports/:id', permit('reports:write'), (req, res) => {
  const r = writableReport(req, res)
  const v = z
    .object({
      transcript: z.string().max(30000),
      draft: reportDraft,
      revision: z.number().int().min(0),
    })
    .parse(req.body)
  if (v.revision !== r.revision)
    throw Object.assign(
      new Error('This draft changed in another session. Reload before saving.'),
      { status: 409 },
    )
  run(
    'UPDATE reports SET transcript=?,draft_json=?,revision=revision+1 WHERE id=?',
    v.transcript,
    JSON.stringify(v.draft),
    req.params.id,
  )
  audit(res.locals.user.id, 'report.draft_saved', String(req.params.id), {
    source: 'User entry',
  })
  res.json({ ok: true, revision: r.revision + 1 })
})
const upload = multer({
  storage: multer.diskStorage({
    destination: resolve(dataDir, 'audio'),
    filename: (_req, file, cb) =>
      cb(
        null,
        randomUUID() +
          ({
            'audio/webm': '.webm',
            'audio/mp4': '.mp4',
            'audio/mpeg': '.mp3',
            'audio/wav': '.wav',
            'audio/ogg': '.ogg',
            'video/webm': '.webm',
          }[file.mimetype] || '.webm'),
      ),
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    [
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'video/webm',
    ].includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Use WebM, MP4, MP3, WAV, or OGG audio.')),
})
app.post(
  '/api/reports/:id/audio',
  permit('reports:write'),
  (req, res, next) => {
    try {
      writableReport(req, res)
      next()
    } catch (e) {
      next(e)
    }
  },
  upload.single('audio'),
  (req, res) => {
    if (!req.file) throw new Error('No audio file received.')
    const r = writableReport(req, res)
    run('UPDATE reports SET audio_key=? WHERE id=?', req.file.filename, r.id)
    if (r.audio_key)
      try {
        unlinkSync(resolve(dataDir, 'audio', r.audio_key))
      } catch {}
    audit(res.locals.user.id, 'report.audio_uploaded', r.id)
    res.json({ ok: true })
  },
)
app.get('/api/reports/:id/audio', (req, res) => {
  const r = required(
    one('SELECT * FROM reports WHERE id=?', req.params.id),
    'Report',
  )
  canReadReport(res.locals.user, r)
  if (!r.audio_key) throw new Error('No recording available.')
  res.sendFile(resolve(dataDir, 'audio', r.audio_key))
})
app.post(
  '/api/reports/:id/transcribe',
  permit('reports:write'),
  async (req, res) => {
    const r = writableReport(req, res)
    if (!r.audio_key) throw new Error('Record or upload audio first.')
    const text = await transcribe(
      resolve(dataDir, 'audio', r.audio_key),
      r.audio_key,
      'audio/' + r.audio_key.split('.').at(-1),
    )
    // A concurrent approval must never be mutated by a slow provider response.
    if (writableReport(req, res).revision !== r.revision)
      throw Object.assign(
        new Error(
          'Draft changed while transcribing. Retry after reviewing current inputs.',
        ),
        { status: 409 },
      )
    run(
      'UPDATE reports SET transcript=?,revision=revision+1 WHERE id=?',
      text,
      r.id,
    )
    audit(res.locals.user.id, 'report.transcribed', r.id, {
      model: 'gpt-4o-mini-transcribe',
    })
    res.json({ transcript: text, revision: r.revision + 1 })
  },
)
app.post(
  '/api/reports/:id/extract',
  permit('reports:write'),
  async (req, res) => {
    const r = writableReport(req, res)
    if (!r.transcript.trim()) throw new Error('Provide a transcript first.')
    const c = catalogs(),
      p = one(
        'SELECT job_number,name,primary_activity,production_unit FROM projects WHERE id=?',
        r.project_id,
      )
    const extraction = await extract(
      r.transcript,
      {
        classifications: c.classifications.map((v) => ({
          id: v.id,
          name: v.name,
        })),
        items: c.items.map((v) => ({
          id: v.id,
          name: v.name,
          unit: v.unit,
          category: v.category,
        })),
      },
      p,
      previous(r.project_id, r.work_date, res.locals.user),
    )
    if (writableReport(req, res).revision !== r.revision)
      throw Object.assign(
        new Error(
          'Draft changed during extraction. Reload before trying again.',
        ),
        { status: 409 },
      )
    if (
      one('SELECT transcript FROM reports WHERE id=?', r.id).transcript !==
      r.transcript
    )
      throw new Error(
        'Transcript changed during extraction. Retry using the saved transcript.',
      )
    run(
      'UPDATE reports SET extraction_json=?,draft_json=?,revision=revision+1 WHERE id=?',
      JSON.stringify({ ...extraction, transcript: r.transcript }),
      JSON.stringify(extraction.draft),
      r.id,
    )
    audit(res.locals.user.id, 'report.extracted', r.id)
    res.json(extraction)
  },
)
app.post('/api/reports/:id/submit', permit('reports:submit'), (req, res) => {
  const r = writableReport(req, res),
    version = z.number().int().min(0).parse(req.body.revision)
  if (version !== r.revision)
    throw Object.assign(new Error('Draft changed. Reload before submitting.'), {
      status: 409,
    })
  const draft = reportDraft.parse(JSON.parse(r.draft_json))
  const errors = validateSubmission(draft)
  if (errors.length) throw new Error(errors.join(' '))
  run(
    'UPDATE reports SET submitted_at=?,revision=revision+1 WHERE id=?',
    now(),
    r.id,
  )
  audit(res.locals.user.id, 'report.submitted', r.id)
  res.json({ ok: true })
})
app.post('/api/reports/:id/return', permit('reports:approve'), (req, res) => {
  const r = writableReport(req, res, true)
  if (!r.submitted_at)
    throw new Error('Only submitted reports can be returned.')
  const reason = z.string().trim().min(1).max(1000).parse(req.body.reason)
  run(
    'UPDATE reports SET submitted_at=NULL,revision=revision+1 WHERE id=?',
    r.id,
  )
  audit(res.locals.user.id, 'report.returned', r.id, { reason })
  res.json({ ok: true })
})
app.post(
  '/api/reports/:id/calculate',
  permit('reports:approve'),
  (req, res) => {
    const r = writableReport(req, res, true)
    res.json({
      ...calculate(r.project_id, r.work_date, JSON.parse(r.draft_json)),
      revision: r.revision,
    })
  },
)
app.post('/api/reports/:id/approve', permit('reports:approve'), (req, res) => {
  const result = transaction(() => {
    const r = writableReport(req, res, true),
      d = reportDraft.parse(JSON.parse(r.draft_json)),
      cost = calculate(r.project_id, r.work_date, d)
    const version = z
      .object({
        revision: z.number().int().min(0),
        calculation_hash: z.string().length(64),
      })
      .parse(req.body)
    if (version.revision !== r.revision)
      throw Object.assign(
        new Error(
          'The report changed after calculation. Reload, review, and recalculate before approving.',
        ),
        { status: 409 },
      )
    if (cost.errors.length) throw new Error(cost.errors.join(' '))
    if (version.calculation_hash !== cost.calculation_hash)
      throw Object.assign(
        new Error(
          'Rates or inputs changed after calculation. Review the updated costs before approval.',
        ),
        { status: 409 },
      )
    const p = one('SELECT * FROM projects WHERE id=?', r.project_id),
      stamp = now()
    for (const e of d.labor)
      run(
        'INSERT INTO labor_entries VALUES (?,?,?,?,?,?,?)',
        randomUUID(),
        r.id,
        e.classification_id,
        e.workers,
        e.regular,
        e.overtime,
        e.doubletime,
      )
    for (const e of d.usage)
      run(
        'INSERT INTO usage_entries VALUES (?,?,?,?)',
        randomUUID(),
        r.id,
        e.item_id,
        e.quantity,
      )
    run(
      'INSERT INTO production_entries VALUES (?,?,?,?,?,?,?)',
      r.id,
      d.activity,
      d.quantity,
      d.unit,
      d.workday_hours,
      d.depth,
      d.conditions,
    )
    for (const l of cost.lines)
      run(
        'INSERT INTO cost_lines VALUES (?,?,?,?,?,?,?,?,?,?)',
        randomUUID(),
        r.id,
        l.category,
        l.label,
        l.quantity,
        l.unit,
        l.rate_id,
        l.rate_source,
        JSON.stringify(l.rate_snapshot),
        l.cost_cents,
      )
    const id = randomUUID()
    run(
      'INSERT INTO observations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id,
      r.id,
      p.id,
      r.work_date,
      p.state,
      p.region,
      p.county,
      p.city,
      p.project_type,
      d.activity,
      d.unit,
      d.quantity,
      d.workday_hours,
      d.depth,
      d.conditions,
      cost.totals.labor,
      cost.totals.equipment,
      cost.totals.material,
      cost.totals.disposal,
      cost.total_cents,
      cost.unit_cost_cents,
      cost.production_per_hour,
    )
    run(
      "UPDATE reports SET status='approved',approved_json=?,approved_at=?,approved_by=? WHERE id=?",
      JSON.stringify({
        values: d,
        source: r.extraction_json ? 'Human-reviewed extraction' : 'User entry',
        transcript: r.transcript,
        provenance: provenance(
          d,
          r.extraction_json ? JSON.parse(r.extraction_json).draft : null,
        ),
      }),
      stamp,
      res.locals.user.id,
      r.id,
    )
    audit(res.locals.user.id, 'report.approved', r.id, {
      total_cents: cost.total_cents,
      observation_id: id,
    })
    return { id: r.id, observation_id: id, ...cost }
  })
  res.json(result)
})
app.get('/api/observations', permit('costs:read'), (req, res) => {
  const filters = z
    .object({
      region: z.string().max(200).optional(),
      activity: z.string().max(200).optional(),
      unit: z.string().max(10).optional(),
      from: date.optional(),
      to: date.optional(),
      project_id: z.string().optional(),
      min_depth: decimal(2, 1000).optional(),
      max_depth: decimal(2, 1000).optional(),
    })
    .parse(req.query)
  const clauses: string[] = [],
    params: any[] = []
  for (const k of ['region', 'activity', 'unit', 'project_id'] as const)
    if (filters[k]) {
      clauses.push(`o.${k}=?`)
      params.push(filters[k])
    }
  if (filters.from) {
    clauses.push('o.work_date>=?')
    params.push(filters.from)
  }
  if (filters.to) {
    clauses.push('o.work_date<=?')
    params.push(filters.to)
  }
  if (filters.min_depth) {
    clauses.push('CAST(o.depth AS REAL)>=?')
    params.push(Number(filters.min_depth))
  }
  if (filters.max_depth) {
    clauses.push('CAST(o.depth AS REAL)<=?')
    params.push(Number(filters.max_depth))
  }
  if (filters.project_id) requireProject(res.locals.user, filters.project_id)
  const visibleIds = accessibleProjects(res.locals.user).map((p) => p.id)
  if (!visibleIds.length) {
    res.json({ observations: [], groups: [] })
    return
  }
  clauses.push(`o.project_id IN (${visibleIds.map(() => '?').join(',')})`)
  params.push(...visibleIds)
  const observations = all(
    `SELECT o.*,p.job_number,p.name AS project_name FROM observations o JOIN projects p ON p.id=o.project_id ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY o.work_date DESC`,
    ...params,
  )
  const groups = new Map<string, any[]>()
  for (const o of observations) {
    const key = JSON.stringify([o.activity, o.unit])
    groups.set(key, [...(groups.get(key) || []), o])
  }
  res.json({
    observations,
    groups: [...groups].map(([key, rows]) => {
      const [activity, unit] = JSON.parse(key)
      return {
        activity,
        unit,
        ...statistics(rows),
        recent: statistics(rows.slice(0, 10)),
      }
    }),
  })
})
app.get('/api/audit', permit('audit:read'), (_req, res) =>
  res.json(
    all(
      'SELECT a.*,u.name AS actor FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100',
    ),
  ),
)
app.use('/api', (_req, res) =>
  res.status(404).json({ error: 'API endpoint not found.' }),
)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist')))
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')))
}
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: error.issues
          .map((i) => `${i.path.join('.') || 'Input'}: ${i.message}`)
          .join('; '),
      })
      return
    }
    if (
      error.code?.startsWith('SQLITE_CONSTRAINT') ||
      /UNIQUE constraint|FOREIGN KEY constraint/.test(error.message)
    ) {
      res.status(409).json({
        error:
          'This record conflicts with existing data. Check IDs, names, and referenced records.',
      })
      return
    }
    if (/values for|has \d+ columns/.test(error.message)) {
      console.error(error)
      res.status(500).json({ error: 'Database operation failed.' })
      return
    }
    const status = error.status || 400
    if (status >= 500) console.error(error)
    res.status(status).json({
      error:
        status >= 500
          ? 'The server could not complete this request.'
          : error.message || 'Request failed.',
    })
  },
)
const port = Number(process.env.PORT || 3001)
app.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log(`WestRock API listening on port ${port}`),
)
