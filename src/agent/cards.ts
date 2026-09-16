/**
  * Browser-safe session-card parsing. No node:fs — host tagger and client
  * both import this to collect agent hits from conversation nodes.
  */

import type { FileDiffHunk } from '../history/hunks.ts'

export type AgentEditKind = 'add' | 'edit' | 'delete'
export type { FileDiffHunk }

export interface AgentCardHit {
  path: string
  kind: AgentEditKind
  oldText?: string | null
  turn?: number
  /** Tool-card hunks for this path (3-line context, not a full file). */
  diffs?: FileDiffHunk[]
}

export function sameCardPath(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
}

/** Resolve a (possibly relative) path against the session cwd. */
export function resolveProjectPath(cwd: string | undefined, path: string): string {
  const absolute = path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
  if (absolute) return path
  const base = cwd ?? ''
  if (base === '') return path
  const separator = base.includes('\\') ? '\\' : '/'
  return `${base.replace(/[\\/]+$/, '')}${separator}${path}`
}

function addedPaths(view: unknown): Set<string> {
  const added = new Set<string>()
  if (view === null || typeof view !== 'object') return added
  const diffs = (view as { diffs?: unknown }).diffs
  if (!Array.isArray(diffs)) return added
  for (const diff of diffs) {
    if (diff === null || typeof diff !== 'object') continue
    const record = diff as { path?: unknown; oldText?: unknown }
    if (typeof record.path === 'string' && record.oldText === null) added.add(record.path)
  }
  return added
}

/** Paths a tool-result view reports as an agent mutation. */
export function reviewLocations(view: unknown): { path: string; kind: AgentEditKind }[] {
  if (view === null || typeof view !== 'object') return []
  const record = view as { card?: unknown; kind?: unknown; locations?: unknown; diffs?: unknown }
  const deleted = record.card === 'generic' && record.kind === 'delete'
  const edited = record.card === 'diff'
    || (record.card === 'generic' && (record.kind === 'edit' || record.kind === 'write' || record.kind === 'create'))
  if (!deleted && !edited) return []
  const created = addedPaths(view)
  const out: { path: string; kind: AgentEditKind }[] = []
  const push = (path: string, kind: AgentEditKind): void => {
    out.push({ path, kind })
  }
  if (Array.isArray(record.locations)) {
    for (const location of record.locations) {
      if (location !== null && typeof location === 'object' && typeof (location as { path?: unknown }).path === 'string') {
        const path = (location as { path: string }).path
        const added = [...created].some((item) => sameCardPath(item, path))
        push(path, deleted ? 'delete' : added ? 'add' : 'edit')
      }
    }
  }
  if (out.length === 0 && Array.isArray(record.diffs)) {
    for (const diff of record.diffs) {
      if (diff !== null && typeof diff === 'object' && typeof (diff as { path?: unknown }).path === 'string') {
        const path = (diff as { path: string }).path
        const added = [...created].some((item) => sameCardPath(item, path))
        push(path, added ? 'add' : 'edit')
      }
    }
  }
  return out
}

function reviewViewsOf(node: unknown): unknown[] {
  if (node === null || typeof node !== 'object') return []
  const record = node as { callView?: unknown; resultView?: unknown }
  return [record.callView, record.resultView].filter((view) => view !== null && view !== undefined)
}

function parseToolArgs(raw: unknown): Record<string, unknown> | undefined {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw !== 'string' || raw === '') return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
  return undefined
}

/**
  * Unwrap one event-window entry (`{type:'event', event}`) or accept a raw
  * session event. Shared by the card collector and the client's turn/round
  * reader so both understand exactly one entry shape.
  */
export function sessionEventOf(node: unknown): { type?: unknown; data?: unknown } | undefined {
  if (node === null || typeof node !== 'object') return undefined
  const wrapper = node as { type?: unknown; event?: unknown }
  if (wrapper.type === 'event' && wrapper.event !== null && typeof wrapper.event === 'object') {
    return wrapper.event as { type?: unknown; data?: unknown }
  }
  if (typeof wrapper.type === 'string' && 'data' in wrapper) return node as { type?: unknown; data?: unknown }
  return undefined
}

function resultIsError(data: unknown): boolean {
  if (data === null || typeof data !== 'object') return false
  const content = (data as { message?: { content?: unknown } }).message?.content
  if (!Array.isArray(content) || content[0] === null || typeof content[0] !== 'object') return false
  return (content[0] as { isError?: unknown }).isError === true
}

function resultCallId(data: unknown): string | undefined {
  if (data === null || typeof data !== 'object') return undefined
  const id = (data as { message?: { source?: { callId?: unknown } } }).message?.source?.callId
  return typeof id === 'string' && id !== '' ? id : undefined
}

/** Hits from current DSH fs tools (`edit` / `write`) on a settled tool-result. */
export function hitFromMutationTool(
  name: unknown,
  argsRaw: unknown,
  cwd: string | undefined,
  turn: number | undefined,
): AgentCardHit | undefined {
  if (name !== 'edit' && name !== 'write') return undefined
  const args = parseToolArgs(argsRaw)
  if (args === undefined) return undefined
  const filePath = args.file_path
  if (typeof filePath !== 'string' || filePath === '') return undefined
  const path = resolveProjectPath(cwd, filePath)
  // `write` replaces the whole file: whether it is a creation is decided from
  // the previous snapshot by the caller, so this hit deliberately carries no
  // `oldText` (undefined ≠ null: null would force "whole file is new").
  if (name === 'write') return { path, kind: 'add', turn }
  const oldString = args.old_string
  const newString = args.new_string
  if (typeof oldString !== 'string' || typeof newString !== 'string') return undefined
  return {
    path,
    kind: 'edit',
    oldText: oldString,
    turn,
    diffs: [{ oldText: oldString, newText: newString }],
  }
}

