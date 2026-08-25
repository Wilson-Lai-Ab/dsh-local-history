/**
 * Character-mode density thumbnail for local-history review panes.
 * Matches the file-preview Replit minimap look (fillText glyphs + overlay)
 * without pulling CodeMirror into this plugin.
 */
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { createElement } from 'react'
import { highlightLine } from './present.ts'

export interface MinimapRow {
  kind: 'ctx' | 'add' | 'del' | 'empty'
  text: string
}

export interface MinimapGlyph {
  text: string
  color: string
}

export interface MinimapLine {
  glyphs: MinimapGlyph[]
  wash?: string
}

/** Same numbers as @replit/codemirror-minimap Scale.MaxWidth / WIDTH_RATIO / SizeRatio. */
const MAX_WIDTH = 120
const WIDTH_RATIO = 6
const SIZE_RATIO = 4
const REVIEW_LINE_PX = 20

const GLYPH: Record<string, string> = {
  default: '#abb2bf',
  kw: '#c678dd',
  str: '#98c379',
  cmt: '#5c6370',
  fn: '#61afef',
}

const WASH = {
  add: 'rgba(46,160,67,0.18)',
  del: 'rgba(248,81,73,0.18)',
}

export function minimapWidthPx(hostWidth: number): number {
  return Math.min(MAX_WIDTH, Math.max(0, Math.round(hostWidth / WIDTH_RATIO)))
}

export function minimapLayout(input: {
  rowCount: number
  gutterHeight: number
  scrollHeight: number
  clientHeight: number
  scrollTop: number
  editorLinePx?: number
}): { lineHeight: number; paintHeight: number; overlayHeight: number; overlayTop: number } {
  const editorLine = input.editorLinePx ?? REVIEW_LINE_PX
  const natural = editorLine / SIZE_RATIO
  const rows = Math.max(1, input.rowCount)
  const lineHeight = input.gutterHeight <= 0 ? natural : Math.min(natural, input.gutterHeight / rows)
  const paintHeight = lineHeight * rows
  const scrollHeight = Math.max(1, input.scrollHeight)
  return {
    lineHeight,
    paintHeight,
    overlayHeight: (input.clientHeight / scrollHeight) * paintHeight,
    overlayTop: (input.scrollTop / scrollHeight) * paintHeight,
  }
}

export function minimapLines(rows: readonly MinimapRow[]): MinimapLine[] {
  return rows.map((row) => {
    const glyphs = highlightLine(row.text).map((span) => ({
      text: span.text,
      color: GLYPH[span.kind ?? 'default'] ?? GLYPH.default,
    }))
    const wash = row.kind === 'add' ? WASH.add : row.kind === 'del' ? WASH.del : undefined
    return { glyphs, wash }
  })
}

export function minimapClickRatio(offsetY: number, height: number): number {
  if (height <= 0) return 0
  return Math.min(1, Math.max(0, offsetY / height))
}

export interface MinimapPrefsSource {
  getSnapshot?: () => { prefs?: { editorMinimap?: boolean } }
  subscribeState?: (listener: () => void) => () => void
}

export function readEditorMinimap(source?: MinimapPrefsSource): boolean {
  return source?.getSnapshot?.()?.prefs?.editorMinimap !== false
}

export function useEditorMinimap(source?: MinimapPrefsSource): boolean {
  return useSyncExternalStore(
    (listener) => source?.subscribeState?.(listener) ?? (() => {}),
    () => readEditorMinimap(source),
    () => true,
  )
}

function drawMinimap(canvas: HTMLCanvasElement, rows: readonly MinimapRow[]): void {
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (width <= 0 || height <= 0) return
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  canvas.width = Math.max(1, Math.round(width * dpr))
  canvas.height = Math.max(1, Math.round(height * dpr))
  const ctx = canvas.getContext('2d')
  if (ctx === null) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  if (rows.length === 0) return
  const lines = minimapLines(rows)
  const lineH = minimapLayout({
    rowCount: lines.length,
    gutterHeight: height,
    scrollHeight: height,
    clientHeight: height,
    scrollTop: 0,
  }).lineHeight
  const fontPx = Math.max(1.2, lineH * 0.85)
  const charW = fontPx * 0.55
  ctx.textBaseline = 'top'
  ctx.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
  for (let i = 0; i < lines.length; i += 1) {
    const y = i * lineH
    const line = lines[i]
    if (line === undefined) continue
    if (line.wash !== undefined) {
      ctx.fillStyle = line.wash
      ctx.fillRect(0, y, width, Math.max(lineH, 1 / dpr))
    }
    let x = 2
    for (const glyph of line.glyphs) {
      if (x > width) break
      ctx.fillStyle = glyph.color
      ctx.fillText(glyph.text, x, y)
      x += glyph.text.length * charW
    }
  }
}

export function ReviewMinimap(props: {
  rows: readonly MinimapRow[]
  scrollEl: HTMLElement | null
  enabled?: boolean
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const enabled = props.enabled !== false

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    const root = rootRef.current
    if (canvas === null || root === null) return
    const host = props.scrollEl?.parentElement ?? root.parentElement
    const apply = (): void => {
      const width = minimapWidthPx(host?.clientWidth ?? root.clientWidth)
      root.style.width = `${width}px`
      host?.style.setProperty('--dsh-lh-minimap', `${width}px`)
      drawMinimap(canvas, props.rows)
    }
    apply()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(apply)
    if (host !== null && host !== undefined) observer?.observe(host)
    observer?.observe(root)
    return () => { observer?.disconnect() }
  }, [enabled, props.rows, props.scrollEl])

  useEffect(() => {
    if (!enabled) return
    const scroll = props.scrollEl
    const overlay = overlayRef.current
    const root = rootRef.current
    if (scroll === null || overlay === null || root === null) return
    const sync = (): void => {
      const layout = minimapLayout({
        rowCount: props.rows.length,
        gutterHeight: root.clientHeight,
        scrollHeight: scroll.scrollHeight,
        clientHeight: scroll.clientHeight,
        scrollTop: scroll.scrollTop,
      })
      overlay.style.height = `${Math.max(2, layout.overlayHeight)}px`
      overlay.style.top = `${layout.overlayTop}px`
    }
    sync()
    scroll.addEventListener('scroll', sync, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(sync)
    observer?.observe(scroll)
    observer?.observe(root)
    return () => {
      scroll.removeEventListener('scroll', sync)
      observer?.disconnect()
    }
  }, [enabled, props.scrollEl, props.rows.length])

  if (!enabled) return null

  const onClick = (event: { currentTarget: HTMLElement; clientY: number }): void => {
    const scroll = props.scrollEl
    if (scroll === null) return
    const box = event.currentTarget.getBoundingClientRect()
    const layout = minimapLayout({
      rowCount: props.rows.length,
      gutterHeight: box.height,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
      scrollTop: scroll.scrollTop,
    })
    const ratio = minimapClickRatio(event.clientY - box.top, layout.paintHeight)
    const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight)
    scroll.scrollTop = ratio * max
  }

  return createElement(
    'div',
    {
      ref: rootRef,
      className: 'dsh_lh_minimap',
      onClick,
      role: 'scrollbar',
      'aria-label': 'minimap',
    },
    createElement('canvas', { ref: canvasRef, className: 'dsh_lh_minimapCanvas' }),
    createElement('div', { ref: overlayRef, className: 'dsh_lh_minimapOverlay' }),
  )
}
