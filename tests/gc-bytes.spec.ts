/**
 * Byte-cap accounting. A session store filled up with runtime logs (61MB each)
 * exceeded maxBytes permanently, because gc could only shed RESOLVED agent
 * records — so every sync deleted those records and the next sync rebuilt them.
 * gc must reclaim from `save` records first and never touch pending reviews.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HistoryStore } from '../src/history/store.ts'
import type { HistoryIndex, HistoryRecord } from '../src/types.ts'

let root = ''
afterEach(async () => {
  if (root !== '') await rm(root, { recursive: true, force: true })
  root = ''
})

function record(over: Partial<HistoryRecord> & { id: string }): HistoryRecord {
  return {
    path: `/proj/${over.id}.ts`,
    hash: `hash-${over.id}`,
    beforeHash: null,
    bytes: 100,
    mtime: 1,
    source: 'save',
    kind: 'edit',
    sessionId: 's',
    ...over,
  }
}

describe('HistoryStore.gc byte cap', () => {
  it('sheds the biggest save records rather than deleting pending reviews', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-gc-'))
    const store = new HistoryStore(root)
    const bigLog = record({ id: 'big-log', bytes: 60_000_000 })
    const pending = record({ id: 'pending', source: 'agent', decision: 'pending', bytes: 1_000 })
    const index: HistoryIndex = { version: 1, records: [bigLog, pending] }

    const next = store.gc(index, { maxPerFile: 50, maxBytes: 1_000_000, retentionDays: 30 }, 1_000)

    expect(next.records.map((item) => item.id)).toContain('pending')
    expect(next.records.map((item) => item.id)).not.toContain('big-log')
  })

  it('never drops a pending review even when the store stays over the cap', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-gc-'))
    const store = new HistoryStore(root)
    const index: HistoryIndex = {
      version: 1,
      records: [
        record({ id: 'p1', source: 'agent', decision: 'pending', bytes: 5_000_000 }),
        record({ id: 'p2', source: 'agent', decision: 'pending', bytes: 5_000_000 }),
      ],
    }

    const next = store.gc(index, { maxPerFile: 50, maxBytes: 1_000_000, retentionDays: 30 }, 1_000)

    expect(next.records.map((item) => item.id).sort()).toEqual(['p1', 'p2'])
  })

  it('still retires save records past the retention window', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-gc-'))
    const store = new HistoryStore(root)
    const day = 24 * 60 * 60 * 1000
    const index: HistoryIndex = {
      version: 1,
      records: [record({ id: 'old', mtime: 1 }), record({ id: 'fresh', mtime: 40 * day })],
    }

    const next = store.gc(index, { maxPerFile: 50, maxBytes: 1_000_000_000, retentionDays: 30 }, 40 * day + 1)

    expect(next.records.map((item) => item.id)).toEqual(['fresh'])
  })
})
