import type { User } from './types'
import { hasPermission } from '../shared/permissions'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plus, MapPin } from 'lucide-react'
import { api, currency, num, formatDate, today } from './api'
import type {
  Data,
  Project,
  Observation,
  ReportSummary,
  ItemRate,
} from './types'
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  FormDialog,
  Header,
  Metric,
  Panel,
} from './components'
import type { FieldConfig } from './components'
import { ReportList } from './ReportList'
export function ProjectDetail({
  id,
  projects,
  data,
  observations,
  reports,
  user,
  manager,
  writer,
  refresh,
  onReport,
}: {
  id: string
  projects: Project[]
  data: Data
  observations: Observation[]
  reports: ReportSummary[]
  user: User
  manager: boolean
  writer: boolean
  refresh: () => Promise<void>
  onReport: () => void
}) {
  const canRates = hasPermission(user.role, 'rates:read'),
    canCosts = hasPermission(user.role, 'costs:read'),
    canAssign = hasPermission(user.role, 'projects:assign')
  const p = projects.find((p) => p.id === id),
    [tab, setTab] = useState('overview'),
    [rates, setRates] = useState<ItemRate[]>([]),
    [dialog, setDialog] = useState<'rate' | 'status' | null>(null),
    [closing, setClosing] = useState<ItemRate | null>(null),
    [error, setError] = useState('')
  const load = useCallback(
    () =>
      canRates
        ? api<ItemRate[]>(`/projects/${id}/rates`).then(setRates)
        : Promise.resolve(),
    [id, canRates],
  )
  useEffect(() => {
    Promise.resolve()
      .then(load)
      .catch((e) => setError(e.message))
  }, [load])
  if (!p)
    return (
      <Empty title="Project not found">
        Select a project from the project list.
      </Empty>
    )
  const obs = observations.filter((o) => o.project_id === id),
    cost = obs.reduce((s, o) => s + o.total_cents, 0),
    qty = obs
      .filter(
        (o) =>
          o.activity === p.primary_activity && o.unit === p.production_unit,
      )
      .reduce((s, o) => s + Number(o.quantity), 0),
    pct = Number(p.contract_quantity)
      ? (qty / Number(p.contract_quantity)) * 100
      : 0
  const fields: FieldConfig[] =
    dialog === 'status'
      ? [
          {
            name: 'status',
            label: 'Status',
            value: p.status,
            required: true,
            options: ['active', 'planned', 'completed'].map((v) => ({
              label: v,
              value: v,
            })),
          },
        ]
      : [
          {
            name: 'item_id',
            label: 'Cost item',
            required: true,
            options: data.items.map((i) => ({
              label: `${i.name} · ${i.unit}`,
              value: i.id,
            })),
          },
          {
            name: 'rate',
            label: 'Job-specific rate ($ / item unit)',
            type: 'number',
            step: '.01',
            min: '0',
            required: true,
          },
          {
            name: 'effective_date',
            label: 'Effective date',
            type: 'date',
            required: true,
            value: today(),
          },
          {
            name: 'expiration_date',
            label: 'Expiration date (optional)',
            type: 'date',
          },
          {
            name: 'source_note',
            label: 'Quote / vendor / rate source',
            required: true,
          },
        ]
  return (
    <>
      <a href="#projects" className="back-link">
        <ArrowLeft size={15} />
        All projects
      </a>
      <Header
        title={p.name}
        action={
          <div className="row">
            <Badge value={p.status} />
            {manager && (
              <Button secondary onClick={() => setDialog('status')}>
                Update status
              </Button>
            )}
            {writer && p.status !== 'completed' && (
              <Button onClick={onReport}>
                <Plus size={17} />
                Daily report
              </Button>
            )}
          </div>
        }
      />
      <div className="tabs">
        {[
          ['overview', 'Overview'],
          ...(canRates ? [['costs', 'Project costs']] : []),
          ...(canAssign ? [['access', 'Team access']] : []),
          ['reports', 'Daily reports'],
        ].map(([key, label]) => (
          <button
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
            key={key}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {tab === 'overview' && (
        <>
          {canCosts ? (
            <div className="metrics">
              <Metric
                label="Actual direct cost"
                value={currency(cost)}
                note="Approved reports"
                accent
              />
              <Metric
                label="Direct-cost budget"
                value={currency(p.budget_cents)}
                note={`Remaining: ${currency(p.budget_cents - cost)}`}
              />
              <Metric
                label="Installed quantity"
                value={`${num(qty)} ${p.production_unit}`}
                note={p.primary_activity}
              />
              <Metric
                label="Scope complete"
                value={`${num(pct)}%`}
                note={`Contract: ${num(p.contract_quantity)} ${p.production_unit}`}
              />
            </div>
          ) : (
            <div className="metrics">
              <Metric
                label="Your daily reports"
                value={String(
                  reports.filter((r) => r.project_id === id).length,
                )}
              />
              <Metric
                label="Contract quantity"
                value={`${num(p.contract_quantity)} ${p.production_unit}`}
                note={p.primary_activity}
              />
            </div>
          )}
          <div className="dashboard-grid">
            <Panel
              title="Project context"
              subtitle="Geography stays attached to every observation."
            >
              <dl className="details">
                <div>
                  <dt>Job / client</dt>
                  <dd>
                    Job {p.job_number} · {p.client}
                  </dd>
                </div>
                <div>
                  <dt>
                    <MapPin size={16} />
                    Geography
                  </dt>
                  <dd>
                    {p.state} → {p.region} → {p.county} → {p.city}
                  </dd>
                </div>
                <div>
                  <dt>Schedule</dt>
                  <dd>
                    {formatDate(p.start_date)} →{' '}
                    {p.end_date ? formatDate(p.end_date) : 'Not set'}
                  </dd>
                </div>
                {canCosts && (
                  <div>
                    <dt>Contract value</dt>
                    <dd>{currency(p.contract_cents)}</dd>
                  </div>
                )}
                <div>
                  <dt>Primary activity</dt>
                  <dd>
                    {p.primary_activity} · {p.production_unit}
                  </dd>
                </div>
                <div>
                  <dt>Notes</dt>
                  <dd>{p.notes || 'No additional notes.'}</dd>
                </div>
              </dl>
            </Panel>
            {canCosts && (
              <Panel
                title="Cost composition"
                subtitle="Direct costs only · excludes overhead and profit"
              >
                {(['labor', 'equipment', 'material', 'disposal'] as const).map(
                  (category) => {
                    const c = obs.reduce(
                      (s, o) => s + o[`${category}_cents`],
                      0,
                    )
                    return (
                      <div className="cost-category" key={category}>
                        <div className="row spread">
                          <span className="capitalize">{category}</span>
                          <strong>{currency(c, 2)}</strong>
                        </div>
                        <div className={'cost-bar ' + category}>
                          <span
                            style={{ width: `${cost ? (c / cost) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    )
                  },
                )}
              </Panel>
            )}
          </div>
          <Panel title="Recent field reports">
            <ReportList
              reports={reports.filter((r) => r.project_id === id).slice(0, 5)}
            />
          </Panel>
        </>
      )}
      {tab === 'reports' && (
        <Panel title="Project report log">
          <ReportList reports={reports.filter((r) => r.project_id === id)} />
        </Panel>
      )}
      {tab === 'costs' && canRates && (
        <>
          <div className="notice">
            <strong>Job-specific rates take precedence.</strong> Rates are
            selected using the report work date. If no project rate applies, the
            dated company rate is used. Closing a rate preserves its amount and
            approved snapshots.
          </div>
          <Panel
            title="Project cost environment"
            subtitle="Materials, equipment, and disposal overrides"
            action={
              manager && (
                <Button onClick={() => setDialog('rate')}>
                  <Plus size={16} />
                  Add project rate
                </Button>
              )
            }
          >
            {!rates.length ? (
              <Empty title="Using company standard rates">
                Add a quoted job rate where a project has different costs.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Category</th>
                      <th>Rate</th>
                      <th>Effective</th>
                      <th>Expires</th>
                      <th>Source</th>
                      {manager && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.name}</strong>
                        </td>
                        <td className="capitalize">{r.category}</td>
                        <td>
                          {currency(r.rate_cents, 2)} / {r.unit}
                        </td>
                        <td>{r.effective_date}</td>
                        <td>{r.expiration_date || 'Open'}</td>
                        <td>{r.source_note}</td>
                        {manager && (
                          <td>
                            {!r.expiration_date && (
                              <button
                                className="text-link"
                                onClick={() => setClosing(r)}
                              >
                                Close period
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
      {tab === 'access' && canAssign && <ProjectAccess projectId={id} />}
      {dialog && (
        <FormDialog
          title={
            dialog === 'status'
              ? 'Update project status'
              : 'Add a project cost rate'
          }
          fields={fields}
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            if (dialog === 'status')
              await api(`/projects/${id}/status`, 'PATCH', v)
            else
              await api(`/projects/${id}/rates`, 'POST', {
                ...v,
                expiration_date: v.expiration_date || null,
              })
            await load()
            await refresh()
          }}
        />
      )}
      {closing && (
        <FormDialog
          title="Close project rate period"
          description="Approved cost snapshots will remain unchanged."
          fields={[
            {
              name: 'expiration_date',
              label: 'Last applicable date',
              type: 'date',
              required: true,
            },
          ]}
          onClose={() => setClosing(null)}
          onSubmit={async (v) => {
            await api(`/projects/${id}/rates/${closing.id}/close`, 'POST', v)
            await load()
          }}
        />
      )}
    </>
  )
}

function ProjectAccess({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<(User & { active: number })[]>([]),
    [users, setUsers] = useState<(User & { active: number })[]>([]),
    [adding, setAdding] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const [m, u] = await Promise.all([
      api<typeof members>(`/projects/${projectId}/members`),
      api<typeof users>('/users'),
    ])
    setMembers(m)
    setUsers(u)
  }, [projectId])
  useEffect(() => {
    Promise.resolve()
      .then(load)
      .catch((e) => setError(e.message))
  }, [load])
  return (
    <>
      <ErrorBox message={error} />
      <Panel
        title="Project assignments"
        subtitle="Foremen and project managers need an assignment to access this job. Owners/admins have company-wide access; estimators can view approved cost history."
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} />
            Assign team member
          </Button>
        }
      >
        {!members.length ? (
          <Empty title="No assigned team members">
            Assign project managers and foremen to give them access to this job.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Access</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>
                      <Badge value={m.role} />
                    </td>
                    <td>{m.active ? 'Active' : 'Account disabled'}</td>
                    <td>
                      <Button
                        secondary
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true)
                          try {
                            await api(
                              `/projects/${projectId}/members/${m.id}`,
                              'DELETE',
                            )
                            await load()
                          } catch (e) {
                            setError((e as Error).message)
                          } finally {
                            setBusy(false)
                          }
                        }}
                      >
                        Remove assignment
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {adding && (
        <FormDialog
          title="Assign project access"
          fields={[
            {
              name: 'user_id',
              label: 'Team member',
              required: true,
              options: users
                .filter(
                  (u) =>
                    u.active &&
                    ['foreman', 'project_manager'].includes(u.role) &&
                    !members.some((m) => m.id === u.id),
                )
                .map((u) => ({
                  value: u.id,
                  label: `${u.name} · ${u.role.replaceAll('_', ' ')}`,
                })),
            },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={async (v) => {
            await api(`/projects/${projectId}/members/${v.user_id}`, 'PUT')
            await load()
          }}
        />
      )}
    </>
  )
}
