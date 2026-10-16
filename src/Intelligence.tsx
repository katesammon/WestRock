import { useState } from 'react'
import { ArrowUpRight, Filter, Download } from 'lucide-react'
import { api, currency, num, formatDate } from './api'
import type { Intelligence, Project } from './types'
import {
  Button,
  Empty,
  ErrorBox,
  Header,
  Metric,
  Panel,
  SelectField,
  TextField,
} from './components'
export function IntelligencePage({
  initial,
  projects,
}: {
  initial: Intelligence
  projects: Project[]
}) {
  const [data, setData] = useState(initial),
    [filters, setFilters] = useState({
      region: '',
      activity: '',
      unit: '',
      project_id: '',
      from: '',
      to: '',
      min_depth: '',
      max_depth: '',
    }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const options = (values: string[]) =>
    [...new Set(values)].sort().map((v) => ({ value: v, label: v }))
  async function apply() {
    setBusy(true)
    setError('')
    try {
      const params = new URLSearchParams(
        Object.entries(filters).filter(([, v]) => v),
      )
      setData(await api<Intelligence>('/observations?' + params))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  function download() {
    const header = [
      'Work date',
      'Job',
      'Activity',
      'State',
      'Region',
      'County',
      'City',
      'Depth FT',
      'Conditions',
      'Quantity',
      'Unit',
      'Workday hours',
      'Labor USD',
      'Equipment USD',
      'Material USD',
      'Disposal USD',
      'Direct cost USD',
      'Direct unit cost USD',
      'Production per hour',
      'Report ID',
    ]
    const rows = data.observations.map((o) => [
      o.work_date,
      o.job_number,
      o.activity,
      o.state,
      o.region,
      o.county,
      o.city,
      o.depth || '',
      o.conditions,
      o.quantity,
      o.unit,
      o.workday_hours,
      o.labor_cents / 100,
      o.equipment_cents / 100,
      o.material_cents / 100,
      o.disposal_cents / 100,
      o.total_cents / 100,
      Number(o.unit_cost_cents) / 100,
      o.production_per_hour,
      o.report_id,
    ])
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v)
                .replace(/^[=+@-]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(','),
      )
      .join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      a = document.createElement('a')
    a.href = url
    a.download = 'westrock-observations.csv'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <>
      <Header
        eyebrow="YOUR EXPERIENCE, STRUCTURED"
        title="Cost intelligence"
        description="Traceable actual costs. Comparable production. A stronger foundation for your next bid."
        action={
          <Button
            secondary
            onClick={download}
            disabled={!data.observations.length}
          >
            <Download size={16} />
            Export observations
          </Button>
        }
      />
      <Panel
        title="Find comparable work"
        subtitle="Statistics stay separate for each activity and unit."
      >
        <div className="filters">
          <SelectField
            label="Region"
            value={filters.region}
            onChange={(v) => setFilters({ ...filters, region: v })}
            options={options(projects.map((p) => p.region))}
          />
          <SelectField
            label="Activity"
            value={filters.activity}
            onChange={(v) => setFilters({ ...filters, activity: v })}
            options={options(initial.observations.map((o) => o.activity))}
          />
          <SelectField
            label="Project"
            value={filters.project_id}
            onChange={(v) => setFilters({ ...filters, project_id: v })}
            options={projects.map((p) => ({
              value: p.id,
              label: `${p.job_number} · ${p.name}`,
            }))}
          />
          <SelectField
            label="Unit"
            value={filters.unit}
            onChange={(v) => setFilters({ ...filters, unit: v })}
            options={options(['LF', 'CY', 'TON', 'EA'])}
          />
          <TextField
            label="From"
            type="date"
            value={filters.from}
            onChange={(v) => setFilters({ ...filters, from: v })}
          />
          <TextField
            label="Through"
            type="date"
            value={filters.to}
            onChange={(v) => setFilters({ ...filters, to: v })}
          />
          <TextField
            label="Min depth (FT)"
            type="number"
            min="0"
            step=".01"
            value={filters.min_depth}
            onChange={(v) => setFilters({ ...filters, min_depth: v })}
          />
          <TextField
            label="Max depth (FT)"
            type="number"
            min="0"
            step=".01"
            value={filters.max_depth}
            onChange={(v) => setFilters({ ...filters, max_depth: v })}
          />
        </div>
        <div className="form-actions">
          <Button
            secondary
            onClick={() => {
              setFilters({
                region: '',
                activity: '',
                unit: '',
                project_id: '',
                from: '',
                to: '',
                min_depth: '',
                max_depth: '',
              })
              setData(initial)
              setError('')
            }}
          >
            Reset
          </Button>
          <Button onClick={apply} disabled={busy}>
            <Filter size={16} />
            {busy ? 'Filtering…' : 'Apply filters'}
          </Button>
        </div>
      </Panel>
      <ErrorBox message={error} />
      {!data.groups.length ? (
        <Empty title="Intelligence starts in the field">
          Approve a daily report to create your first cost observation. Every
          number will link back to the work and rates behind it.
        </Empty>
      ) : (
        data.groups.map((g) => (
          <Panel
            key={g.activity + g.unit}
            title={g.activity}
            subtitle={`${g.count} observations · direct cost per ${g.unit} · filtered results`}
          >
            <div className="metrics compact">
              <Metric
                label="Weighted unit cost"
                value={`${currency(g.weighted, 2)}/${g.unit}`}
                note="Total cost ÷ total quantity"
                accent
              />
              <Metric
                label="Median"
                value={currency(g.median, 2)}
                note={`Simple average: ${currency(g.average, 2)}`}
              />
              <Metric
                label="Range"
                value={`${currency(g.min, 2)} – ${currency(g.max, 2)}`}
                note={`Recent median: ${currency(g.recent.median, 2)}`}
              />
            </div>
            <p className="small muted stat-note">
              Recent = latest {g.recent.count} observations (up to 10).
              Geography and conditions may differ; inspect the underlying
              records before using a rate.
            </p>
          </Panel>
        ))
      )}
      <Panel
        title="Historical observations"
        subtitle={`${data.observations.length} records · preserved individually, never replaced with an average`}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date / job</th>
                <th>Activity / geography</th>
                <th>Depth</th>
                <th>Production</th>
                <th>Direct cost</th>
                <th>Unit cost</th>
                <th>Rate / hour</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.observations.map((o) => (
                <tr key={o.id}>
                  <td>
                    {formatDate(o.work_date)}
                    <small>Job {o.job_number}</small>
                  </td>
                  <td>
                    <strong>{o.activity}</strong>
                    <small>
                      {o.state} / {o.region} / {o.county} / {o.city}
                    </small>
                  </td>
                  <td>{o.depth ? `${o.depth} FT` : 'Not recorded'}</td>
                  <td>
                    {num(o.quantity)} {o.unit}
                  </td>
                  <td>{currency(o.total_cents, 2)}</td>
                  <td>
                    <strong>
                      {currency(o.unit_cost_cents, 2)}/{o.unit}
                    </strong>
                  </td>
                  <td>
                    {num(o.production_per_hour)} {o.unit}/HR
                  </td>
                  <td>
                    <a
                      aria-label={`Inspect report for job ${o.job_number}`}
                      href={'#reports/' + o.report_id}
                      className="text-link"
                    >
                      Inspect
                      <ArrowUpRight size={14} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
