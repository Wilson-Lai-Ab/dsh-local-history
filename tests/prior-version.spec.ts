/**
 * "Which version is this change compared against?"
 *
 * The newest record for a path is often the watcher's own save of the very bytes
 * the agent just wrote. Comparing against it made the panel highlight NOTHING
 * (beforeHash === hash), which is indistinguishable from "no change" — the
 * reported defect. The comparison target must be the newest version whose
 * content actually differs.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { claimAgentCards } from '../src/agent/tag.ts'
import { backfillAgentBefore } from '../src/history/backfill.ts'
import { HistoryStore } from '../src/history/store.ts'
import type { HistoryRecord } from '../src/types.ts'

const limits = { maxPerFile: 50, maxBytes: 1_000_000_000, retentionDays: 30 }
const PATH_ = '/proj/a.ts'
let root = ''

afterEach(async () => {
  if (root !== '') await rm(root, { recursive: true, force: true })
  root = ''
})

function rec(over: Partial<HistoryRecord> & { id: string }): HistoryRecord {
  return {
    path: PATH_,
    hash: null,
    beforeHash: null,
    bytes: 0,
    mtime: 1,
    source: 'save',
    kind: 'edit',
    sessionId: 's',
    ...over,
  }
}

/** Store holding: an older version, then the watcher's save of the NEW bytes. */
async function seedSameContentOnTop(): Promise<{
  store: HistoryStore
  olderHash: string
  afterHash: string
  afterContent: string
}> {
  root = await mkdtemp(join(tmpdir(), 'lh-prior-'))
  const store = new HistoryStore(root)
  const olderContent = 'line1\nline2\n'
  const afterContent = 'line1\nCHANGED\n'
  const older = await store.putBlob(olderContent)
  const after = await store.putBlob(afterContent)
  await store.append(rec({
    id: 'older', hash: older.hash, bytes: older.bytes, mtime: 1, source: 'agent', kind: 'add', turn: 1,
  }), limits, 1)
  await store.append(rec({
    id: 'save-of-new', hash: after.hash, beforeHash: older.hash, bytes: after.bytes, mtime: 2,
  }), limits, 2)
  return { store, olderHash: older.hash, afterHash: after.hash, afterContent }
}

describe('claiming a change whose newest record holds the same bytes', () => {
  it('compares against the newest version that actually differs', async () => {
    const { store, olderHash, afterContent } = await seedSameContentOnTop()
    const claimed = await claimAgentCards({
      store,
      sessionId: 's',
      limits,
      hits: [{ path: PATH_, kind: 'add', turn: 9 }],
      readCurrent: async () => ({ content: afterContent, binary: false }),
    })
    expect(claimed[0]?.kind).toBe('edit')
    expect(claimed[0]?.beforeHash).toBe(olderHash)
    expect(claimed[0]?.beforeHash).not.toBe(claimed[0]?.hash)
  })

  it('treats a path with no differing earlier version as a creation', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-prior-'))
    const store = new HistoryStore(root)
    const content = 'brand new\n'
    const blob = await store.putBlob(content)
    await store.append(rec({ id: 'save-of-new', hash: blob.hash, bytes: blob.bytes, mtime: 1 }), limits, 1)

    const claimed = await claimAgentCards({
      store,
      sessionId: 's',
      limits,
      hits: [{ path: PATH_, kind: 'add', turn: 9 }],
      readCurrent: async () => ({ content, binary: false }),
    })
    expect(claimed[0]?.kind).toBe('add')
    expect(claimed[0]?.beforeHash).toBeNull()
  })
})

describe('backfill repairs a diff that compares a change against itself', () => {
  it('points beforeHash at the newest differing version', async () => {
    const { store, olderHash, afterHash } = await seedSameContentOnTop()
    // The defect as it exists on disk: beforeHash === hash.
    await store.append(rec({
      id: 'broken', hash: afterHash, beforeHash: afterHash, bytes: 10, mtime: 3,
      source: 'agent', kind: 'edit', turn: 46, decision: 'pending',
    }), limits, 3)

    expect(await backfillAgentBefore(store)).toBe(1)
    const record = (await store.load()).records.find((item) => item.id === 'broken')
    expect(record?.beforeHash).toBe(olderHash)
    expect(record?.kind).toBe('edit')
    // and it stays repaired
    expect(await backfillAgentBefore(store)).toBe(0)
  })

  it('falls back to a creation when no differing version exists', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-prior-'))
    const store = new HistoryStore(root)
    const blob = await store.putBlob('only version\n')
    await store.append(rec({ id: 'save', hash: blob.hash, bytes: blob.bytes, mtime: 1 }), limits, 1)
    await store.append(rec({
      id: 'created', hash: blob.hash, beforeHash: blob.hash, bytes: blob.bytes, mtime: 2,
      source: 'agent', kind: 'edit', turn: 7,
    }), limits, 2)

    expect(await backfillAgentBefore(store)).toBe(1)
    const record = (await store.load()).records.find((item) => item.id === 'created')
    expect(record?.kind).toBe('add')
    expect(record?.beforeHash).toBeNull()
  })
})
