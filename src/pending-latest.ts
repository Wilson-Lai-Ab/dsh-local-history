import { sameCardPath } from './agent/cards.ts'
import type { HistoryRecord } from './types.ts'

function newerPending(a: HistoryRecord, b: HistoryRecord): boolean {
  const aTurn = a.turn ?? -1
  const bTurn = b.turn ?? -1
  if (aTurn !== bTurn) return aTurn > bTurn
  if (a.mtime !== b.mtime) return a.mtime > b.mtime
  return a.id > b.id
}

/** One pending agent row per path — later turns supersede earlier ones. */
export function latestPendingPerPath(records: readonly HistoryRecord[]): HistoryRecord[] {
  const byPath = new Map<string, HistoryRecord>()
  const order: string[] = []
  for (const record of records) {
    if (record.source !== 'agent') continue
    if ((record.decision ?? 'pending') !== 'pending') continue
    const existing = [...byPath.values()].find((row) => sameCardPath(row.path, record.path))
    if (existing === undefined) {
      byPath.set(record.id, record)
      order.push(record.id)
      continue
    }
    if (!newerPending(record, existing)) continue
    byPath.delete(existing.id)
    byPath.set(record.id, record)
    const index = order.indexOf(existing.id)
    if (index !== -1) order[index] = record.id
  }
  return order.map((id) => byPath.get(id)!).filter((row): row is HistoryRecord => row !== undefined)
}

export function pendingCount(records: readonly HistoryRecord[]): number {
  return latestPendingPerPath(records).length
}
