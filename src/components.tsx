import { useState } from 'react'
import type { ReactNode, FormEvent } from 'react'
import { ArrowRight, Plus, X, LoaderCircle, FolderOpen } from 'lucide-react'
export function Empty({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <FolderOpen size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  )
}
export function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  secondary?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      className={`button ${secondary ? 'secondary' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
export function AddButton({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  return (
    <Button onClick={onClick}>
      <Plus size={16} />
      {children}
    </Button>
  )
}
export function Badge({ value }: { value: string }) {
  return <span className={`badge ${value}`}>{value.replaceAll('_', ' ')}</span>
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div role="alert" className="error">
      {message}
    </div>
  ) : null
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle size={22} className="spin" />
      Loading workspace…
    </div>
  )
}
export function Header({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </header>
  )
}
export function Metric({
  label,
  value,
  note,
  accent = false,
}: {
  label: string
  value: string
  note?: string
  accent?: boolean
}) {
  return (
    <div className={`metric ${accent ? 'accent' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  )
}
export function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  min,
  step,
  placeholder,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
  required?: boolean
  min?: string
  step?: string
  placeholder?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        required={required}
        min={min}
        step={step}
        placeholder={placeholder}
      />
    </label>
  )
}
export function SelectField({
  label,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  required?: boolean
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
export interface FieldConfig {
  name: string
  label: string
  type?: string
  required?: boolean
  value?: string
  options?: { value: string; label: string }[]
  help?: string
  min?: string
  step?: string
}
export function FormDialog({
  title,
  description,
  fields,
  onClose,
  onSubmit,
}: {
  title: string
  description?: string
  fields: FieldConfig[]
  onClose: () => void
  onSubmit: (values: Record<string, string>) => Promise<void>
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.value || ''])),
  )
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSubmit(values)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {description && <p className="muted small">{description}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            {fields.map((f) => (
              <div key={f.name}>
                {f.options ? (
                  <SelectField
                    label={f.label}
                    value={values[f.name]}
                    onChange={(v) => setValues({ ...values, [f.name]: v })}
                    options={f.options}
                    required={f.required}
                  />
                ) : (
                  <TextField
                    label={f.label}
                    type={f.type}
                    value={values[f.name]}
                    onChange={(v) => setValues({ ...values, [f.name]: v })}
                    required={f.required}
                    min={f.min}
                    step={f.step}
                  />
                )}{' '}
                {f.help && <small className="muted">{f.help}</small>}
              </div>
            ))}
          </div>
          <ErrorBox message={error} />
          <div className="form-actions">
            <Button secondary onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <ArrowRight size={16} />
              )}
              Save
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
