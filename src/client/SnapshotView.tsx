/**
 * Fast snapshot pane: one <pre> for code, one for line numbers.
 * No per-token React nodes — opening a snapshot must stay cheap.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { HistoryRecord } from '../types.ts'
import type { LocalHistoryFace } from './remote.ts'
import { unwrapResult } from './remote.ts'
import type { Translate } from './locales.ts'
import { lookup } from './locales.ts'
import { highlightToHtml } from './present.ts'

export interface SnapshotViewProps {
  record: HistoryRecord
  cwd?: string
  remote: LocalHistoryFace
  t?: Translate
  onClose?: () => void
}

function lineNumbers(content: string): string {
  const count = content === '' ? 1 : content.split('\n').length - (content.endsWith('\n') ? 1 : 0)
  const lines: string[] = []
  for (let i = 1; i <= Math.max(1, count); i += 1) lines.push(String(i))
  return lines.join('\n')
}

export function SnapshotView(props: SnapshotViewProps): ReactNode {
  const t = props.t ?? lookup
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)
  /** true when the failure is a gc-dropped snapshot blob (ENOENT) */
  const [gone, setGone] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const hash = props.record.hash
        if (hash === null || hash === undefined || hash === '') {
          if (!cancelled) setContent('')
          return
        }
        const blob = unwrapResult(await props.remote.readBlob(props.record.sessionId, props.cwd, hash))
        if (!cancelled) {
          setContent(blob.content)
          setError(false)
          setGone(false)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(true)
          setGone(String(loadError).includes('ENOENT'))
        }
      }
    }
    setContent(null)
    void load()
    return () => { cancelled = true }
  }, [props.cwd, props.record.hash, props.record.id, props.record.sessionId, props.remote])

  if (error) return <div className="dsh_lh_error">{gone ? t('snapshotGone') : t('loadFailed')}</div>
  if (content === null) return <div className="dsh_lh_empty" />

  return (
    <div className="dsh_lh_snapshot" data-lh-snapshot="">
      <div className="dsh_lh_reviewBar">
        <span className="dsh_lh_reviewHint">{props.record.path}</span>
        {props.onClose !== undefined && (
          <button type="button" className="dsh_lh_button" onClick={props.onClose}>
            {t('backToList')}
          </button>
        )}
      </div>
      {props.record.hash === null ? (
        <div className="dsh_lh_empty">{t('binaryFile')}</div>
      ) : (
        <div className="dsh_lh_snapBody">
          <pre className="dsh_lh_snapGutter">{lineNumbers(content)}</pre>
          <pre className="dsh_lh_snapCode" dangerouslySetInnerHTML={{ __html: highlightToHtml(content) }} />
        </div>
      )}
    </div>
  )
}
