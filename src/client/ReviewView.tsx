/**
 * Full-width review list. Clicking a file opens the sidebar editor;
 * timeline sits next to file-level undo.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { HistoryRecord } from '../types.ts'
import { TimelineView } from './TimelineView.tsx'
import { compareSeedFromTimeline, type CompareSeed } from './compare.ts'
import type { LocalHistoryFace } from './remote.ts'
import { unwrapResult } from './remote.ts'
import type { Translate } from './locales.ts'
import { lookup } from './locales.ts'
import { notifyReviewChanged, setPendingCount, subscribeReviewChanged } from './pending.ts'
import { applyReviewRevert, popReviewRedo, popReviewUndo, pushReviewRevert } from './review-revert.ts'
import { bindReviewKeys } from './review-keys.ts'
import { latestPendingPerPath } from '../pending-latest.ts'
import { presentReviewHit, promptPreview } from './present.ts'
import { collectTreeHits, collectTreePrompts, type SessionsFace } from './session-tree.ts'

export interface SessionScope {
  sessionId: string
  cwd?: string
}

export interface ReviewAppProps {
  scope: SessionScope
  remote: LocalHistoryFace
  sessions?: SessionsFace
  t?: Translate
  visible?: boolean
  onOpenCompare?: (seed: CompareSeed) => void
  onOpenReview?: (record: HistoryRecord) => void
}

type Filter = 'pending' | 'all' | 'done'

function kindBadge(kind: HistoryRecord['kind']): string {
  if (kind === 'add') return 'A'
  if (kind === 'delete') return 'D'
  return 'M'
}

function relativeTimeLong(mtime: number, t: Translate, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - mtime) / 60_000))
  if (minutes < 1) return t('justNow')
  if (minutes < 60) return t('minutesAgo', { n: String(minutes) })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('hoursAgo', { n: String(hours) })
  return t('daysAgo', { n: String(Math.round(hours / 24)) })
}

function matchesFilter(record: HistoryRecord, filter: Filter): boolean {
  const decision = record.decision ?? 'pending'
  if (filter === 'pending') return decision === 'pending'
  if (filter === 'done') return decision !== 'pending'
  return true
}

function groupByTurn(records: readonly HistoryRecord[], newestFirst: boolean): {
  key: string
  turn?: number
  time?: number
  records: HistoryRecord[]
}[] {
  const map = new Map<string, { key: string; turn?: number; time?: number; records: HistoryRecord[] }>()
  for (const record of records) {
    const key = record.turn === undefined ? 'x' : String(record.turn)
    let group = map.get(key)
    if (group === undefined) {
      group = { key, turn: record.turn, time: record.mtime, records: [] }
      map.set(key, group)
    }
    group.records.push(record)
    if (record.mtime > (group.time ?? 0)) group.time = record.mtime
  }
  const groups = [...map.values()]
  groups.sort((a, b) => {
    const aTurn = a.turn ?? -1
    const bTurn = b.turn ?? -1
    if (aTurn !== bTurn) return newestFirst ? bTurn - aTurn : aTurn - bTurn
    const aTime = a.time ?? 0
    const bTime = b.time ?? 0
    return newestFirst ? bTime - aTime : aTime - bTime
  })
  return groups
}

export function ReviewApp(props: ReviewAppProps): ReactNode {
  const t = props.t ?? lookup
  const { scope, remote, sessions } = props
  const [filter, setFilter] = useState<Filter>('pending')
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [timelineId, setTimelineId] = useState<string | undefined>()
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const syncing = useRef(false)

  const cwd = scope.cwd
  const pending = useMemo(() => latestPendingPerPath(records), [records])
  const revertRef = useRef<(direction: 'undo' | 'redo') => boolean>(() => false)

  const loadList = async (): Promise<void> => {
    if (cwd === undefined || cwd === '') return
    try {
      const review = unwrapResult(await remote.listReview(scope.sessionId, cwd))
      setRecords(review.records)
      setPendingCount(review.pending)
      setError(false)
    } catch {
      setError(true)
      setPendingCount(null)
    }
  }

  const syncThenList = async (): Promise<void> => {
    if (cwd === undefined || cwd === '' || syncing.current) return
    syncing.current = true
    try {
      const hits = collectTreeHits(sessions, scope.sessionId, cwd)
      unwrapResult(await remote.syncSession(scope.sessionId, cwd, hits))
      await loadList()
      notifyReviewChanged()
    } catch {
      setError(true)
      setPendingCount(null)
    } finally {
      syncing.current = false
    }
  }

  useEffect(() => {
    if (cwd === undefined || cwd === '') {
      setRecords([])
      setPendingCount(null)
      return
    }
    if (props.visible === false) return
    void syncThenList()
  }, [cwd, scope.sessionId, props.visible])

  useEffect(() => {
    if (cwd === undefined || cwd === '') return
    return subscribeReviewChanged(() => { void loadList() })
  }, [cwd, scope.sessionId])

  useEffect(() => {
    if (cwd === undefined || cwd === '') return
    return sessions?.list?.subscribe?.(() => { void syncThenList() })
  }, [cwd, scope.sessionId, sessions])

  useEffect(() => bindReviewKeys(
    () => revertRef.current('undo'),
    () => revertRef.current('redo'),
  ), [])

  const filtered = useMemo(() => {
    if (filter === 'pending') return pending
    return records.filter((record) => matchesFilter(record, filter))
  }, [filter, pending, records])
  const groups = useMemo(() => groupByTurn(filtered, filter !== 'done'), [filter, filtered])
  const prompts = useMemo(
    () => collectTreePrompts(sessions, scope.sessionId),
    [sessions, scope.sessionId, records],
  )

  const revert = (direction: 'undo' | 'redo'): boolean => {
    const entry = direction === 'undo' ? popReviewUndo() : popReviewRedo()
    if (entry === undefined) return false
    void (async () => {
      try {
        await applyReviewRevert(remote, entry, direction)
        notifyReviewChanged()
      } catch {
        /* keep the list; revert is best-effort */
      }
    })()
    return true
  }
  revertRef.current = revert

  const keepAll = (): void => {
    void (async () => {
      if (busy) return
      setBusy(true)
      try {
        for (const record of pending) {
          unwrapResult(await remote.acceptFile(scope.sessionId, cwd, record.id))
          pushReviewRevert({
            kind: 'file-accept',
            sessionId: scope.sessionId,
            cwd,
            recordId: record.id,
            path: record.path,
          })
        }
        await loadList()
        notifyReviewChanged()
      } catch {
        setError(true)
      } finally {
        setBusy(false)
      }
    })()
  }

  const undoAll = (): void => {
    void (async () => {
      if (busy) return
      setBusy(true)
      try {
        for (const record of pending) {
          const current = unwrapResult(await remote.readCurrent(scope.sessionId, cwd, record.path))
          unwrapResult(await remote.rejectFile(scope.sessionId, cwd, record.id))
          pushReviewRevert({
            kind: 'file-reject',
            sessionId: scope.sessionId,
            cwd,
            recordId: record.id,
            path: record.path,
            previous: current.content,
            next: null,
          })
        }
        await loadList()
        notifyReviewChanged()
      } catch {
        setError(true)
      } finally {
        setBusy(false)
      }
    })()
  }

  if (cwd === undefined || cwd === '') {
    return <div className="dsh_lh_root"><div className="dsh_lh_empty">{t('noSession')}</div></div>
  }

  return (
    <div className="dsh_lh_root" data-lh-review="">
      <div className="dsh_lh_toolbar">
        <span className="dsh_lh_pendingCount">{t('pendingCount', { n: String(pending.length) })}</span>
        <span className="dsh_lh_toolbarGrow" />
        <button type="button" className="dsh_lh_button" disabled={pending.length === 0 || busy} onClick={keepAll}>
          {t('keepAll')}
        </button>
        <button type="button" className="dsh_lh_button" disabled={pending.length === 0 || busy} onClick={undoAll}>
          {t('undoAll')}
        </button>
      </div>
      <div className="dsh_lh_filters" role="tablist">
        {([
          ['pending', 'filterPending'],
          ['all', 'filterAll'],
          ['done', 'filterDone'],
        ] as const).map(([id, key]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="dsh_lh_filter"
            aria-selected={filter === id}
            onClick={() => { setFilter(id) }}
          >
            {t(key)}
          </button>
        ))}
      </div>
      {error && <div className="dsh_lh_error">{t('loadFailed')}</div>}
      <div className="dsh_lh_list" data-lh-full="">
        {groups.length === 0 && !error && <div className="dsh_lh_empty">{t('emptyList')}</div>}
        {groups.map((group) => {
          const prompt = prompts.get(group.turn ?? 'x') ?? ''
          return (
            <div key={group.key} className="dsh_lh_group">
              <div className="dsh_lh_groupHeader">
                <div className="dsh_lh_groupMeta">
                  <span className="dsh_lh_groupTurn">
                    {group.turn === undefined ? t('turnUnknown') : t('turn', { n: String(group.turn) })}
                  </span>
                  {group.time !== undefined && (
                    <span className="dsh_lh_groupTime">{relativeTimeLong(group.time, t)}</span>
                  )}
                  <span className="dsh_lh_groupCount">{t('fileCount', { n: String(group.records.length) })}</span>
                </div>
                <div className="dsh_lh_groupPrompt">
                  {prompt === '' ? t('noPrompt') : promptPreview(prompt)}
                </div>
              </div>
              {group.records.map((record) => {
                const shown = presentReviewHit(record.path, cwd)
                const decided = (record.decision ?? 'pending') !== 'pending'
                const openTimeline = timelineId === record.id
                return (
                  <div key={record.id}>
                    <div
                      className="dsh_lh_row"
                      data-lh-row=""
                      data-selected={openTimeline ? 'true' : 'false'}
                    >
                      <button
                        type="button"
                        className="dsh_lh_rowMain"
                        title={record.path}
                        onClick={() => { props.onOpenReview?.(record) }}
                      >
                        <span className="dsh_lh_kind" data-kind={record.kind}>{kindBadge(record.kind)}</span>
                        <span className="dsh_lh_name" data-kind={record.kind}>{shown.name}</span>
                        {shown.location !== null && (
                          <span className="dsh_lh_location" data-kind={record.kind}>{t('ofLocation', { path: shown.location })}</span>
                        )}
                        {shown.module !== null && (
                          <span className="dsh_lh_module">{shown.module}</span>
                        )}
                      </button>
                      <div className="dsh_lh_rowActions">
                        {decided && (
                          <span className="dsh_lh_status">
                            {record.decision === 'accepted' ? t('statusAccepted') : t('statusRejected')}
                          </span>
                        )}
                        <button
                          type="button"
                          className="dsh_lh_chevron"
                          aria-label={t('timeline')}
                          aria-expanded={openTimeline}
                          data-lh-timeline=""
                          onClick={() => { setTimelineId((current) => current === record.id ? undefined : record.id) }}
                        >
                          {openTimeline ? '▾' : '▸'}
                        </button>
                      </div>
                    </div>
                    {openTimeline && (
                      <TimelineView
                        path={record.path}
                        sessionId={scope.sessionId}
                        cwd={cwd}
                        remote={remote}
                        t={t}
                        selectedId={record.id}
                        onSelect={(item, all) => { props.onOpenCompare?.(compareSeedFromTimeline(all, item, cwd)) }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { ReviewApp as ReviewView }
