import { ClipboardList, ChevronRight } from 'lucide-react'
import { formatDate, currency } from './api'
import type { ReportSummary } from './types'
import { Badge, Empty } from './components'
export function ReportList({ reports }: { reports: ReportSummary[] }) {
  return !reports.length ? (
    <Empty title="No field reports yet">
      Reports will appear here as your crews record their work.
    </Empty>
  ) : (
    <div className="report-list">
      {reports.map((r) => (
        <a href={'#reports/' + r.id} className="report-row" key={r.id}>
          <div className={`report-dot ${r.status}`}>
            <ClipboardList size={19} />
          </div>
          <div className="grow">
            <h3>{r.project_name}</h3>
            <p className="small muted">
              {formatDate(r.work_date)} · {r.author_name}
            </p>
          </div>
          <div className="align-right">
            <Badge value={r.status} />
            {r.total_cents !== null && (
              <strong className="small">{currency(r.total_cents, 2)}</strong>
            )}
          </div>
          <ChevronRight size={16} />
        </a>
      ))}
    </div>
  )
}
