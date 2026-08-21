/**
 * Review-list presentation: IDE-style path rows and turn prompt previews.
 */

export interface ReviewHitPresentation {
  name: string
  location: string | null
  module: string | null
}

export function relativeTo(cwd: string | undefined, path: string): string {
  const file = path.replace(/\\/g, '/')
  if (cwd === undefined || cwd === '') return file
  const root = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  if (file === root) return '.'
  if (file.startsWith(`${root}/`)) return file.slice(root.length + 1)
  return file
}

/** IDE-style row: file name, leftover folder, top-level module. */
export function presentReviewHit(path: string, cwd?: string): ReviewHitPresentation {
  const rel = relativeTo(cwd, path)
  const shown = rel === '.' ? (path.replace(/\\/g, '/').split('/').pop() ?? path) : rel
  const parts = shown.replace(/\\/g, '/').split('/').filter((part) => part !== '')
  const fileName = parts.pop() ?? shown
  if (parts.length === 0) return { name: fileName, location: null, module: null }
  const module = parts[0] ?? null
  const afterModule = parts.slice(1)
  return {
    name: fileName,
    location: afterModule.length === 0 ? null : afterModule.join('/'),
    module,
  }
}

export function promptPreview(prompt: string, max = 96): string {
  const compact = prompt.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, Math.max(0, max - 1))}…`
}

function textFromBlocks(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  const texts: string[] = []
  for (const block of blocks) {
    if (typeof block === 'string') {
      texts.push(block)
      continue
    }
    if (block === null || typeof block !== 'object') continue
    const record = block as { type?: unknown; text?: unknown }
    if (typeof record.text === 'string' && (record.type === undefined || record.type === 'text')) {
      texts.push(record.text)
    }
  }
  return texts.join('\n')
}

export function promptOfNode(node: unknown): string {
  if (node === null || typeof node !== 'object') return ''
  const record = node as { text?: unknown; content?: unknown; parts?: unknown }
  if (typeof record.text === 'string') return record.text
  if (typeof record.content === 'string') return record.content
  const fromContent = textFromBlocks(record.content)
  if (fromContent !== '') return fromContent
  return textFromBlocks(record.parts)
}

/** Last user prompt seen before tools of each turn. */
export function collectTurnPrompts(nodes: readonly unknown[]): Map<number | 'x', string> {
  const prompts = new Map<number | 'x', string>()
  let prompt = ''
  let turn: number | undefined
  for (const node of nodes) {
    if (node === null || typeof node !== 'object') continue
    const record = node as { kind?: unknown; turn?: unknown }
    if (record.kind === 'user' || record.kind === 'steering') {
      const next = promptOfNode(node).trim()
      if (next !== '') prompt = next
      continue
    }
    if (typeof record.turn === 'number') turn = record.turn
    if (prompt === '') continue
    prompts.set(turn ?? 'x', prompt)
  }
  return prompts
}

const KEYWORDS = new Set([
  'export', 'import', 'from', 'const', 'let', 'var', 'function', 'return', 'async', 'await',
  'class', 'extends', 'new', 'if', 'else', 'for', 'while', 'switch', 'case', 'break',
  'continue', 'try', 'catch', 'finally', 'throw', 'typeof', 'in', 'of', 'void', 'as',
  'type', 'interface', 'true', 'false', 'null', 'undefined',
  'package', 'public', 'private', 'protected', 'static', 'final', 'abstract',
  'implements', 'enum', 'synchronized', 'volatile', 'transient', 'native',
  'throws', 'this', 'super', 'instanceof', 'assert', 'default',
  'boolean', 'byte', 'char', 'short', 'int', 'long', 'float', 'double',
])

export type HighlightKind = 'kw' | 'str' | 'cmt' | 'fn'

export interface HighlightSpan {
  kind?: HighlightKind
  text: string
}

export type ScanMode = 'code' | 'block' | 'template'

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function spansToHtml(spans: readonly HighlightSpan[]): string {
  return spans.map((span) => {
    const safe = escapeHtml(span.text)
    return span.kind === undefined ? safe : `<span data-tok="${span.kind}">${safe}</span>`
  }).join('')
}

/** One HTML string for a snapshot pane — cheaper than a React node per token. */
export function highlightToHtml(text: string): string {
  if (text.length > 200_000) return escapeHtml(text)
  let mode: ScanMode = 'code'
  return text.split('\n').map((line) => {
    const next = highlightLineHtml(line, mode)
    mode = next.mode
    return next.html
  }).join('\n')
}

/** Highlight a single painted row, carrying javadoc / template state. */
export function highlightLineHtml(text: string, start: ScanMode = 'code'): { html: string; mode: ScanMode } {
  const { spans, mode } = highlightLineState(text, start)
  return { html: spansToHtml(spans), mode }
}

/**
 * Highlight painted review rows. After-file lines (ctx/add) keep javadoc
 * state; interleaved deletions highlight on their own so they cannot
 * break the current-file comment mode.
 */
export function highlightRowsHtml(rows: readonly { kind?: string; text: string }[]): string[] {
  let mode: ScanMode = 'code'
  return rows.map((row) => {
    if (row.kind === 'del') return highlightLineHtml(row.text).html
    const next = highlightLineHtml(row.text, mode)
    mode = next.mode
    return next.html
  })
}

/** Cheap JS/TS highlighter for the review file pane (not a full parser). */
export function highlightLine(text: string): HighlightSpan[] {
  return highlightLineState(text, 'code').spans
}

function highlightLineState(text: string, start: ScanMode): { spans: HighlightSpan[]; mode: ScanMode } {
  const out: HighlightSpan[] = []
  const push = (kind: HighlightKind | undefined, chunk: string): void => {
    if (chunk === '') return
    const last = out[out.length - 1]
    if (last !== undefined && last.kind === kind) last.text += chunk
    else out.push({ kind, text: chunk })
  }
  let mode = start
  let i = 0
  while (i < text.length) {
    const rest = text.slice(i)
    if (mode === 'block') {
      const end = rest.indexOf('*/')
      if (end === -1) {
        push('cmt', rest)
        return { spans: out, mode: 'block' }
      }
      push('cmt', rest.slice(0, end + 2))
      i += end + 2
      mode = 'code'
      continue
    }
    if (mode === 'template') {
      const close = rest.match(/^(?:\\.|[^`$])+/)
      if (close !== null) {
        push('str', close[0])
        i += close[0].length
        continue
      }
      if (rest.startsWith('`')) {
        push('str', '`')
        i += 1
        mode = 'code'
        continue
      }
      push('str', rest[0] ?? '')
      i += 1
      continue
    }
    if (rest.startsWith('//')) {
      push('cmt', rest)
      break
    }
    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/')
      if (end === -1) {
        push('cmt', rest)
        return { spans: out, mode: 'block' }
      }
      push('cmt', rest.slice(0, end + 2))
      i += end + 2
      continue
    }
    if (rest.startsWith('`')) {
      const closed = rest.match(/^`(?:\\.|[^`$])*`/)
      if (closed !== null) {
        push('str', closed[0])
        i += closed[0].length
        continue
      }
      push('str', rest)
      return { spans: out, mode: 'template' }
    }
    const str = rest.match(/^('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/)
    if (str !== null) {
      push('str', str[0])
      i += str[0].length
      continue
    }
    const regex = rest.match(/^\/(?:\\.|[^/\n])+\/[gimsuy]*/)
    if (regex !== null && (i === 0 || /[\s([=,!:&|?{~;]/.test(text[i - 1] ?? ''))) {
      push('str', regex[0])
      i += regex[0].length
      continue
    }
    const ident = rest.match(/^[A-Za-z_$][\w$]*/)
    if (ident !== null) {
      const word = ident[0]
      const after = text.slice(i + word.length)
      if (KEYWORDS.has(word)) push('kw', word)
      else if (/^\s*\(/.test(after)) push('fn', word)
      else push(undefined, word)
      i += word.length
      continue
    }
    push(undefined, text[i] ?? '')
    i += 1
  }
  return { spans: out, mode }
}
