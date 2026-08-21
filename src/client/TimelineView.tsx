/**
 * Per-path timeline across remaining sessions in the same project.
 * View-only: click a snapshot to inspect it.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { HistoryRecord } from '../types.ts'
import type { LocalHistoryFace } from './remote.ts'
import { unwrapResult } from './remote.ts'
import type { Translate } from './locales.ts'
import { lookup } from './locales.ts'

export interface TimelineViewProps {
  path: string
  sessionId: string
  cwd?: string
  remote: LocalHistoryFace
  t?: Translate
  selectedId?: string
  onSelect?: (record: HistoryRecord, records: readonly HistoryRecord[]) => void
}

function relativeTime(mtime: number, now = Date.now()): string {
  const delta = Math.max(0, now - mtime)
  const minutes = Math.round(delta / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function sessionLabel(sessionId: string): string {
  if (sessionId.startsWith('session-') && sessionId.length > 20) return sessionId.slice(8, 16)
  if (sessionId.length > 16) return sessionId.slice(0, 8)
  return sessionId
}

export function TimelineView(props: TimelineViewProps): ReactNode {
  const t = props.t ?? lookup
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const value = unwrapResult(await props.remote.listTimeline(props.sessionId, props.cwd, props.path))
        if (!cancelled) {
          setRecords(value.records)
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [props.cwd, props.path, props.remote, props.sessionId])

  if (error) return <div className="dsh_lh_error">{t('loadFailed')}</div>

  return (
    <div className="dsh_lh_timeline" data-lh-timeline-list="">
      {records.map((record) => (
        <button
          key={record.id}
          type="button"
          className="dsh_lh_timeRow"
          data-selected={props.selectedId === record.id ? 'true' : 'false'}
          title={record.sessionId}
          onClick={() => { props.onSelect?.(record, records) }}
        >
          <span className="dsh_lh_timeWhen">{relativeTime(record.mtime)}</span>
          <span className="dsh_lh_timeSession">{sessionLabel(record.sessionId)}</span>
        </button>
      ))}
    </div>
  )
}
