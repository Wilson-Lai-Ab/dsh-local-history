import { describe, expect, it } from 'vitest'
import { latestPendingPerPath, pendingCount } from '../src/pending-latest.ts'
import type { HistoryRecord } from '../src/types.ts'

function rec(over: Partial<HistoryRecord>): HistoryRecord {
  return {
    id: 'id',
    path: '/proj/a.ts',
    hash: 'h',
    beforeHash: null,
    bytes: 1,
    mtime: 1,
    source: 'agent',
    kind: 'edit',
    sessionId: 's',
    decision: 'pending',
    ...over,
  }
}

describe('latestPendingPerPath', () => {
  it('keeps only the later turn when the same file is pending twice', () => {
    const first = rec({ id: 't1', turn: 1, mtime: 10 })
    const second = rec({ id: 't2', turn: 2, mtime: 20 })
    expect(latestPendingPerPath([first, second]).map((row) => row.id)).toEqual(['t2'])
    expect(pendingCount([first, second])).toBe(1)
  })

  it('does not drop a different file', () => {
    const a = rec({ id: 'a', path: '/proj/a.ts', turn: 1 })
    const b = rec({ id: 'b', path: '/proj/b.ts', turn: 1 })
    expect(latestPendingPerPath([a, b])).toHaveLength(2)
  })
})
