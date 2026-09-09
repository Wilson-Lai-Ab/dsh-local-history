/**
 * Minimal session-tree walk over the sessions list snapshot.
 * Reimplements sidebar treeSessionIds without importing better-sidebar.
 */
import { collectSessionEdits, type AgentCardHit } from '../agent/cards.ts'
import { collectTurnPrompts } from './present.ts'

export interface SessionSummary {
  id: string
  cwd?: string
  parentId?: string
  origin?: string
}

export interface SessionListSnapshot {
  current?: string
  byId?: Record<string, SessionSummary | undefined>
}

export interface SessionBinding {
  session?: {
    getSnapshot?: () => { nodes?: readonly unknown[] }
  }
  eventSource?: {
    getSnapshot?: () => { entries?: readonly unknown[] }
  }
}

export interface SessionsFace {
  list?: {
    getSnapshot?: () => SessionListSnapshot
    subscribe?: (listener: () => void) => () => void
  }
  binding?: (id: string) => SessionBinding | undefined
}

/** Session ids in the tree rooted at rootId (root + subagent descendants). */
export function treeSessionIds(
  byId: Record<string, SessionSummary | undefined>,
  rootId: string | undefined,
): string[] {
  if (rootId === undefined || rootId === '') return []
  const ids = new Set<string>()
  for (const summary of Object.values(byId)) {
    if (summary === undefined) continue
    const seen = new Set<string>()
    let current: SessionSummary | undefined = summary
    let reachesRoot = false
    while (current !== undefined && !seen.has(current.id)) {
      seen.add(current.id)
      if (current.id === rootId) {
        reachesRoot = true
        break
      }
      if (current.origin !== 'subagent' || current.parentId === undefined) break
      current = byId[current.parentId]
    }
    if (reachesRoot) ids.add(summary.id)
  }
  if (!ids.has(rootId)) ids.add(rootId)
  return [...ids]
}

/** Collect agent card hits for the current session plus its subagent tree. */
export function collectTreeHits(
  sessions: SessionsFace | undefined,
  sessionId: string,
  cwd: string | undefined,
): AgentCardHit[] {
  const snapshot = sessions?.list?.getSnapshot?.() ?? {}
  const byId = snapshot.byId ?? {}
  const ids = treeSessionIds(byId, sessionId)
  const hits: AgentCardHit[] = []
  for (const id of ids) {
    const binding = sessions?.binding?.(id)
    const nodes = binding?.session?.getSnapshot?.()?.nodes ?? []
    const entries = binding?.eventSource?.getSnapshot?.()?.entries ?? []
    const childCwd = byId[id]?.cwd ?? cwd
    hits.push(...collectSessionEdits([...nodes, ...entries], childCwd))
  }
  return hits
}

/** User prompts keyed by conversation turn for the current session tree. */
export function collectTreePrompts(
  sessions: SessionsFace | undefined,
  sessionId: string,
): Map<number | 'x', string> {
  const snapshot = sessions?.list?.getSnapshot?.() ?? {}
  const byId = snapshot.byId ?? {}
  const ids = treeSessionIds(byId, sessionId)
  const prompts = new Map<number | 'x', string>()
  for (const id of ids) {
    const binding = sessions?.binding?.(id)
    const nodes = binding?.session?.getSnapshot?.()?.nodes ?? []
    const entries = binding?.eventSource?.getSnapshot?.()?.entries ?? []
    for (const [turn, prompt] of collectTurnPrompts([...nodes, ...entries])) {
      if (!prompts.has(turn)) prompts.set(turn, prompt)
    }
  }
  return prompts
}
