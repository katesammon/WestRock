import { useCallback, useEffect, useState } from 'react'
import { Plus, LockKeyhole, ShieldCheck } from 'lucide-react'
import { api, currency, today } from './api'
import type { Data, User, ItemRate, LaborRate } from './types'
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  FormDialog,
  Header,
  Panel,
} from './components'
import type { FieldConfig } from './components'
type Dialog = {
  title: string
  description?: string
  path: string
  fields: FieldConfig[]
  transform?: (v: Record<string, string>) => unknown
}
const field = (
  name: string,
  label: string,
  extra: Partial<FieldConfig> = {},
): FieldConfig => ({ name, label, required: true, ...extra })
const dollars = (name: string, label: string, value?: string): FieldConfig =>
  field(name, label, { type: 'number', step: '.01', min: '0', value })
const dates: FieldConfig[] = [
  field('effective_date', 'Effective date', { type: 'date', value: today() }),
  field('expiration_date', 'Expiration date', {
    type: 'date',
    required: false,
  }),
]
const withEnd = (v: Record<string, string>) => ({
  ...v,
  expiration_date: v.expiration_date || null,
})
export function Admin({
  data,
  user,
  refresh,
}: {
  data: Data
  user: User
  refresh: () => Promise<void>
}) {
  const [tab, setTab] = useState('labor'),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [users, setUsers] = useState<(User & { active: number })[]>([]),
    [audit, setAudit] = useState<
      {
        id: string
        actor: string
        action: string
        created_at: string
        entity_id: string
      }[]
    >([]),
    [error, setError] = useState('')
  const editable = ['owner', 'admin'].includes(user.role)
  const loadPrivate = useCallback(async () => {
    if (editable) {
      const [u, a] = await Promise.all([
        api<(User & { active: number })[]>('/users'),
        api<typeof audit>('/audit'),
      ])
      setUsers(u)
      setAudit(a)
    }
  }, [editable])
  useEffect(() => {
    Promise.resolve()
      .then(loadPrivate)
      .catch((e) => setError(e.message))
  }, [loadPrivate])
  const classifications = data.classifications.map((c) => ({
    value: c.id,
    label: c.name,
  }))
  function addClassification() {
    setDialog({
      title: 'Add labor classification',
      path: '/classifications',
      fields: [
        field('name', 'Classification name'),
        field('union_type', 'Employment type', {
          options: ['Union', 'Non-union'].map((v) => ({ label: v, value: v })),
        }),
      ],
    })
  }
  function addLaborRate() {
    setDialog({
      title: 'Add historical labor rate',
      description:
        'All wage, fringe, tax, and burden inputs are dollars per hour. Multipliers apply to base wage only.',
      path: '/labor-rates',
      fields: [
        field('classification_id', 'Classification', {
          options: classifications,
        }),
        ...dates,
        dollars('base', 'Base wage ($/HR)'),
        dollars('pension', 'Pension ($/HR)', '0'),
        dollars('health', 'Health / welfare ($/HR)', '0'),
        dollars('vacation', 'Vacation / holiday ($/HR)', '0'),
        dollars('training', 'Training ($/HR)', '0'),
        dollars('other_fringe', 'Other fringe ($/HR)', '0'),
        dollars('payroll', 'Payroll tax ($/HR)', '0'),
        dollars('burden', 'Other burden ($/HR)', '0'),
        dollars('ot_multiplier', 'OT base-wage multiplier', '1.5'),
        dollars('dt_multiplier', 'Double-time base-wage multiplier', '2'),
      ],
      transform: withEnd,
    })
  }
  function addItem() {
    setDialog({
      title: `Add ${tab === 'material' ? 'material' : tab === 'disposal' ? 'disposal item' : 'equipment'}`,
      path: '/items',
      fields: [
        field('code', 'Company item ID'),
        field('name', 'Description / name'),
        field('category', 'Category', {
          value: tab,
          options: ['equipment', 'material', 'disposal'].map((v) => ({
            value: v,
            label: v,
          })),
        }),
        field('unit', 'Pricing / usage unit', {
          options: ['HR', 'DAY', 'LF', 'CY', 'TON', 'EA'].map((v) => ({
            value: v,
            label: v,
          })),
        }),
        field('specification', 'Specification / make / model', {
          required: false,
        }),
        field('vendor', 'Vendor / owner', { required: false }),
      ],
    })
  }
  function addItemRate() {
    setDialog({
      title: 'Add a dated company rate',
      description:
        'For hourly equipment, optionally derive the rate from annual ownership + annual operating costs ÷ utilization. Enter a manual rate of 0 when deriving.',
      path: '/item-rates',
      fields: [
        field('item_id', 'Cost item', {
          options: data.items
            .filter((i) => i.category === tab)
            .map((i) => ({ value: i.id, label: `${i.name} · ${i.unit}` })),
        }),
        ...dates,
        dollars('rate', 'Manual rate ($ / unit)'),
        field('derived', 'Calculation basis', {
          value: 'false',
          options: [
            { value: 'false', label: 'Manual company rate' },
            { value: 'true', label: 'Derived hourly equipment rate' },
          ],
        }),
        dollars('annual_ownership', 'Annual ownership cost ($)', '0'),
        dollars('annual_operating', 'Annual operating cost ($)', '0'),
        field('annual_utilization', 'Annual utilization (HR)', {
          type: 'number',
          step: '.01',
          min: '0',
          value: '0',
        }),
        field('source_note', 'Rate source / assumptions', { required: false }),
      ],
      transform: (v) => ({ ...withEnd(v), derived: v.derived === 'true' }),
    })
  }
  function closeRate(r: ItemRate | LaborRate, kind: 'item' | 'labor') {
    setDialog({
      title: 'Close rate period',
      description:
        'The rate amount and approved snapshots remain unchanged. Add the next rate with a later effective date.',
      path: `/rates/${kind}/${r.id}/close`,
      fields: [
        field('expiration_date', 'Last applicable date', { type: 'date' }),
      ],
    })
  }
  return (
    <>
      <Header title="Company data" />
      <div className="tabs scroll-tabs">
        {[
          ['labor', 'Labor & rates'],
          ['equipment', 'Equipment'],
          ['material', 'Materials'],
          ['disposal', 'Disposal'],
          ['employees', 'Employees'],
          ...(editable
            ? [
                ['team', 'Team access'],
                ['audit', 'Audit trail'],
              ]
            : []),
          ['account', 'My account'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {!editable && (
        <div className="notice">
          Company master data is managed by administrators. Your role has read
          access.
        </div>
      )}
      {tab === 'labor' && (
        <>
          <Panel
            title="Labor classifications"
            subtitle="Separate classifications preserve union and non-union context."
            action={
              editable && (
                <Button onClick={addClassification}>
                  <Plus size={16} />
                  Classification
                </Button>
              )
            }
          >
            {!data.classifications.length ? (
              <Empty title="Add your labor classifications">
                Start with the classifications your crews use, then add
                effective-dated wage and burden rates.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Classification</th>
                      <th>Type</th>
                      <th>Rate history</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.classifications.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                        </td>
                        <td>{c.union_type}</td>
                        <td>
                          {
                            data.laborRates.filter(
                              (r) => r.classification_id === c.id,
                            ).length
                          }{' '}
                          rate periods
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel
            title="Historical labor rates"
            subtitle="Loaded hourly rate = base + fringes + payroll tax + other burden."
            action={
              editable && (
                <Button onClick={addLaborRate}>
                  <Plus size={16} />
                  Labor rate
                </Button>
              )
            }
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Classification</th>
                    <th>Period</th>
                    <th>Base / HR</th>
                    <th>Fringes / HR</th>
                    <th>Tax & burden / HR</th>
                    <th>Loaded / HR</th>
                    <th>OT / DT</th>
                    {editable && <th />}
                  </tr>
                </thead>
                <tbody>
                  {data.laborRates.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>
                          {
                            data.classifications.find(
                              (c) => c.id === r.classification_id,
                            )?.name
                          }
                        </strong>
                        <details>
                          <summary>Components</summary>
                          <pre>
                            {JSON.stringify(
                              JSON.parse(r.details_json),
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      </td>
                      <td>
                        {r.effective_date}
                        <small>through {r.expiration_date || 'open'}</small>
                      </td>
                      <td>{currency(r.base_cents, 2)}</td>
                      <td>{currency(r.fringe_cents, 2)}</td>
                      <td>{currency(r.payroll_cents + r.burden_cents, 2)}</td>
                      <td>
                        <strong>
                          {currency(
                            r.base_cents +
                              r.fringe_cents +
                              r.payroll_cents +
                              r.burden_cents,
                            2,
                          )}
                        </strong>
                      </td>
                      <td>
                        {r.ot_multiplier}× / {r.dt_multiplier}×
                      </td>
                      {editable && (
                        <td>
                          {!r.expiration_date && (
                            <button
                              className="text-link"
                              onClick={() => closeRate(r, 'labor')}
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
            {!data.laborRates.length && (
              <p className="muted panel-padding">
                No rates entered. Reports cannot be approved without a dated
                labor rate.
              </p>
            )}
          </Panel>
        </>
      )}
      {['equipment', 'material', 'disposal'].includes(tab) && (
        <>
          <Panel
            title={
              tab === 'equipment'
                ? 'Equipment master'
                : tab === 'material'
                  ? 'Material catalog'
                  : 'Disposal catalog'
            }
            subtitle="Units are explicit. The app never guesses quantity conversions."
            action={
              editable && (
                <Button onClick={addItem}>
                  <Plus size={16} />
                  Add item
                </Button>
              )
            }
          >
            {!data.items.some((i) => i.category === tab) ? (
              <Empty title="Add your company’s cost items">
                Define the items and units used in field reports. Add a dated
                rate to make them available for costing.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item ID</th>
                      <th>Description</th>
                      <th>Usage / pricing unit</th>
                      <th>Specification / vendor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items
                      .filter((i) => i.category === tab)
                      .map((i) => {
                        const meta = JSON.parse(i.metadata_json)
                        return (
                          <tr key={i.id}>
                            <td>{i.code}</td>
                            <td>
                              <strong>{i.name}</strong>
                            </td>
                            <td>{i.unit}</td>
                            <td>
                              {meta.specification || '—'}
                              <small>{meta.vendor}</small>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel
            title="Dated company rates"
            subtitle="Project rates can override these without changing the company standard."
            action={
              editable && (
                <Button onClick={addItemRate}>
                  <Plus size={16} />
                  Cost rate
                </Button>
              )
            }
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Rate</th>
                    <th>Effective</th>
                    <th>Expires</th>
                    <th>Basis</th>
                    {editable && <th />}
                  </tr>
                </thead>
                <tbody>
                  {data.itemRates
                    .filter(
                      (r) =>
                        data.items.find((i) => i.id === r.item_id)?.category ===
                        tab,
                    )
                    .map((r) => {
                      const i = data.items.find((i) => i.id === r.item_id),
                        basis = JSON.parse(r.basis_json || '{}')
                      return (
                        <tr key={r.id}>
                          <td>
                            <strong>{i?.name}</strong>
                          </td>
                          <td>
                            {currency(r.rate_cents, 2)} / {i?.unit}
                          </td>
                          <td>{r.effective_date}</td>
                          <td>{r.expiration_date || 'Open'}</td>
                          <td>
                            <details>
                              <summary>
                                {basis.derived
                                  ? 'Ownership + operating'
                                  : 'Manual standard rate'}
                              </summary>
                              <pre>{JSON.stringify(basis, null, 2)}</pre>
                            </details>
                          </td>
                          {editable && (
                            <td>
                              {!r.expiration_date && (
                                <button
                                  className="text-link"
                                  onClick={() => closeRate(r, 'item')}
                                >
                                  Close period
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
      {tab === 'employees' && (
        <Panel
          title="Employee directory"
          subtitle="Crew costing currently uses classification counts; employee records prepare for individual time reporting."
          action={
            editable && (
              <Button
                onClick={() =>
                  setDialog({
                    title: 'Add employee',
                    path: '/employees',
                    fields: [
                      field('employee_code', 'Employee ID'),
                      field('name', 'Full name'),
                      field('role', 'Job role'),
                      field('classification_id', 'Classification', {
                        options: classifications,
                      }),
                    ],
                  })
                }
              >
                <Plus size={16} />
                Employee
              </Button>
            )
          }
        >
          {!data.employees.length ? (
            <Empty title="Your people, organized">
              Add employees and their labor classifications.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Classification</th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map((e) => (
                    <tr key={e.id}>
                      <td>{e.employee_code}</td>
                      <td>{e.name}</td>
                      <td>{e.role}</td>
                      <td>
                        {
                          data.classifications.find(
                            (c) => c.id === e.classification_id,
                          )?.name
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
      {tab === 'team' && editable && (
        <Panel
          title="Workspace access"
          subtitle="Create accounts for your team. Share temporary passwords securely and ask users to change them."
          action={
            <Button
              onClick={() =>
                setDialog({
                  title: 'Add team member',
                  path: '/users',
                  fields: [
                    field('name', 'Name'),
                    field('email', 'Email', { type: 'email' }),
                    field('password', 'Temporary password · 12+ characters', {
                      type: 'password',
                    }),
                    field('role', 'Role', {
                      options: [
                        { value: 'foreman', label: 'Foreman — reports' },
                        {
                          value: 'project_manager',
                          label: 'Project manager — jobs and reports',
                        },
                        { value: 'estimator', label: 'Estimator — read only' },
                        {
                          value: 'admin',
                          label: 'Admin — company data and access',
                        },
                      ],
                    }),
                  ],
                })
              }
            >
              <Plus size={16} />
              Team member
            </Button>
          }
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <Badge value={u.role} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {tab === 'audit' && editable && (
        <Panel
          title="Audit trail"
          subtitle="Latest 100 recorded actions. Financial snapshots are stored on the report."
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Record ID</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.created_at).toLocaleString()}</td>
                    <td>{a.actor}</td>
                    <td>{a.action}</td>
                    <td>
                      <code className="small">{a.entity_id}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {tab === 'account' && (
        <Panel title="Your account" subtitle={`${user.name} · ${user.email}`}>
          <div className="account-settings">
            <LockKeyhole size={27} />
            <div>
              <h3>Keep your account secure</h3>
              <p className="muted">
                Change a temporary password or update your current one.
              </p>
            </div>
            <Button
              onClick={() =>
                setDialog({
                  title: 'Change your password',
                  path: '/auth/password',
                  fields: [
                    field('current', 'Current password', { type: 'password' }),
                    field('password', 'New password · 12+ characters', {
                      type: 'password',
                    }),
                  ],
                })
              }
            >
              Change password
            </Button>
          </div>
        </Panel>
      )}
      <div className="notice small">
        <ShieldCheck size={15} /> This milestone tracks direct job costs.
        Insurance policies, corporate overhead, allocation rules, and
        spreadsheet import are planned separately; no overhead or profit is
        silently included.
      </div>
      {dialog && (
        <FormDialog
          title={dialog.title}
          description={dialog.description}
          fields={dialog.fields}
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            await api(
              dialog.path,
              'POST',
              dialog.transform ? dialog.transform(v) : v,
            )
            await refresh()
            await loadPrivate()
          }}
        />
      )}
    </>
  )
}
