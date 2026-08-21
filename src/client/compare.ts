import type { HistoryRecord } from '../types.ts'

export const COMPARE_TAB = 'dsh-local-history:compare'
export const REVIEW_TAB = 'dsh-local-history:change'

export function reviewTabId(record: HistoryRecord): string {
  return `${REVIEW_TAB}:${record.id}`
}

export function isHistoryRecord(value: unknown): value is HistoryRecord {
  if (value === null || typeof value !== 'object') return false
  const record = value as Partial<HistoryRecord>
  return typeof record.id === 'string' && typeof record.path === 'string' && typeof record.sessionId === 'string'
}

export interface CompareSeed {
  path: string
  sessionId: string
  cwd?: string
  leftHash: string | null
  rightHash: string | null
  leftSessionId?: string
  rightSessionId?: string
}

export function compareTabId(seed: CompareSeed): string {
  return `${COMPARE_TAB}:${seed.path}:${seed.leftHash ?? 'x'}:${seed.rightHash ?? 'x'}`
}

export function fileNameOf(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return slash === -1 ? path : path.slice(slash + 1)
}

export function shortHash(hash: string | null): string {
  if (hash === null || hash === '') return '∅'
  return hash.slice(0, 8)
}

/** This snapshot on the right, its predecessor on the left. */
export function compareSeedOf(record: HistoryRecord, cwd?: string): CompareSeed {
  return {
    path: record.path,
    sessionId: record.sessionId,
    cwd,
    leftHash: record.beforeHash,
    rightHash: record.hash,
  }
}

function sameHash(a: string | null | undefined, b: string | null | undefined): boolean {
  return a !== undefined && a !== null && a !== '' && a === b
}

/** Timeline row vs the nearest older snapshot with a different hash. */
export function compareSeedFromTimeline(
  records: readonly HistoryRecord[],
  selected: HistoryRecord,
  cwd?: string,
): CompareSeed {
  const ordered = records.slice().sort((a, b) => a.mtime - b.mtime || a.id.localeCompare(b.id))
  const index = ordered.findIndex((row) => row.id === selected.id)
  let previous: HistoryRecord | undefined
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = ordered[i]
    if (candidate !== undefined && !sameHash(candidate.hash, selected.hash)) {
      previous = candidate
      break
    }
  }
  const leftHash = previous?.hash ?? (sameHash(selected.beforeHash, selected.hash) ? null : selected.beforeHash)
  return {
    path: selected.path,
    sessionId: selected.sessionId,
    cwd,
    leftHash,
    rightHash: selected.hash,
    leftSessionId: previous?.sessionId,
    rightSessionId: selected.sessionId,
  }
}

export function isCompareSeed(value: unknown): value is CompareSeed {
  if (value === null || typeof value !== 'object') return false
  const seed = value as Partial<CompareSeed>
  return typeof seed.path === 'string' && typeof seed.sessionId === 'string'
}
