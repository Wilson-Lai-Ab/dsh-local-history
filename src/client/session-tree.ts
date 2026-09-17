/**
 * Minimal session-tree walk over the sessions list snapshot.
 * Reimplements sidebar treeSessionIds without importing better-sidebar.
 */
import { collectSessionEdits, type AgentCardHit } from '../agent/cards.ts'
import { collectTurnRounds, type TurnRound } from './present.ts'

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
  /**
   * The live session event window. This is the ONLY conversation source: the
   * Session snapshot itself (`SessionSnapshot`) has no node list at all, so a
   * `nodes` probe would always read empty.
   *
   * The window opens with only ~50 messages (`events.open({ maxMessages: 50 })`),
   * so a long session is paged: `hasMore` is normally true.
   */
  eventSource?: {
    getSnapshot?: () => { entries?: readonly unknown[]; hasMore?: boolean }
  }
  /** Opens ONE older page of the window (the Session face's own API). */
  session?: {
    loadOlder?: () => Promise<void>
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
    const entries = sessions?.binding?.(id)?.eventSource?.getSnapshot?.()?.entries ?? []
    const childCwd = byId[id]?.cwd ?? cwd
    hits.push(...collectSessionEdits(entries, childCwd))
  }
  return hits
}

/** Engine turn → user input for the current session tree (root + subagents). */
export function collectTreeRounds(
  sessions: SessionsFace | undefined,
  sessionId: string,
): Map<number | 'x', TurnRound> {
  const snapshot = sessions?.list?.getSnapshot?.() ?? {}
  const byId = snapshot.byId ?? {}
  const ids = treeSessionIds(byId, sessionId)
  const rounds = new Map<number | 'x', TurnRound>()
  for (const id of ids) {
    const window = sessions?.binding?.(id)?.eventSource?.getSnapshot?.()
    const entries = window?.entries ?? []
    // An event window that still has older pages cannot be counted from 1
    // honestly, so only the prompts travel — never a made-up ordinal.
    const numbered = window?.hasMore !== true
    for (const [turn, value] of collectTurnRounds(entries, { numbered })) {
      if (!rounds.has(turn)) rounds.set(turn, value)
    }
  }
  return rounds
}

/** True when any session in the tree still holds older events off-window. */
export function treeWindowHasMore(sessions: SessionsFace | undefined, sessionId: string): boolean {
  const byId = sessions?.list?.getSnapshot?.()?.byId ?? {}
  return treeSessionIds(byId, sessionId).some(
    (id) => sessions?.binding?.(id)?.eventSource?.getSnapshot?.()?.hasMore === true,
  )
}

/**
 * Page the window back so an older change can be matched to the user input that
 * caused it.
 *
 * Changes made before the loaded window have no user message in view, which
 * would render them as an engine turn with 「(无用户消息)」. Loading older pages
 * is how the session itself exposes that history.
 *
 * @param maxPages - pages this caller is still willing to pull, so a huge
 *   session is never loaded wholesale by the review pane.
 * @returns how many pages were actually loaded.
 */
export async function loadOlderPages(
  sessions: SessionsFace | undefined,
  sessionId: string,
  maxPages: number,
): Promise<number> {
  let loaded = 0
  while (loaded < maxPages) {
    const byId = sessions?.list?.getSnapshot?.()?.byId ?? {}
    const pending = treeSessionIds(byId, sessionId)
      .map((id) => sessions?.binding?.(id))
      .filter((binding) => binding?.eventSource?.getSnapshot?.()?.hasMore === true)
      .map((binding) => binding?.session?.loadOlder)
      .filter((load): load is () => Promise<void> => typeof load === 'function')
    if (pending.length === 0) break
    await Promise.all(pending.map((load) => load().catch(() => undefined)))
    loaded += 1
  }
  return loaded
}