/** Hunk snippets for this path (`newText` required so they can be undone). */
export function diffsOf(view: unknown, path: string): FileDiffHunk[] {
  if (view === null || typeof view !== 'object') return []
  const diffs = (view as { diffs?: unknown }).diffs
  if (!Array.isArray(diffs)) return []
  const out: FileDiffHunk[] = []
  for (const diff of diffs) {
    if (diff === null || typeof diff !== 'object') continue
    const record = diff as { path?: unknown; oldText?: unknown; newText?: unknown }
    if (typeof record.path !== 'string' || !sameCardPath(record.path, path)) continue
    if (typeof record.newText !== 'string') continue
    const hunk: FileDiffHunk = { newText: record.newText }
    if (record.oldText === null) hunk.oldText = null
    else if (typeof record.oldText === 'string') hunk.oldText = record.oldText
    out.push(hunk)
  }
  return out
}

/** Last tool card's old-file snapshot for this path (`null` = created). */
export function oldTextOf(view: unknown, path: string): string | null | undefined {
  if (view === null || typeof view !== 'object') return undefined
  const diffs = (view as { diffs?: unknown }).diffs
  if (!Array.isArray(diffs)) return undefined
  for (const diff of diffs) {
    if (diff === null || typeof diff !== 'object') continue
    const record = diff as { path?: unknown; oldText?: unknown }
    if (typeof record.path !== 'string' || !sameCardPath(record.path, path)) continue
    if (record.oldText === null) return null
    if (typeof record.oldText === 'string') return record.oldText
  }
  return undefined
}

/**
  * Flatten conversation nodes into one hit per (turn, path). Paths are
  * resolved against cwd when provided.
  */
function upsertHit(byKey: Map<string, AgentCardHit>, order: string[], hit: AgentCardHit): void {
  const key = `${hit.turn ?? 'x'}\n${hit.path}`
  const existing = byKey.get(key)
  if (existing === undefined) {
    order.push(key)
    byKey.set(key, hit)
    return
  }
  existing.kind = hit.kind
  if (existing.oldText === undefined && hit.oldText !== undefined) existing.oldText = hit.oldText
  if (existing.oldText === null) existing.kind = 'add'
  if (hit.diffs !== undefined && hit.diffs.length > 0) existing.diffs = hit.diffs
}

export function collectSessionEdits(nodes: readonly unknown[], cwd?: string): AgentCardHit[] {
  const byKey = new Map<string, AgentCardHit>()
  const order: string[] = []
  const pendingCalls = new Map<string, { name: unknown; argsRaw: unknown; turn: number | undefined }>()
  let turn: number | undefined
  for (const node of nodes) {
    if (node === null || typeof node !== 'object') continue
    const event = sessionEventOf(node)
    if (event !== undefined) {
      const data = event.data
      if (event.type === 'tool/call' && data !== null && typeof data === 'object') {
        const record = data as { turn?: unknown; callId?: unknown; name?: unknown; arguments?: unknown }
        if (typeof record.turn === 'number') turn = record.turn
        if (typeof record.callId === 'string' && record.callId !== '') {
          pendingCalls.set(record.callId, { name: record.name, argsRaw: record.arguments, turn })
        }
        continue
      }
      if (event.type === 'tool/result' && data !== null && typeof data === 'object') {
        const record = data as { turn?: unknown }
        if (typeof record.turn === 'number') turn = record.turn
        const callId = resultCallId(data)
        const pending = callId === undefined ? undefined : pendingCalls.get(callId)
        if (pending !== undefined && !resultIsError(data)) {
          const hit = hitFromMutationTool(pending.name, pending.argsRaw, cwd, pending.turn ?? turn)
          if (hit !== undefined) upsertHit(byKey, order, hit)
        }
        continue
      }
    }
    const record = node as { kind?: unknown; isError?: unknown; turn?: unknown; call?: { name?: unknown; argsRaw?: unknown } }
    if (record.kind === 'user' || record.kind === 'steering') continue
    if (typeof record.turn === 'number') turn = record.turn
    if (record.kind !== 'tool-result' || record.isError === true) continue
    let foundView = false
    for (const view of reviewViewsOf(node)) {
      for (const location of reviewLocations(view)) {
        foundView = true
        const path = resolveProjectPath(cwd, location.path)
        const oldText = oldTextOf(view, location.path)
        const hunks = diffsOf(view, location.path)
        const hit: AgentCardHit = { path, kind: location.kind, turn, oldText }
        if (hunks.length > 0) hit.diffs = hunks
        upsertHit(byKey, order, hit)
      }
    }
    if (foundView) continue
    const hit = hitFromMutationTool(record.call?.name, record.call?.argsRaw, cwd, turn)
    if (hit !== undefined) upsertHit(byKey, order, hit)
  }
  return order.map((key) => byKey.get(key)!).filter((row): row is AgentCardHit => row !== undefined)
}
