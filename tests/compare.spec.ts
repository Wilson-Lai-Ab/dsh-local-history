import { describe, expect, it } from 'vitest'
import { compareSeedFromTimeline, compareSeedOf } from '../src/client/compare.ts'
import type { HistoryRecord } from '../src/types.ts'

const rec = (over: Partial<HistoryRecord>): HistoryRecord => ({
  id: 'id',
  path: '/proj/A.java',
  hash: 'h',
  beforeHash: 'b',
  bytes: 1,
  mtime: 1,
  source: 'agent',
  kind: 'edit',
  sessionId: 's',
  ...over,
})

describe('compareSeedFromTimeline', () => {
  it('compares a later snapshot against the previous timeline hash', () => {
    const first = rec({ id: 'a', hash: 'h1', mtime: 1 })
    const second = rec({ id: 'b', hash: 'h2', beforeHash: 'h1', mtime: 2 })
    expect(compareSeedFromTimeline([second, first], second)).toEqual(expect.objectContaining({
      leftHash: 'h1',
      rightHash: 'h2',
    }))
  })

  it('skips a previous snapshot with the same hash', () => {
    const first = rec({ id: 'a', hash: 'h1', mtime: 1 })
    const twin = rec({ id: 'b', hash: 'h2', mtime: 2 })
    const later = rec({ id: 'c', hash: 'h2', beforeHash: 'h2', mtime: 3 })
    expect(compareSeedFromTimeline([later, twin, first], later)).toEqual(expect.objectContaining({
      leftHash: 'h1',
      rightHash: 'h2',
    }))
  })
})

describe('compareSeedOf', () => {
  it('uses the record beforeHash as the left pane', () => {
    expect(compareSeedOf(rec({ hash: 'now', beforeHash: 'prev' })).leftHash).toBe('prev')
  })
})
