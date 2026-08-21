/**
 * Side-by-side snapshot compare: previous on the left, this version on the right.
 *
 * VSCode-style split: each side is its own scrollable pane with its own
 * vertical and horizontal scrollbars. Both scroll axes are synced (dragging
 * either pane moves the other proportionally) so aligned diff rows stay
 * aligned and the long-line view stays in step. The line-number gutter is
 * sticky-left, so it stays pinned while the code scrolls horizontally. Long
 * lines size the row to its content (`width: max-content` in the CSS) so they
 * grow the pane's scroll width instead of bleeding into the neighbor column.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { paintSplitDiff, type SplitRow } from '../history/hunks.ts'
import type { LocalHistoryFace } from './remote.ts'
import { unwrapResult } from './remote.ts'
import type { Translate } from './locales.ts'
import { lookup } from './locales.ts'
import { highlightLineHtml, type ScanMode } from './present.ts'
import { shortHash, type CompareSeed } from './compare.ts'

export interface SplitDiffViewProps {
  seed: CompareSeed
  remote: LocalHistoryFace
  t?: Translate
}

interface Loaded {
  left: string
  right: string
  error: boolean
  /** true when the failure is a gc-dropped snapshot blob (ENOENT) */
  gone: boolean
}

type HighlightedRow = SplitRow & { leftHtml: string; rightHtml: string }

export function SplitDiffView(props: SplitDiffViewProps): ReactNode {
  const t = props.t ?? lookup
  const { seed, remote } = props
  const [state, setState] = useState<Loaded | null>(null)
  const leftRef = useRef<HTMLDivElement | null>(null)
  const rightRef = useRef<HTMLDivElement | null>(null)
  const syncingRef = useRef(false)

  const leftHash = seed.leftHash ?? ''
  const rightHash = seed.rightHash ?? ''
  const leftSession = seed.leftSessionId ?? seed.sessionId
  const rightSession = seed.rightSessionId ?? seed.sessionId
  const cwd = seed.cwd

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const left = leftHash === ''
          ? ''
          : unwrapResult(await remote.readBlob(leftSession, cwd, leftHash)).content
        const right = rightHash === ''
          ? ''
          : unwrapResult(await remote.readBlob(rightSession, cwd, rightHash)).content
        if (!cancelled) setState({ left, right, error: false, gone: false })
      } catch (loadError) {
        if (!cancelled) setState({ left: '', right: '', error: true, gone: String(loadError).includes('ENOENT') })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [cwd, leftHash, leftSession, rightHash, rightSession])

  const rows = useMemo(
    () => state === null || state.error ? [] : paintSplitDiff(state.left, state.right).rows,
    [state],
  )

  const highlighted = useMemo<HighlightedRow[]>(() => splitHighlighted(rows), [rows])

  /** VSCode-style scroll sync: scrolling one pane moves the other — vertical
   *  keeps aligned diff rows in step, horizontal keeps the long-line view in
   *  step. Both axes map proportionally (the two sides can differ in width). */
  const syncScroll = (source: HTMLDivElement, target: HTMLDivElement): void => {
    if (syncingRef.current) return
    const vSpan = source.scrollHeight - source.clientHeight
    const hSpan = source.scrollWidth - source.clientWidth
    const targetTop = vSpan <= 0
      ? target.scrollTop
      : (source.scrollTop / vSpan) * (target.scrollHeight - target.clientHeight)
    const targetLeft = hSpan <= 0
      ? target.scrollLeft
      : (source.scrollLeft / hSpan) * (target.scrollWidth - target.clientWidth)
    if (Math.abs(target.scrollTop - targetTop) < 1 && Math.abs(target.scrollLeft - targetLeft) < 1) return
    // Keep the guard armed until the next frame: the programmatic scrollTop /
    // scrollLeft writes fire scroll events on the target asynchronously, which
    // would otherwise echo back into this handler and ping-pong.
    syncingRef.current = true
    target.scrollTop = targetTop
    target.scrollLeft = targetLeft
    requestAnimationFrame(() => { syncingRef.current = false })
  }

  if (state === null) return <div className="dsh_lh_empty" />
  if (state.error) return <div className="dsh_lh_error">{state.gone ? t('snapshotGone') : t('loadFailed')}</div>

  return (
    <div className="dsh_lh_root dsh_lh_split" data-lh-split="">
      <div className="dsh_lh_splitHeads">
        <div className="dsh_lh_splitHead">{t('compareLeft', { hash: shortHash(seed.leftHash) })}</div>
        <div className="dsh_lh_splitHead">{t('compareRight', { hash: shortHash(seed.rightHash) })}</div>
      </div>
      <div className="dsh_lh_splitBody">
        <div
          ref={leftRef}
          className="dsh_lh_splitPane"
          onScroll={(event) => {
            const target = rightRef.current
            if (target !== null) syncScroll(event.currentTarget, target)
          }}
        >
          {highlighted.map((row, index) => (
            <div key={index} className="dsh_lh_rowLine" data-mark={row.left.kind}>
              <span className="dsh_lh_gutter">{row.left.line ?? ''}</span>
              <span className="dsh_lh_code" dangerouslySetInnerHTML={{ __html: row.leftHtml }} />
            </div>
          ))}
        </div>
        <div
          ref={rightRef}
          className="dsh_lh_splitPane"
          onScroll={(event) => {
            const target = leftRef.current
            if (target !== null) syncScroll(event.currentTarget, target)
          }}
        >
          {highlighted.map((row, index) => (
            <div key={index} className="dsh_lh_rowLine" data-mark={row.right.kind}>
              <span className="dsh_lh_gutter">{row.right.line ?? ''}</span>
              <span className="dsh_lh_code" dangerouslySetInnerHTML={{ __html: row.rightHtml }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function splitHighlighted(rows: readonly SplitRow[]): HighlightedRow[] {
  let leftMode: ScanMode = 'code'
  let rightMode: ScanMode = 'code'
  return rows.map((row) => {
    const left = highlightLineHtml(row.left.text, row.left.kind === 'empty' ? leftMode : leftMode)
    const right = highlightLineHtml(row.right.text, row.right.kind === 'empty' ? rightMode : rightMode)
    if (row.left.kind !== 'empty') leftMode = left.mode
    if (row.right.kind !== 'empty') rightMode = right.mode
    return { ...row, leftHtml: left.html, rightHtml: right.html }
  })
}
