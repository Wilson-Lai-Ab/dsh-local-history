import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { emptyIndex, parseIndex } from '../src/history/document.ts'
import { HistoryStore, sha256Hex } from '../src/history/store.ts'
import type { HistoryRecord } from '../src/types.ts'

const limits = { maxPerFile: 2, maxBytes: 1024, retentionDays: 30 }
let root = ''
afterEach(async () => { if (root !== '') await rm(root, { recursive: true, force: true }) })

function rec(over: Partial<HistoryRecord>): HistoryRecord {
  return {
    id: over.id ?? 'r1',
    path: over.path ?? '/proj/a.ts',
    hash: over.hash ?? 'h',
    beforeHash: over.beforeHash ?? null,
    bytes: over.bytes ?? 10,
    mtime: over.mtime ?? 1,
    source: over.source ?? 'save',
    kind: over.kind ?? 'edit',
    sessionId: over.sessionId ?? 's',
    ...over,
  }
}

describe('HistoryStore', () => {
  it('stores identical content once', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    const store = new HistoryStore(root)
    const a = await store.putBlob('hello')
    const b = await store.putBlob('hello')
    expect(a.hash).toBe(b.hash)
    expect(a.hash).toBe(sha256Hex('hello'))
    expect(await store.readBlob(a.hash)).toBe('hello')
  })

  it('does not recycle pending agent when over maxPerFile', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    const store = new HistoryStore(root)
    const { hash } = await store.putBlob('new')
    let index = await store.load()
    index.records.push(rec({
      id: 'old-save', source: 'save', hash, mtime: 1, path: '/p/a.ts',
    }))
    index.records.push(rec({
      id: 'pending', source: 'agent', decision: 'pending', hash, mtime: 2, path: '/p/a.ts',
    }))
    index.records.push(rec({
      id: 'newer-save', source: 'save', hash, mtime: 3, path: '/p/a.ts',
    }))
    index = store.gc(index, limits, 10)
    const ids = index.records.map(r => r.id)
    expect(ids).toContain('pending')
    expect(ids).not.toContain('old-save')
  })

  it('drops unreferenced blobs after gc', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    const store = new HistoryStore(root)
    const gone = await store.putBlob('gone')
    const keep = await store.putBlob('keep')
    await store.save({
      version: 1,
      records: [
        rec({ id: 'g', hash: gone.hash, bytes: gone.bytes, mtime: 1, path: '/p/a.ts' }),
        rec({ id: 'k', hash: keep.hash, bytes: keep.bytes, mtime: 2, path: '/p/a.ts' }),
      ],
    })
    let index = await store.load()
    index = store.gc(index, { maxPerFile: 1, maxBytes: 1024, retentionDays: 30 }, 10)
    await store.save(index)
    await expect(store.readBlob(gone.hash)).rejects.toThrow()
    expect(await store.readBlob(keep.hash)).toBe('keep')
  })

  it('treats a malformed index file as empty', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    await writeFile(join(root, 'index.json'), '{not json')
    const store = new HistoryStore(root)
    expect(await store.load()).toEqual(emptyIndex())
  })

  it('does not delete blobs until the post-gc index is saved', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    const store = new HistoryStore(root)
    const gone = await store.putBlob('gone')
    const keep = await store.putBlob('keep')
    const before = {
      version: 1 as const,
      records: [
        rec({ id: 'g', hash: gone.hash, bytes: gone.bytes, mtime: 1, path: '/p/a.ts' }),
        rec({ id: 'k', hash: keep.hash, bytes: keep.bytes, mtime: 2, path: '/p/a.ts' }),
      ],
    }
    await store.save(before)
    const index = store.gc(before, { maxPerFile: 1, maxBytes: 1024, retentionDays: 30 }, 10)
    expect(await store.readBlob(gone.hash)).toBe('gone')
    await store.save(index)
    await expect(store.readBlob(gone.hash)).rejects.toThrow()
    expect(await store.readBlob(keep.hash)).toBe('keep')
  })

  it('does not sweep an in-flight putBlob that was never in the previous index', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    const store = new HistoryStore(root)
    const keep = await store.putBlob('keep')
    const inflight = await store.putBlob('inflight')
    await store.save({
      version: 1,
      records: [rec({ id: 'k', hash: keep.hash, bytes: keep.bytes, mtime: 1 })],
    })
    expect(await store.readBlob(inflight.hash)).toBe('inflight')
  })

  it('drops save records older than retentionDays', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    const store = new HistoryStore(root)
    const day = 24 * 60 * 60 * 1000
    const now = 40 * day
    const { hash } = await store.putBlob('body')
    let index = await store.load()
    index.records.push(rec({ id: 'old-save', source: 'save', hash, mtime: 5 * day, path: '/p/a.ts' }))
    index.records.push(rec({ id: 'recent-save', source: 'save', hash, mtime: 20 * day, path: '/p/a.ts' }))
    index.records.push(rec({
      id: 'old-pending', source: 'agent', decision: 'pending', hash, mtime: 1, path: '/p/a.ts',
    }))
    index = store.gc(index, { maxPerFile: 50, maxBytes: 1024, retentionDays: 30 }, now)
    const ids = index.records.map(r => r.id)
    expect(ids).not.toContain('old-save')
    expect(ids).toContain('recent-save')
    expect(ids).toContain('old-pending')
  })

  it('drops oldest decided agent when still over maxPerFile', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    const store = new HistoryStore(root)
    const { hash } = await store.putBlob('shared')
    let index = await store.load()
    index.records.push(rec({
      id: 'accepted', source: 'agent', decision: 'accepted', hash, mtime: 1, path: '/p/a.ts',
    }))
    index.records.push(rec({
      id: 'rejected', source: 'agent', decision: 'rejected', hash, mtime: 2, path: '/p/a.ts',
    }))
    index.records.push(rec({
      id: 'pending', source: 'agent', decision: 'pending', hash, mtime: 3, path: '/p/a.ts',
    }))
    index = store.gc(index, { maxPerFile: 2, maxBytes: 1024, retentionDays: 30 }, 10)
    const ids = index.records.map(r => r.id)
    expect(ids).toContain('pending')
    expect(ids).toContain('rejected')
    expect(ids).not.toContain('accepted')
  })

  it('drops oldest decided agent when still over maxBytes', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    const store = new HistoryStore(root)
    const accepted = await store.putBlob('accepted-body')
    const pending = await store.putBlob('pending-body')
    const seeded = {
      version: 1 as const,
      records: [
        rec({
          id: 'accepted',
          source: 'agent',
          decision: 'accepted',
          hash: accepted.hash,
          bytes: accepted.bytes,
          mtime: 1,
          path: '/p/a.ts',
        }),
        rec({
          id: 'pending',
          source: 'agent',
          decision: 'pending',
          hash: pending.hash,
          bytes: pending.bytes,
          mtime: 2,
          path: '/p/a.ts',
        }),
      ],
    }
    await store.save(seeded)
    const index = store.gc(seeded, {
      maxPerFile: 50,
      maxBytes: accepted.bytes + pending.bytes - 1,
      retentionDays: 30,
    }, 10)
    await store.save(index)
    const ids = index.records.map(r => r.id)
    expect(ids).toEqual(['pending'])
    await expect(store.readBlob(accepted.hash)).rejects.toThrow()
    expect(await store.readBlob(pending.hash)).toBe('pending-body')
  })

  it('does not recycle agent rows with undefined decision', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    const store = new HistoryStore(root)
    const { hash } = await store.putBlob('body')
    let index = await store.load()
    index.records.push(rec({
      id: 'undecided', source: 'agent', hash, mtime: 1, path: '/p/a.ts',
    }))
    index.records.push(rec({
      id: 'accepted', source: 'agent', decision: 'accepted', hash, mtime: 2, path: '/p/a.ts',
    }))
    index.records.push(rec({ id: 'save', source: 'save', hash, mtime: 3, path: '/p/a.ts' }))
    index = store.gc(index, { maxPerFile: 1, maxBytes: 1024, retentionDays: 30 }, 10)
    const ids = index.records.map(r => r.id)
    expect(ids).toContain('undecided')
    expect(ids).not.toContain('save')
    expect(ids).not.toContain('accepted')
  })

  it('keeps blobs referenced only by a pending agent', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    const store = new HistoryStore(root)
    const dropped = await store.putBlob('dropped-save')
    const pendingHash = await store.putBlob('pending-only')
    const pendingBefore = await store.putBlob('pending-before')
    const seeded = {
      version: 1 as const,
      records: [
        rec({
          id: 'old-save', source: 'save', hash: dropped.hash, bytes: dropped.bytes, mtime: 1, path: '/p/a.ts',
        }),
        rec({
          id: 'pending',
          source: 'agent',
          decision: 'pending',
          hash: pendingHash.hash,
          beforeHash: pendingBefore.hash,
          bytes: pendingHash.bytes,
          mtime: 2,
          path: '/p/a.ts',
        }),
        rec({
          id: 'newer-save',
          source: 'save',
          hash: pendingHash.hash,
          bytes: pendingHash.bytes,
          mtime: 3,
          path: '/p/b.ts',
        }),
      ],
    }
    await store.save(seeded)
    const index = store.gc(seeded, { maxPerFile: 1, maxBytes: 1024, retentionDays: 30 }, 10)
    await store.save(index)
    expect(index.records.map(r => r.id)).toEqual(['pending', 'newer-save'])
    await expect(store.readBlob(dropped.hash)).rejects.toThrow()
    expect(await store.readBlob(pendingHash.hash)).toBe('pending-only')
    expect(await store.readBlob(pendingBefore.hash)).toBe('pending-before')
  })

  it('append loads, recycles, and persists', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    const store = new HistoryStore(root)
    const { hash, bytes } = await store.putBlob('body')
    await store.append(rec({
      id: 'old-save', source: 'save', hash, bytes, mtime: 1, path: '/p/a.ts',
    }), limits, 10)
    await store.append(rec({
      id: 'pending', source: 'agent', decision: 'pending', hash, bytes, mtime: 2, path: '/p/a.ts',
    }), limits, 10)
    const next = await store.append(rec({
      id: 'newer-save', source: 'save', hash, bytes, mtime: 3, path: '/p/a.ts',
    }), limits, 10)
    const ids = next.records.map(r => r.id)
    expect(ids).toContain('pending')
    expect(ids).toContain('newer-save')
    expect(ids).not.toContain('old-save')
    expect(await store.load()).toEqual(next)
  })
})

describe('parseIndex', () => {
  it('returns emptyIndex for unknown version', () => {
    expect(parseIndex({ version: 2, records: [] })).toEqual(emptyIndex())
  })

  it('returns emptyIndex for malformed input', () => {
    expect(parseIndex(null)).toEqual(emptyIndex())
    expect(parseIndex('nope')).toEqual(emptyIndex())
    expect(parseIndex({ version: 1 })).toEqual(emptyIndex())
    expect(parseIndex({ version: 1, records: 'x' })).toEqual(emptyIndex())
  })
})

