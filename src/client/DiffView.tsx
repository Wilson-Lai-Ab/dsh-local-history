/**
 * File-style review pane: current disk with line numbers, deletions
 * struck through in place, additions highlighted. Hunk accept/reject
 * appear on hover at the top-right of the painted block, with a line range.
 */
import { Component, createElement, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { paintFileDiff, type PaintRow, type ReviewHunk } from '../history/hunks.ts'
import type { HistoryRecord } from '../types.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { LocalHistoryFace } from './remote.ts'
import { unwrapResult } from './remote.ts'
import type { Translate } from './locales.ts'
import { lookup } from './locales.ts'
import { highlightRowsHtml } from './present.ts'
import { notifyReviewChanged, subscribeReviewChanged } from './pending.ts'
import { applyReviewRevert, popReviewRedo, popReviewUndo, pushReviewRevert } from './review-revert.ts'
import { bindReviewKeys } from './review-keys.ts'
import { ReviewMinimap, useEditorMinimap, type MinimapPrefsSource } from './review-minimap.ts'

export interface DiffViewProps {
  record: HistoryRecord
  sessionId: string
  cwd?: string
  remote: LocalHistoryFace
  t?: Translate
  compareHash?: string | null
  afterHash?: string | null
  blobSessionId?: string
  onChanged?: () => void
  onFileDone?: () => void
  onRecord?: (record: HistoryRecord) => void
  visible?: boolean
  prefs?: MinimapPrefsSource
}

interface DiffState {
  before: string
  after: string
  current: string
  binary: boolean
  error: boolean
  /** true when the failure is a gc-dropped snapshot blob (ENOENT) */
  gone: boolean
  live: boolean
}

export function DiffView(props: DiffViewProps): ReactNode {
  const t = props.t ?? lookup
  const { record, sessionId, cwd, remote } = props
  const [state, setState] = useState<DiffState | null>(null)
  const [busy, setBusy] = useState(false)
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(() => acceptedHunkKeys(record))
  const revertRef = useRef<(direction: 'undo' | 'redo') => boolean>(() => false)
  const liveRef = useRef(false)
  const [fileEl, setFileEl] = useState<HTMLDivElement | null>(null)
  const minimapOn = useEditorMinimap(props.prefs)
  const markdown = isMarkdownPath(record.path)
  const [mode, setMode] = useState<'preview' | 'edit'>('edit')
  useEffect(() => {
    setMode('edit')
  }, [record.path])

  useEffect(() => {
    liveRef.current = false
  }, [record.id])

  useEffect(() => {
    let cancelled = false
    const load = async (live: boolean): Promise<void> => {
      try {
        let latest = record
        try {
          const review = unwrapResult(await remote.listReview(sessionId, cwd))
          const found = review.records.find((item) => item.id === record.id)
          if (found !== undefined) {
            latest = found
            setAccepted((prev) => new Set([...prev, ...acceptedHunkKeys(found)]))
          }
        } catch {
          /* keep record.hunks seed */
        }
        let before = ''
        const blobSession = props.blobSessionId ?? sessionId
        const beforeHash = props.compareHash ?? latest.beforeHash
        if (beforeHash !== null && beforeHash !== undefined && beforeHash !== '') {
          const blob = unwrapResult(await remote.readBlob(blobSession, cwd, beforeHash))
          before = blob.content
        }
        let after = ''
        let binary = false
        const afterHash = props.afterHash
        const useLive = live || liveRef.current
        if (!useLive && afterHash !== null && afterHash !== undefined && afterHash !== '') {
          after = unwrapResult(await remote.readBlob(blobSession, cwd, afterHash)).content
        } else {
          const current = unwrapResult(await remote.readCurrent(sessionId, cwd, record.path))
          after = current.content ?? ''
          binary = current.binary
        }
        if (cancelled) return
        if (latest.beforeHash !== record.beforeHash) props.onRecord?.(latest)
        liveRef.current = useLive
        setState({
          before,
          after,
          current: after,
          binary,
          error: false,
          gone: false,
          live: useLive,
        })
      } catch (loadError) {
        if (!cancelled) setState({
          before: '',
          after: '',
          current: '',
          binary: false,
          error: true,
          gone: String(loadError).includes('ENOENT'),
          live,
        })
      }
    }
    void load(false)
    const stop = subscribeReviewChanged(() => { void load(liveRef.current) })
    return () => {
      cancelled = true
      stop()
    }
  }, [cwd, props.afterHash, props.blobSessionId, props.compareHash, record.beforeHash, record.hash, record.id, record.path, remote, sessionId])

  const reloadLive = async (): Promise<void> => {
    const current = unwrapResult(await remote.readCurrent(sessionId, cwd, record.path))
    liveRef.current = true
    setState((prev) => ({
      before: prev?.before ?? '',
      after: current.content ?? '',
      current: current.content ?? '',
      binary: current.binary,
      error: false,
      gone: false,
      live: true,
    }))
  }

  const remember = (result: unknown): void => {
    const records = (result as { records?: HistoryRecord[] } | undefined)?.records
    const latest = records?.find((item) => item.id === record.id)
    if (latest === undefined) return
    setAccepted(acceptedHunkKeys(latest))
    props.onRecord?.(latest)
  }

  const run = async (fn: () => Promise<RemoteResult<unknown>>, after?: 'file' | 'reject-hunk' | 'accept-hunk', hunkKey?: string, hunk?: ReviewHunk): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const snapshot = state?.current
      remember(unwrapResult(await fn()))
      if (after === 'accept-hunk' && hunkKey !== undefined) {
        setAccepted((prev) => new Set([...prev, hunkKey]))
        pushReviewRevert({
          kind: 'hunk-accept',
          sessionId,
          cwd,
          recordId: record.id,
          path: record.path,
          hunkKey,
          hunk,
        })
      }
      if (after === 'reject-hunk' && hunk !== undefined) {
        pushReviewRevert({
          kind: 'hunk-reject',
          sessionId,
          cwd,
          recordId: record.id,
          path: record.path,
          previous: snapshot,
          hunkKey: hunk.key,
          hunk,
        })
        await reloadLive()
      }
      if (after === 'file') {
        const keep = hunkKey === 'keep'
        pushReviewRevert({
          kind: keep ? 'file-accept' : 'file-reject',
          sessionId,
          cwd,
          recordId: record.id,
          path: record.path,
          previous: keep ? undefined : snapshot,
        })
      }
      props.onChanged?.()
      notifyReviewChanged()
      if (after === 'file') props.onFileDone?.()
    } catch {
      setState((prev) => prev === null
        ? { before: '', after: '', current: '', binary: false, error: true, gone: false, live: false }
        : { ...prev, error: true, gone: false })
    } finally {
      setBusy(false)
    }
  }

  const revert = (direction: 'undo' | 'redo'): boolean => {
    const entry = direction === 'undo'
      ? popReviewUndo(sessionId, record.path)
      : popReviewRedo(sessionId, record.path)
    if (entry === undefined) return false
    void (async () => {
      try {
        await applyReviewRevert(remote, entry, direction)
        if (entry.kind === 'hunk-accept' && entry.hunkKey !== undefined) {
          setAccepted((prev) => {
            const next = new Set(prev)
            if (direction === 'undo') next.delete(entry.hunkKey!)
            else next.add(entry.hunkKey!)
            return next
          })
        }
        await reloadLive()
        notifyReviewChanged()
        props.onChanged?.()
      } catch {
        /* keep the painted diff; Cmd+Z is best-effort */
      }
    })()
    return true
  }
  revertRef.current = revert

  useEffect(() => {
    if (props.visible === false) return
    return bindReviewKeys(
      () => revertRef.current('undo'),
      () => revertRef.current('redo'),
    )
  }, [props.visible])

  if (state === null) return <div className="dsh_lh_empty" />
  if (state.error) return <div className="dsh_lh_error">{state.gone ? t('snapshotGone') : t('loadFailed')}</div>

  const painted = state.binary ? { rows: [], hunks: [] as ReviewHunk[] } : paintFileDiff(state.before, state.after)
  const rows = settleAccepted(painted.rows, accepted)
  const highlighted = highlightRowsHtml(rows)
  const decided = (record.decision ?? 'pending') !== 'pending'
  const hunkByKey = new Map(
    decided
      ? []
      : painted.hunks.filter((hunk) => !accepted.has(hunk.key)).map((hunk) => [hunk.key, hunk]),
  )
  const blocks = groupPaintRows(rows.map((row, index) => ({ ...row, html: highlighted[index] ?? '' })))

  const showPreview = markdown && mode === 'preview'
  return (
    <div className="dsh_lh_root dsh_lh_pane" data-lh-diff="">
      {(markdown || !decided) && (
      <div className="dsh_lh_reviewBar">
        {markdown && (
          <div className="dsh_lh_modeToggle">
            <button
              type="button"
              className="dsh_lh_modeButton"
              data-active={mode === 'preview' ? 'true' : 'false'}
              onClick={() => { setMode('preview') }}
            >
              {t('preview')}
            </button>
            <button
              type="button"
              className="dsh_lh_modeButton"
              data-active={mode === 'edit' ? 'true' : 'false'}
              onClick={() => { setMode('edit') }}
            >
              {t('edit')}
            </button>
          </div>
        )}
        {!decided && <span className="dsh_lh_reviewHint">{t('agentEdited')}</span>}
        {!decided && (
        <div className="dsh_lh_reviewActions">
          <button
            type="button"
            className="dsh_lh_button"
            disabled={busy}
            onClick={() => { void run(() => remote.rejectFile(sessionId, cwd, record.id), 'file') }}
          >
            {t('undoFile')}
          </button>
          <button
            type="button"
            className="dsh_lh_button"
            data-kind="keep"
            disabled={busy}
            onClick={() => { void run(() => remote.acceptFile(sessionId, cwd, record.id), 'file', 'keep') }}
          >
            {t('keepFile')}
          </button>
        </div>
        )}
      </div>
      )}
      {state.binary ? (
        <div className="dsh_lh_empty">{t('binaryFile')}</div>
      ) : showPreview ? (
        <PreviewBoundary fallback={t('loadFailed')}>
          <div className="dsh_lh_md">
            {createElement(MarkdownText, {
              text: state.after,
              codeLabels: { copyLabel: t('copy'), copiedLabel: t('copied') },
              labels: {
                code: { copyLabel: t('copy'), copiedLabel: t('copied') },
                footnotes: t('markdownFootnotes'),
              },
            } as Parameters<typeof MarkdownText>[0] & {
              labels: { code: { copyLabel: string; copiedLabel: string }; footnotes: string }
            })}
          </div>
        </PreviewBoundary>
      ) : (
        <div className="dsh_lh_fileWrap">
        <div className="dsh_lh_file" ref={setFileEl}>
          {blocks.map((block, blockIndex) => {
            const hunk = block.hunkKey === undefined ? undefined : hunkByKey.get(block.hunkKey)
            const range = hunk === undefined ? '' : hunkRange(hunk)
            return (
              <div
                key={block.hunkKey ?? `ctx-${blockIndex}`}
                className="dsh_lh_block"
                data-hunk-key={block.hunkKey ?? ''}
              >
                {hunk !== undefined && (
                  <div className="dsh_lh_inlineBar">
                    <button
                      type="button"
                      className="dsh_lh_button"
                      disabled={busy}
                      onClick={() => { void run(() => remote.rejectHunk(sessionId, cwd, record.id, hunk), 'reject-hunk', hunk.key, hunk) }}
                    >
                      {t('undoHunk', { range })}
                    </button>
                    <button
                      type="button"
                      className="dsh_lh_button"
                      data-kind="keep"
                      disabled={busy}
                      onClick={() => { void run(() => remote.acceptHunk(sessionId, cwd, record.id, hunk.key), 'accept-hunk', hunk.key, hunk) }}
                    >
                      {t('keepHunk', { range })}
                    </button>
                  </div>
                )}
                {block.rows.map((row, index) => (
                  <div
                    key={`${row.kind}-${row.line ?? 'x'}-${index}`}
                    className="dsh_lh_rowLine"
                    data-mark={row.kind}
                  >
                    <span className="dsh_lh_gutter">{row.kind === 'del' ? '' : row.line ?? ''}</span>
                    <span className="dsh_lh_code" dangerouslySetInnerHTML={{ __html: row.html }} />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        <ReviewMinimap rows={rows} scrollEl={fileEl} enabled={minimapOn} />
        </div>
      )}
    </div>
  )
}

function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(path)
}

class PreviewBoundary extends Component<{ children?: ReactNode; fallback: string }, { error: string | null }> {
  state = { error: null as string | null }

  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[dsh-local-history] markdown preview error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return <div className="dsh_lh_error">{this.props.fallback}</div>
    }
    return this.props.children
  }
}

function acceptedHunkKeys(record: HistoryRecord): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const [key, decision] of Object.entries(record.hunks ?? {})) {
    if (decision === 'accepted') keys.add(key)
  }
  return keys
}

function settleAccepted(rows: readonly PaintRow[], accepted: ReadonlySet<string>): PaintRow[] {
  const out: PaintRow[] = []
  for (const row of rows) {
    if (row.hunkKey === undefined || !accepted.has(row.hunkKey)) {
      out.push(row)
      continue
    }
    if (row.kind === 'del') continue
    out.push({ ...row, kind: 'ctx', hunkKey: undefined })
  }
  return out
}

function hunkRange(hunk: ReviewHunk): string {
  return hunk.start === hunk.end ? `${hunk.start}` : `${hunk.start}-${hunk.end}`
}

function groupPaintRows<T extends PaintRow>(rows: readonly T[]): { hunkKey?: string; rows: T[] }[] {
  const blocks: { hunkKey?: string; rows: T[] }[] = []
  for (const row of rows) {
    const key = row.hunkKey
    const last = blocks[blocks.length - 1]
    if (last !== undefined && last.hunkKey === key) last.rows.push(row)
    else blocks.push({ hunkKey: key, rows: [row] })
  }
  return blocks
}
