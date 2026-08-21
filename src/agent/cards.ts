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
export function collectSessionEdits(nodes: readonly unknown[], cwd?: string): AgentCardHit[] {
  const byKey = new Map<string, AgentCardHit>()
  const order: string[] = []
  let turn: number | undefined
  for (const node of nodes) {
    if (node === null || typeof node !== 'object') continue
    const record = node as { kind?: unknown; isError?: unknown; turn?: unknown }
    if (record.kind === 'user' || record.kind === 'steering') continue
    if (typeof record.turn === 'number') turn = record.turn
    if (record.kind !== 'tool-result' || record.isError === true) continue
    for (const view of reviewViewsOf(node)) {
      for (const location of reviewLocations(view)) {
        const path = resolveProjectPath(cwd, location.path)
        const oldText = oldTextOf(view, location.path)
        const hunks = diffsOf(view, location.path)
        const key = `${turn ?? 'x'}\n${path}`
        const existing = byKey.get(key)
        if (existing === undefined) {
          order.push(key)
          const hit: AgentCardHit = { path, kind: location.kind, turn, oldText }
          if (hunks.length > 0) hit.diffs = hunks
          byKey.set(key, hit)
        } else {
          existing.kind = location.kind
          if (existing.oldText === undefined && oldText !== undefined) existing.oldText = oldText
          if (existing.oldText === null) existing.kind = 'add'
          if (hunks.length > 0) existing.diffs = hunks
        }
      }
    }
  }
  return order.map((key) => byKey.get(key)!).filter((row): row is AgentCardHit => row !== undefined)
}
