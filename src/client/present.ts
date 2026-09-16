/**
 * Review-list presentation: IDE-style path rows and turn prompt previews.
 */
import { sessionEventOf } from '../agent/cards.ts'

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
    const record = block as { type?: unknown; kind?: unknown; text?: unknown }
    if (typeof record.text === 'string' && (record.type === 'text' || record.kind === 'text')) {
      texts.push(record.text)
    }
  }
  return texts.join('\n')
}

/**
 * Prompt text of a real user message. Injected content carries its own
 * `source.kind` (`plugin`, `skill-catalog`, `agent-instructions`, …) and must
 * never be counted as something the user typed.
 */
function userPromptText(data: unknown): string {
  if (data === null || typeof data !== 'object') return ''
  const record = data as { content?: unknown; source?: { kind?: unknown } }
  if (record.source?.kind !== 'user') return ''
  return textFromBlocks(record.content).trim()
}

function turnOf(data: unknown): number | undefined {
  if (data === null || typeof data !== 'object') return undefined
  const turn = (data as { turn?: unknown }).turn
  return typeof turn === 'number' ? turn : undefined
}

/** One user input: the message that opened it, plus its ordinal when known. */
export interface TurnRound {
  /**
   * 1-based user-input ordinal. Absent when the loaded event window does not
   * reach the session start, so the ordinal cannot be counted honestly.
   */
  round?: number
  prompt: string
}

/**
 * Engine turn → the user input that opened it.
 *
 * A round is one engine turn containing at least one real user message, so a
 * turn with no user input (an automatic continuation) is deliberately absent
 * from the map and is folded into the previous round by {@link roundAt}.
 * `user/message` events carry no turn number, so the turn is tracked from the
 * `turn/start` and tool events around them.
 *
 * @param options.numbered - false when the window starts mid-session: prompts
 *   are still bound to their turns, but no ordinal is invented.
 */
export function collectTurnRounds(
  nodes: readonly unknown[],
  options: { numbered?: boolean } = {},
): Map<number | 'x', TurnRound> {
  const numbered = options.numbered !== false
  const rounds = new Map<number | 'x', TurnRound>()
  let current: number | undefined
  let pending = ''
  let count = 0
  const open = (turn: number | undefined, prompt: string): void => {
    count += 1
    rounds.set(turn ?? 'x', numbered ? { round: count, prompt } : { prompt })
  }
  for (const node of nodes) {
    const event = sessionEventOf(node)
    if (event === undefined) continue
    const data = event.data
    if (event.type === 'user/message') {
      const text = userPromptText(data)
      if (text === '') continue
      if (current === undefined) {
        if (pending === '') pending = text
        continue
      }
      // The first message of a turn names its round; later ones are follow-ups.
      if (!rounds.has(current)) open(current, text)
      continue
    }
    const turn = turnOf(data)
    if (turn === undefined) continue
    current = turn
    if (pending !== '' && !rounds.has(turn)) {
      open(turn, pending)
      pending = ''
    }
  }
  return rounds
}

/** The user input a turn belongs to; a turn without one joins the round before it. */
export function roundAt(
  rounds: ReadonlyMap<number | 'x', TurnRound>,
  turn: number | undefined,
): TurnRound | undefined {
  if (turn === undefined) return rounds.get('x')
  for (let candidate = turn; candidate >= 1; candidate -= 1) {
    const found = rounds.get(candidate)
    if (found !== undefined) return found
  }
  return undefined
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
