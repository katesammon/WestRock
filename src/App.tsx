import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  LayoutDashboard,
  FolderKanban,
  ClipboardList,
  ChartNoAxesCombined,
  Settings2,
  LogOut,
  ArrowUpRight,
  Plus,
  HardHat,
  Menu,
  X,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react'
import { api, currency, num, go, today } from './api'
import type { Data, Project, User, ReportSummary, Intelligence } from './types'
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Header,
  Loading,
  Metric,
  Panel,
  FormDialog,
  TextField,
} from './components'
import type { FieldConfig } from './components'
import { ProjectDetail } from './Projects'
import { projectFields, projectBody } from './projectForm'
import { ReportList } from './ReportList'
import { ReportEditor } from './Reports'
import { IntelligencePage } from './Intelligence'
import { Admin } from './Admin'
import './App.css'
const navigation = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'reports', label: 'Daily reports', icon: ClipboardList },
  { id: 'intelligence', label: 'Cost intelligence', icon: ChartNoAxesCombined },
  { id: 'admin', label: 'Company data', icon: Settings2 },
]
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [setup, setSetup] = useState(false),
    [checking, setChecking] = useState(true),
    [authError, setAuthError] = useState('')
  useEffect(() => {
    Promise.all([
      api<{ needsSetup: boolean }>('/auth/status'),
      api<User>('/me').catch(() => null),
    ])
      .then(([status, u]) => {
        setSetup(status.needsSetup)
        setUser(u)
      })
      .catch((e) => setAuthError(e.message))
      .finally(() => setChecking(false))
  }, [])
  if (checking) return <Loading />
  if (!user) return <Auth setup={setup} error={authError} onSuccess={setUser} />
  return <Workspace user={user} onLogout={() => setUser(null)} />
}
function Auth({
  setup,
  error,
  onSuccess,
}: {
  setup: boolean
  error: string
  onSuccess: (u: User) => void
}) {
  const [values, setValues] = useState({
      name: '',
      company: '',
      email: '',
      password: '',
    }),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(error)
  const field = (key: keyof typeof values, label: string, type = 'text') => (
    <TextField
      label={label}
      type={type}
      required
      value={values[key]}
      onChange={(v) => setValues({ ...values, [key]: v })}
    />
  )
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      onSuccess(
        await api<User>('/auth/' + (setup ? 'setup' : 'login'), 'POST', values),
      )
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <div className="brand">
          <img
            className="brand-logo"
            src="/westrock-logo.svg"
            alt="WestRock logo"
            width="40"
            height="40"
          />{' '}
          WESTROCK <span className="brand-caption">FIELD INTELLIGENCE</span>
        </div>
        <div>
          <p className="eyebrow">FROM THE FIELD. FOR THE FUTURE.</p>
          <h1>
            Better data today.
            <br />
            Smarter bids tomorrow.
          </h1>
          <p>
            Turn every day’s work into a clearer understanding of what it takes
            to build.
          </p>
          <div className="story-flow">
            <span>Field activity</span>
            <ChevronRight />
            <span>Actual costs</span>
            <ChevronRight />
            <span>Intelligence</span>
          </div>
        </div>
        <span className="small">
          Built for underground utility construction.
        </span>
      </div>
      <div className="auth-form">
        <HardHat size={36} />
        <p className="eyebrow">YOUR OPERATIONS WORKSPACE</p>
        <h2>{setup ? 'Build your foundation.' : 'Welcome back.'}</h2>
        <p className="muted">
          {setup
            ? 'Create your company’s first owner account. Your workspace starts with your data.'
            : 'Sign in to keep the field and office connected.'}
        </p>
        <form onSubmit={submit}>
          {setup && (
            <>
              {field('company', 'Company name')}
              {field('name', 'Your name')}
            </>
          )}
          {field('email', 'Email', 'email')}
          {field(
            'password',
            setup ? 'Password · at least 12 characters' : 'Password',
            'password',
          )}
          <ErrorBox message={message} />
          <Button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : setup ? 'Create workspace' : 'Sign in'}
            <ArrowUpRight size={18} />
          </Button>
        </form>
        <p className="small muted">
          <ShieldCheck size={14} /> Company records stay in your private
          workspace.
        </p>
      </div>
    </div>
  )
}
function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [route, setRoute] = useState(
      window.location.hash.slice(1) || 'dashboard',
    ),
    [mobile, setMobile] = useState(false),
    [data, setData] = useState<Data | null>(null),
    [projects, setProjects] = useState<Project[]>([]),
    [reports, setReports] = useState<ReportSummary[]>([]),
    [intel, setIntel] = useState<Intelligence>({
      observations: [],
      groups: [],
    }),
    [error, setError] = useState(''),
    [dialog, setDialog] = useState<'project' | 'report' | null>(null),
    [reportProject, setReportProject] = useState(''),
    [query, setQuery] = useState('')
  useEffect(() => {
    const handler = () => {
      setRoute(window.location.hash.slice(1) || 'dashboard')
      setMobile(false)
      setQuery('')
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  const refresh = useCallback(async () => {
    const [d, p, r, i] = await Promise.all([
      api<Data>('/data'),
      api<Project[]>('/projects'),
      api<ReportSummary[]>('/reports'),
      api<Intelligence>('/observations'),
    ])
    setData(d)
    setProjects(p)
    setReports(r)
    setIntel(i)
    setError('')
  }, [])
  useEffect(() => {
    Promise.resolve()
      .then(refresh)
      .catch((e) => setError(e.message))
  }, [refresh])
  const admin = ['owner', 'admin'].includes(user.role),
    manager = admin || user.role === 'project_manager',
    writer = manager || user.role === 'foreman'
  const page = route.split('/')[0],
    id = route.split('/')[1]
  const newReport = () => {
    setReportProject('')
    setDialog('report')
  }
  const reportFields: FieldConfig[] = [
    {
      name: 'project_id',
      value: reportProject,
      label: 'Project',
      required: true,
      options: projects
        .filter((p) => p.status !== 'completed')
        .map((p) => ({ value: p.id, label: `${p.job_number} · ${p.name}` })),
    },
    {
      name: 'work_date',
      label: 'Work date',
      type: 'date',
      required: true,
      value: today(),
    },
  ]
  const active = projects.filter((p) => p.status === 'active'),
    total = intel.observations.reduce((s, o) => s + o.total_cents, 0)
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <a className="brand" href="#dashboard">
          <img
            className="brand-logo"
            src="/westrock-logo.svg"
            alt="WestRock logo"
            width="40"
            height="40"
          />
          <span>
            WESTROCK<small>FIELD INTELLIGENCE</small>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {navigation.map((n) => (
            <a
              href={'#' + n.id}
              className={page === n.id ? 'selected' : ''}
              key={n.id}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === 'reports' &&
                reports.some((r) => r.status === 'draft') && (
                  <span className="nav-count">
                    {reports.filter((r) => r.status === 'draft').length}
                  </span>
                )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <span className="avatar">
              {user.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.role.replaceAll('_', ' ')}</small>
            </div>
            <button
              aria-label="Sign out"
              className="icon-button"
              onClick={async () => {
                try {
                  await api('/auth/logout', 'POST')
                  onLogout()
                } catch (e) {
                  setError((e as Error).message)
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="nav-scrim"
          aria-label="Close menu"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <div className="topbar">
          <div>
            <button
              className="icon-button mobile-toggle"
              aria-label="Toggle menu"
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X /> : <Menu />}
            </button>
            <span className="breadcrumb">
              Workspace <ChevronRight size={14} />{' '}
              <strong>
                {navigation.find((n) => n.id === page)?.label || 'Overview'}
              </strong>
            </span>
          </div>
          <span className="company-chip">
            {data?.company.name || 'WestRock'}
          </span>
        </div>
        <main className="main-content">
          <ErrorBox message={error} />
          {!data ? (
            <Loading />
          ) : (
            <>
              {page === 'dashboard' && (
                <>
                  <Header
                    title="Overview"
                    action={
                      writer && (
                        <Button onClick={newReport}>
                          <Plus size={17} />
                          New daily report
                        </Button>
                      )
                    }
                  />
                  <div className="metrics">
                    <Metric
                      label="Active projects"
                      value={String(active.length)}
                      note={`${projects.length} projects in your workspace`}
                    />
                    <Metric
                      label="Recorded direct cost"
                      value={currency(total)}
                      note="Approved reports only"
                      accent
                    />
                    <Metric
                      label="Reports awaiting review"
                      value={String(
                        reports.filter((r) => r.status === 'draft').length,
                      )}
                      note="Drafts excluded from costs"
                    />
                    <Metric
                      label="Cost observations"
                      value={num(intel.observations.length)}
                      note="Verified field data points"
                    />
                  </div>
                  {!projects.length && (
                    <div className="onboarding">
                      <span className="onboarding-number">01</span>
                      <div>
                        <h2>Start with a solid foundation.</h2>
                        <p>
                          Add your company rates, create a project, then capture
                          your first day in the field.
                        </p>
                      </div>
                      <Button
                        secondary
                        onClick={() => go(admin ? 'admin' : 'projects')}
                      >
                        {admin ? 'Set up company data' : 'View projects'}
                        <ArrowUpRight size={16} />
                      </Button>
                    </div>
                  )}
                  <div className="dashboard-grid">
                    <Panel
                      title="Active projects"
                      subtitle="Where the work is happening"
                      action={
                        <a className="text-link" href="#projects">
                          All projects <ArrowUpRight size={15} />
                        </a>
                      }
                    >
                      {!active.length ? (
                        <Empty
                          title="Your next project starts here"
                          action={
                            manager ? (
                              <Button
                                secondary
                                onClick={() => setDialog('project')}
                              >
                                Create project
                              </Button>
                            ) : undefined
                          }
                        >
                          Create a job to connect field reports to actual costs.
                        </Empty>
                      ) : (
                        active.slice(0, 5).map((p) => {
                          const obs = intel.observations.filter(
                              (o) => o.project_id === p.id,
                            ),
                            qty = obs
                              .filter(
                                (o) =>
                                  o.activity === p.primary_activity &&
                                  o.unit === p.production_unit,
                              )
                              .reduce((s, o) => s + Number(o.quantity), 0),
                            progress = Number(p.contract_quantity)
                              ? (qty / Number(p.contract_quantity)) * 100
                              : 0
                          return (
                            <a
                              href={'#projects/' + p.id}
                              className="project-row"
                              key={p.id}
                            >
                              <div className="project-icon">
                                <FolderKanban size={21} />
                              </div>
                              <div className="grow">
                                <span className="small muted">
                                  JOB {p.job_number} · {p.region}
                                </span>
                                <h3>{p.name}</h3>
                                <div className="progress-track">
                                  <span
                                    style={{
                                      width: `${Math.min(100, progress)}%`,
                                    }}
                                  />
                                </div>
                                <span className="small muted">
                                  {num(qty)} / {num(p.contract_quantity)}{' '}
                                  {p.production_unit} · {p.primary_activity}
                                </span>
                              </div>
                              <div className="align-right">
                                <strong>
                                  {currency(
                                    obs.reduce((s, o) => s + o.total_cents, 0),
                                  )}
                                </strong>
                                <small className="muted">direct cost</small>
                              </div>
                              <ChevronRight size={17} />
                            </a>
                          )
                        })
                      )}
                    </Panel>
                    <Panel
                      title="Field activity"
                      subtitle="The latest from your crews"
                    >
                      <ReportList reports={reports.slice(0, 5)} />
                    </Panel>
                  </div>
                  <div className="insight-strip">
                    <ChartNoAxesCombined size={26} />
                    <div>
                      <h3>Good estimates begin with real observations.</h3>
                      <p>
                        Every approved report adds a traceable cost and
                        production record. No blended guesses.
                      </p>
                    </div>
                    <a href="#intelligence" className="text-link">
                      Explore intelligence <ArrowUpRight size={16} />
                    </a>
                  </div>
                </>
              )}
              {page === 'projects' && !id && (
                <>
                  <Header
                    title="Projects"
                    action={
                      manager && (
                        <AddProjectButton
                          onClick={() => setDialog('project')}
                        />
                      )
                    }
                  />
                  <div className="toolbar">
                    <input
                      className="search"
                      placeholder="Find a project, job number, or region…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label="Search projects"
                    />
                    <span className="small muted">
                      {projects.length} total projects
                    </span>
                  </div>
                  <div className="project-cards">
                    {projects
                      .filter((p) =>
                        `${p.name} ${p.job_number} ${p.region}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((p) => (
                        <a
                          className="project-card panel"
                          href={'#projects/' + p.id}
                          key={p.id}
                        >
                          <div className="row spread">
                            <span className="eyebrow">JOB {p.job_number}</span>
                            <Badge value={p.status} />
                          </div>
                          <h2>{p.name}</h2>
                          <p className="muted">
                            {p.city}, {p.state} · {p.region}
                          </p>
                          <hr />
                          <div className="row spread">
                            <span className="small muted">
                              {p.primary_activity}
                            </span>
                            <strong>
                              {num(p.contract_quantity)} {p.production_unit}
                            </strong>
                          </div>
                          <div className="row spread small">
                            <span>View project</span>
                            <ArrowUpRight size={16} />
                          </div>
                        </a>
                      ))}
                  </div>
                  {!projects.length && (
                    <Empty
                      title="Build your first project"
                      action={
                        manager ? (
                          <Button onClick={() => setDialog('project')}>
                            Create project
                          </Button>
                        ) : undefined
                      }
                    >
                      Add the job’s location, primary activity, and cost
                      assumptions.
                    </Empty>
                  )}
                </>
              )}
              {page === 'projects' && id && (
                <ProjectDetail
                  key={id}
                  id={id}
                  projects={projects}
                  data={data}
                  observations={intel.observations}
                  reports={reports}
                  manager={manager}
                  writer={writer}
                  refresh={refresh}
                  onReport={() => {
                    setReportProject(id)
                    setDialog('report')
                  }}
                />
              )}
              {page === 'reports' && !id && (
                <>
                  <Header
                    title="Daily reports"
                    action={
                      writer && (
                        <Button onClick={newReport}>
                          <Plus size={17} />
                          New daily report
                        </Button>
                      )
                    }
                  />
                  <div className="toolbar">
                    <input
                      className="search"
                      aria-label="Search reports"
                      placeholder="Search by project, author, or status…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <span className="small muted">
                      {reports.length} reports
                    </span>
                  </div>
                  <Panel
                    title="Report log"
                    subtitle="Drafts require review. Approved reports are preserved."
                  >
                    <ReportList
                      reports={reports.filter((r) =>
                        `${r.project_name} ${r.author_name} ${r.status}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )}
                    />
                  </Panel>
                </>
              )}
              {page === 'reports' && id && (
                <ReportEditor
                  key={id}
                  id={id}
                  user={user}
                  data={data}
                  projects={projects}
                  refresh={refresh}
                />
              )}
              {page === 'intelligence' && (
                <IntelligencePage initial={intel} projects={projects} />
              )}
              {page === 'admin' && (
                <Admin data={data} user={user} refresh={refresh} />
              )}
              {!navigation.some((n) => n.id === page) && (
                <Empty
                  title="Page not found"
                  action={
                    <Button onClick={() => go('dashboard')}>
                      Back to overview
                    </Button>
                  }
                >
                  Choose a section from your workspace.
                </Empty>
              )}
            </>
          )}
        </main>
        <footer className="footer">
          <span>WESTROCK / COST INTELLIGENCE</span>
          <span>Direct costs. Real observations. Clear decisions.</span>
        </footer>
      </div>
      {dialog && (
        <FormDialog
          title={
            dialog === 'project' ? 'Create a project' : 'Start a daily report'
          }
          description={
            dialog === 'project'
              ? 'Keep geography and scope specific so historical costs stay comparable.'
              : 'Choose the job and work date. You can save a draft at any time.'
          }
          fields={dialog === 'project' ? projectFields : reportFields}
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            if (dialog === 'project') {
              const p = await api<{ id: string }>(
                '/projects',
                'POST',
                projectBody(v),
              )
              await refresh()
              go('projects/' + p.id)
            } else {
              const r = await api<{ id: string }>('/reports', 'POST', v)
              await refresh()
              go('reports/' + r.id)
            }
          }}
        />
      )}
    </div>
  )
}
function AddProjectButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <Plus size={17} />
      New project
    </Button>
  )
}
