import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Mic,
  Square,
  Upload,
  Plus,
  Trash2,
  Save,
  Sparkles,
  Check,
  ShieldCheck,
  Calculator,
  RotateCcw,
  LoaderCircle,
} from 'lucide-react'
import { api, currency, num, formatDate } from './api'
import type {
  User,
  Data,
  Project,
  Report,
  Draft,
  Calculation,
  CostLine,
} from './types'
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Header,
  Loading,
  Metric,
  Panel,
  SelectField,
  TextField,
} from './components'
export function ReportEditor({
  id,
  user,
  data,
  projects,
  refresh,
}: {
  id: string
  user: User
  data: Data
  projects: Project[]
  refresh: () => Promise<void>
}) {
  const [report, setReport] = useState<Report | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [transcript, setTranscript] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [saved, setSaved] = useState(false),
    [calculation, setCalculation] = useState<Calculation | null>(null),
    [recording, setRecording] = useState(false),
    [confirming, setConfirming] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    audioInput = useRef<HTMLInputElement | null>(null)
  const load = useCallback(async () => {
    const r = await api<Report>('/reports/' + id)
    setReport(r)
    setDraft(r.draft)
    setTranscript(r.transcript)
    return r
  }, [id])
  useEffect(() => {
    Promise.resolve()
      .then(load)
      .catch((e) => setError(e.message))
    return () => {
      if (recorder.current && recorder.current.state !== 'inactive') {
        recorder.current.onstop = null
        recorder.current.stop()
      }
      stream.current?.getTracks().forEach((t) => t.stop())
    }
  }, [load])
  const update = (d: Draft) => {
    setDraft(d)
    setSaved(false)
    setCalculation(null)
    setConfirming(false)
  }
  const task = async (name: string, fn: () => Promise<void>) => {
    setBusy(name)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }
  const save = async () => {
    const result = await api<{ revision: number }>('/reports/' + id, 'PUT', {
      transcript,
      draft,
      revision: report?.revision,
    })
    setReport((r) => (r ? { ...r, revision: result.revision } : r))
    setSaved(true)
  }
  async function upload(file: Blob, name: string) {
    const body = new FormData()
    body.set('audio', file, name)
    await api('/reports/' + id + '/audio', 'POST', body)
    setReport((r) => (r ? { ...r, audio_key: name } : r))
  }
  async function record() {
    if (recording) {
      recorder.current?.stop()
      setRecording(false)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(
        'Recording requires a supported browser and HTTPS or localhost. You can upload audio or type your report instead.',
      )
      return
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.current = media
      const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      )
      const rec = new MediaRecorder(
        media,
        mime ? { mimeType: mime } : undefined,
      )
      recorder.current = rec
      const chunks: BlobPart[] = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
      }
      rec.onstop = () => {
        media.getTracks().forEach((t) => t.stop())
        const type = rec.mimeType.split(';')[0]
        void task('Saving recording', () =>
          upload(
            new Blob(chunks, { type }),
            `report.${type.split('/')[1] || 'webm'}`,
          ),
        )
      }
      rec.start()
      setRecording(true)
    } catch {
      setError(
        'Microphone access was unavailable. Check browser permissions, upload audio, or type a transcript.',
      )
    }
  }
  if (!report || !draft)
    return (
      <>
        <ErrorBox message={error} />
        {!error && <Loading />}
      </>
    )
  const project = projects.find((p) => p.id === report.project_id),
    approved = report.status === 'approved',
    canEdit =
      !approved &&
      (['owner', 'admin', 'project_manager'].includes(user.role) ||
        (user.role === 'foreman' && report.author_id === user.id)),
    locked = !!busy || recording
  const laborOptions = data.classifications.map((c) => ({
      label: c.name,
      value: c.id,
    })),
    itemOptions = data.items.map((i) => ({
      label: `${i.name} · ${i.unit} (${i.category})`,
      value: i.id,
    }))
  const setLabor = (index: number, values: Partial<Draft['labor'][number]>) =>
    update({
      ...draft,
      labor: draft.labor.map((l, i) => (i === index ? { ...l, ...values } : l)),
    })
  const setUsage = (index: number, values: Partial<Draft['usage'][number]>) =>
    update({
      ...draft,
      usage: draft.usage.map((l, i) => (i === index ? { ...l, ...values } : l)),
    })
  const snapshot = report.observation
  return (
    <>
      <a href="#reports" className="back-link">
        <ArrowLeft size={15} />
        All daily reports
      </a>
      <Header title="Daily report" action={<Badge value={report.status} />} />
      <ErrorBox message={error} />
      {busy && (
        <div className="busy-status" role="status">
          <LoaderCircle size={16} className="spin" />
          {busy}…
        </div>
      )}
      {approved && snapshot && (
        <>
          <div className="approved-banner">
            <ShieldCheck size={23} />
            <div>
              <strong>Approved and preserved</strong>
              <p>
                This report and its cost snapshot are immutable. All costs below
                use the rates selected at approval.
              </p>
            </div>
          </div>
          <div className="metrics">
            <Metric
              label="Total direct cost"
              value={currency(snapshot.total_cents, 2)}
              note="Labor + equipment + material + disposal"
              accent
            />
            <Metric
              label="Installed"
              value={`${num(snapshot.quantity)} ${snapshot.unit}`}
              note={snapshot.activity}
            />
            <Metric
              label="Actual direct unit cost"
              value={`${currency(snapshot.unit_cost_cents, 2)}/${snapshot.unit}`}
            />
            <Metric
              label="Production per hour"
              value={`${num(snapshot.production_per_hour)} ${snapshot.unit}/HR`}
              note={`${snapshot.workday_hours}-hour workday`}
            />
          </div>
          <CostBreakdown lines={report.lines} />
          <Panel
            title="Verified field record"
            subtitle={report.approved?.source}
          >
            <dl className="details">
              <div>
                <dt>Geography</dt>
                <dd>
                  {snapshot.state} → {snapshot.region} → {snapshot.county} →{' '}
                  {snapshot.city}
                </dd>
              </div>
              <div>
                <dt>Depth / conditions</dt>
                <dd>
                  {snapshot.depth
                    ? `${snapshot.depth} FT`
                    : 'Depth not recorded'}{' '}
                  · {snapshot.conditions || 'No conditions recorded'}
                </dd>
              </div>
              {(['weather', 'delays', 'safety', 'notes'] as const).map((k) => (
                <div key={k}>
                  <dt className="capitalize">{k}</dt>
                  <dd>{draft[k] || 'Not recorded'}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </>
      )}
      <div className="report-layout">
        <div className="report-main">
          <Panel
            title={
              approved ? 'Original field account' : '01 / Tell us what happened'
            }
            subtitle={`${project?.name || 'Project'} · Job ${project?.job_number || ''} · ${formatDate(report.work_date)} · ${report.author_name}`}
          >
            {!approved && canEdit && (
              <div className="voice-capture">
                <div className="voice-symbol">
                  <Mic size={25} />
                </div>
                <h3>
                  {recording
                    ? 'Recording your report…'
                    : 'Your day, in your own words.'}
                </h3>
                <p>
                  Describe the crew, hours, equipment, materials, installed
                  work, and any delays.
                </p>
                <div className="row wrap center">
                  <Button onClick={() => void record()} disabled={!!busy}>
                    {recording ? <Square size={16} /> : <Mic size={16} />}{' '}
                    {recording ? 'Stop recording' : 'Record report'}
                  </Button>
                  <Button
                    secondary
                    disabled={locked}
                    onClick={() => audioInput.current?.click()}
                  >
                    <Upload size={15} />
                    Upload audio
                  </Button>
                </div>
                <input
                  ref={audioInput}
                  type="file"
                  accept="audio/webm,audio/mp4,audio/mpeg,audio/wav,audio/ogg"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file)
                      void task('Uploading audio', () =>
                        upload(file, file.name),
                      )
                    e.target.value = ''
                  }}
                />
                <small>
                  Microphone access requires HTTPS or localhost · 20 MB maximum
                </small>
              </div>
            )}
            {report.audio_key && (
              <div className="audio-playback">
                <span className="small">Saved source recording</span>
                <audio controls src={`/api/reports/${id}/audio`} />
                {canEdit && (
                  <Button
                    secondary
                    disabled={locked || !data.aiEnabled}
                    onClick={() =>
                      void task('Transcribing', async () => {
                        await save()
                        const result = await api<{
                          transcript: string
                          revision: number
                        }>(`/reports/${id}/transcribe`, 'POST')
                        setTranscript(result.transcript)
                        setReport((r) =>
                          r ? { ...r, revision: result.revision } : r,
                        )
                        setCalculation(null)
                        setSaved(true)
                      })
                    }
                  >
                    Transcribe audio
                  </Button>
                )}
              </div>
            )}
            <label className="field">
              <span>
                {approved ? 'Preserved transcript' : 'Transcript / field notes'}
              </span>
              <textarea
                rows={6}
                value={transcript}
                readOnly={!canEdit}
                disabled={!!busy}
                onChange={(e) => {
                  setTranscript(e.target.value)
                  setSaved(false)
                  setCalculation(null)
                }}
                placeholder="Describe what happened. Don’t worry about formatting — review the structured details below before approval."
              />
            </label>
            {canEdit && (
              <div className="row spread wrap">
                <span className="small muted">
                  {data.aiEnabled
                    ? 'AI suggestions always require your review.'
                    : 'AI is not configured. Use the structured fields below.'}
                </span>
                <Button
                  secondary
                  disabled={locked || !data.aiEnabled || !transcript.trim()}
                  onClick={() =>
                    void task('Structuring report', async () => {
                      await save()
                      const result = await api<{ draft: Draft }>(
                        `/reports/${id}/extract`,
                        'POST',
                      )
                      await load()
                      setDraft(result.draft)
                      setCalculation(null)
                      setSaved(true)
                    })
                  }
                >
                  <Sparkles size={16} />
                  Structure with AI
                </Button>
              </div>
            )}
          </Panel>
          {!approved && (
            <fieldset disabled={!canEdit || locked} className="report-fieldset">
              <Panel
                title="02 / Review the structured report"
                subtitle="Nothing becomes a cost observation until a person confirms it."
              >
                {draft.questions.length > 0 && (
                  <div className="questions">
                    <strong>Clarify before approving</strong>
                    <ul>
                      {draft.questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                    <p className="small">
                      Complete the fields below to address these source
                      questions.
                    </p>
                  </div>
                )}
                {report.previous && (
                  <div className="previous-context">
                    <div>
                      <strong>
                        Continue from {formatDate(report.previous.work_date)}?
                      </strong>
                      <p className="small muted">
                        Copy crew counts and equipment only. Enter today’s hours
                        and quantities.
                      </p>
                    </div>
                    <Button
                      secondary
                      onClick={() => {
                        const prev = report.previous!.draft.values
                        update({
                          ...draft,
                          labor: prev.labor.map((l) => ({
                            ...l,
                            regular: null,
                            overtime: null,
                            doubletime: null,
                          })),
                          usage: prev.usage
                            .filter(
                              (u) =>
                                data.items.find((i) => i.id === u.item_id)
                                  ?.category === 'equipment',
                            )
                            .map((u) => ({ ...u, quantity: null })),
                          inherited_from: report.previous!.id,
                        })
                      }}
                    >
                      <RotateCcw size={15} />
                      Use previous crew
                    </Button>
                  </div>
                )}
                {draft.inherited_from && (
                  <p className="notice small">
                    Crew/equipment inherited from an earlier report. All counts,
                    hours, and usage need your review.
                  </p>
                )}
                <h3 className="section-label">Production</h3>
                <div className="form-grid">
                  <TextField
                    label="Activity · include size and material"
                    value={draft.activity}
                    onChange={(v) => update({ ...draft, activity: v })}
                  />
                  <TextField
                    label="Installed quantity"
                    type="number"
                    min="0"
                    step=".001"
                    value={draft.quantity ?? ''}
                    onChange={(v) => update({ ...draft, quantity: v || null })}
                  />
                  <SelectField
                    label="Production unit"
                    value={draft.unit}
                    onChange={(v) =>
                      update({ ...draft, unit: v as Draft['unit'] })
                    }
                    options={['LF', 'CY', 'TON', 'EA'].map((v) => ({
                      label: v,
                      value: v,
                    }))}
                  />
                  <TextField
                    label="Workday hours · not person-hours"
                    type="number"
                    min="0"
                    step=".01"
                    value={draft.workday_hours ?? ''}
                    onChange={(v) =>
                      update({ ...draft, workday_hours: v || null })
                    }
                  />
                  <TextField
                    label="Average depth (FT) · optional"
                    type="number"
                    min="0"
                    step=".01"
                    value={draft.depth ?? ''}
                    onChange={(v) => update({ ...draft, depth: v || null })}
                  />
                  <TextField
                    label="Soil, groundwater, site conditions"
                    value={draft.conditions}
                    onChange={(v) => update({ ...draft, conditions: v })}
                  />
                </div>
                <div className="row spread section-label">
                  <h3>Labor</h3>
                  <Button
                    secondary
                    onClick={() =>
                      update({
                        ...draft,
                        labor: [
                          ...draft.labor,
                          {
                            classification_id: '',
                            workers: 1,
                            regular: null,
                            overtime: '0',
                            doubletime: '0',
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={15} />
                    Add crew
                  </Button>
                </div>
                <p className="small muted">
                  Hours are per worker. Overtime multiplies base wage; fringes
                  and burdens remain hourly.
                </p>
                {draft.labor.map((l, i) => (
                  <div className="entry-row" key={i}>
                    <div className="entry-grid labor-grid">
                      <SelectField
                        label="Classification"
                        value={l.classification_id}
                        onChange={(v) => setLabor(i, { classification_id: v })}
                        options={laborOptions}
                      />
                      <TextField
                        label="Workers"
                        type="number"
                        min="1"
                        step="1"
                        value={l.workers}
                        onChange={(v) => setLabor(i, { workers: Number(v) })}
                      />
                      <TextField
                        label="Regular hours"
                        type="number"
                        min="0"
                        step=".01"
                        value={l.regular ?? ''}
                        onChange={(v) => setLabor(i, { regular: v || null })}
                      />
                      <TextField
                        label="OT hours"
                        type="number"
                        min="0"
                        step=".01"
                        value={l.overtime ?? ''}
                        onChange={(v) => setLabor(i, { overtime: v || null })}
                      />
                      <TextField
                        label="DT hours"
                        type="number"
                        min="0"
                        step=".01"
                        value={l.doubletime ?? ''}
                        onChange={(v) => setLabor(i, { doubletime: v || null })}
                      />
                    </div>
                    <button
                      className="icon-button danger"
                      aria-label={`Remove crew ${i + 1}`}
                      onClick={() =>
                        update({
                          ...draft,
                          labor: draft.labor.filter((_, index) => index !== i),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {!data.classifications.length && (
                  <p className="notice small">
                    An administrator needs to add labor classifications and
                    dated rates in Company data.
                  </p>
                )}
                <div className="row spread section-label">
                  <h3>Equipment, materials & disposal</h3>
                  <Button
                    secondary
                    onClick={() =>
                      update({
                        ...draft,
                        usage: [
                          ...draft.usage,
                          { item_id: '', quantity: null },
                        ],
                      })
                    }
                  >
                    <Plus size={15} />
                    Add item
                  </Button>
                </div>
                {draft.usage.map((u, i) => (
                  <div className="entry-row" key={i}>
                    <div className="entry-grid usage-grid">
                      <SelectField
                        label="Company cost item"
                        value={u.item_id}
                        onChange={(v) => setUsage(i, { item_id: v })}
                        options={itemOptions}
                      />
                      <TextField
                        label={`Quantity (${data.items.find((v) => v.id === u.item_id)?.unit || 'select item'})`}
                        type="number"
                        min="0"
                        step=".001"
                        value={u.quantity ?? ''}
                        onChange={(v) => setUsage(i, { quantity: v || null })}
                      />
                    </div>
                    <button
                      className="icon-button danger"
                      aria-label={`Remove item ${i + 1}`}
                      onClick={() =>
                        update({
                          ...draft,
                          usage: draft.usage.filter((_, index) => index !== i),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <details className="additional-notes">
                  <summary>Conditions, delays & notes</summary>
                  <div className="form-grid">
                    {(['weather', 'delays', 'safety', 'notes'] as const).map(
                      (k) => (
                        <TextField
                          key={k}
                          label={k[0].toUpperCase() + k.slice(1)}
                          value={draft[k]}
                          onChange={(v) => update({ ...draft, [k]: v })}
                        />
                      ),
                    )}
                  </div>
                </details>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={draft.attribution_confirmed}
                    onChange={(e) =>
                      update({
                        ...draft,
                        attribution_confirmed: e.target.checked,
                      })
                    }
                  />
                  <span>
                    I confirm all costs in this report belong to this one
                    production activity. I have reviewed quantities, crew,
                    hours, and item usage.
                  </span>
                </label>
              </Panel>
            </fieldset>
          )}
          {approved && report.approved && (
            <details className="panel provenance">
              <summary>Inspect verified value sources</summary>
              <pre>{JSON.stringify(report.approved.provenance, null, 2)}</pre>
            </details>
          )}
          {report.extraction && (
            <details className="panel provenance">
              <summary>Inspect AI extraction and original transcript</summary>
              <p className="small muted">
                Model: {report.extraction.model} ·{' '}
                {report.extraction.created_at} · unverified suggestions retained
                separately
              </p>
              <pre>{JSON.stringify(report.extraction, null, 2)}</pre>
            </details>
          )}
        </div>
        {!approved && (
          <aside className="report-summary">
            <Panel
              title="03 / Verify the costs"
              subtitle="Calculated from your saved inputs and dated rates."
            >
              <div className="calculation-icon">
                <Calculator size={25} />
              </div>
              <p className="small muted">
                No AI arithmetic. No hidden overhead. Every cost is traceable to
                an input and applicable rate.
              </p>
              {canEdit && (
                <>
                  <Button
                    secondary
                    disabled={locked}
                    onClick={() => void task('Saving draft', save)}
                  >
                    <Save size={16} />
                    {saved ? 'Draft saved' : 'Save draft'}
                  </Button>
                  <Button
                    disabled={locked}
                    onClick={() =>
                      void task('Checking costs', async () => {
                        await save()
                        setCalculation(
                          await api<Calculation>(
                            `/reports/${id}/calculate`,
                            'POST',
                          ),
                        )
                      })
                    }
                  >
                    <Calculator size={16} />
                    Calculate & review
                  </Button>
                </>
              )}
              {calculation && (
                <div className="calculated">
                  <span className="small muted">TOTAL DIRECT COST</span>
                  <strong className="cost-total">
                    {currency(calculation.total_cents, 2)}
                  </strong>
                  {Object.entries(calculation.totals).map(([k, v]) => (
                    <div className="row spread small" key={k}>
                      <span className="capitalize">{k}</span>
                      <strong>{currency(v, 2)}</strong>
                    </div>
                  ))}
                  <hr />
                  {calculation.unit_cost_cents && (
                    <div className="row spread">
                      <span>Unit cost</span>
                      <strong>
                        {currency(calculation.unit_cost_cents, 2)}/{draft.unit}
                      </strong>
                    </div>
                  )}
                  {calculation.production_per_hour && (
                    <div className="row spread small">
                      <span>Production</span>
                      <strong>
                        {num(calculation.production_per_hour)} {draft.unit}/HR
                      </strong>
                    </div>
                  )}
                  {calculation.errors.length > 0 ? (
                    <div className="questions">
                      <strong>Before approval</strong>
                      <ul>
                        {calculation.errors.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="approval-actions">
                      {confirming ? (
                        <>
                          <p className="small">
                            Approval permanently preserves this report and these
                            costs. Confirm the breakdown below before
                            continuing.
                          </p>
                          <Button
                            disabled={locked}
                            onClick={() =>
                              void task('Approving report', async () => {
                                await api(`/reports/${id}/approve`, 'POST', {
                                  revision: calculation.revision,
                                  calculation_hash:
                                    calculation.calculation_hash,
                                })
                                await load()
                                await refresh()
                                setCalculation(null)
                              })
                            }
                          >
                            <ShieldCheck size={16} />
                            Confirm approval
                          </Button>
                          <Button
                            secondary
                            onClick={() => setConfirming(false)}
                          >
                            Keep reviewing
                          </Button>
                        </>
                      ) : (
                        <Button
                          disabled={locked}
                          onClick={() => setConfirming(true)}
                        >
                          <Check size={16} />
                          Approve report
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Panel>
          </aside>
        )}
      </div>
      {!approved && calculation && <CostBreakdown lines={calculation.lines} />}
    </>
  )
}
function CostBreakdown({ lines }: { lines: CostLine[] }) {
  return (
    <Panel
      title="Auditable cost breakdown"
      subtitle="Each line preserves its selected rate and calculation inputs."
    >
      {!lines.length ? (
        <Empty title="No cost lines yet">
          Complete the structured report and check its costs.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category / item</th>
                <th>Quantity</th>
                <th>Rate source</th>
                <th>Cost</th>
                <th>Trace</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id || i}>
                  <td>
                    <strong>{l.label}</strong>
                    <small className="capitalize">{l.category}</small>
                  </td>
                  <td>
                    {num(l.quantity)} {l.unit}
                  </td>
                  <td>{l.rate_source}</td>
                  <td>
                    <strong>{currency(l.cost_cents, 2)}</strong>
                  </td>
                  <td>
                    <details>
                      <summary>Rate snapshot</summary>
                      <pre>
                        {JSON.stringify(
                          l.rate_snapshot ||
                            JSON.parse(l.rate_snapshot_json || '{}'),
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
