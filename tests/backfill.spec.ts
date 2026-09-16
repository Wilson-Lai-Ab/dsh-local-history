import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { backfillAgentBefore } from '../src/history/backfill.ts'
import { HistoryStore } from '../src/history/store.ts'

const limits = { maxPerFile: 50, maxBytes: 1_000_000, retentionDays: 30 }
const PATH_ = '/proj/a.ts'
let root = ''

afterEach(async () => {
  if (root !== '') await rm(root, { recursive: true, force: true })
  root = ''
})

/**
 * The shape the bug produced: the watcher saved the same bytes first, an older
 * agent record holds the real previous version, and the overwrite landed as
 * `add` with no beforeHash.
 */
async function seedMislabelled(): Promise<HistoryStore> {
  root = await mkdtemp(join(tmpdir(), 'lh-backfill-'))
  const store = new HistoryStore(root)
  const v1 = await store.putBlob('line1\nline2\nline3\n')
  await store.append({
    id: 'v1', path: PATH_, hash: v1.hash, beforeHash: null, bytes: v1.bytes,
    mtime: 1, source: 'agent', kind: 'add', sessionId: 's', turn: 1,
  }, limits, 1)
  const v2 = await store.putBlob('line1\nCHANGED\nline3\n')
  await store.append({
    id: 's2', path: PATH_, hash: v2.hash, beforeHash: v1.hash, bytes: v2.bytes,
    mtime: 2, source: 'save', kind: 'edit', sessionId: 's',
  }, limits, 2)
  await store.append({
    id: 'v3', path: PATH_, hash: v2.hash, beforeHash: null, bytes: v2.bytes,
    mtime: 3, source: 'agent', kind: 'add', sessionId: 's', turn: 9,
  }, limits, 3)
  return store
}

describe('backfillAgentBefore', () => {
  it('points a mislabelled add at the newest different prior version', async () => {
    const store = await seedMislabelled()
    expect(await backfillAgentBefore(store)).toBe(1)
    const index = await store.load()
    const record = index.records.find((item) => item.id === 'v3')
    expect(record?.kind).toBe('edit')
    // The same-content save record is skipped in favour of the real v1 bytes.
    expect(record?.beforeHash).toBe(index.records.find((item) => item.id === 'v1')?.hash)
  })

  it('is idempotent', async () => {
    const store = await seedMislabelled()
    expect(await backfillAgentBefore(store)).toBe(1)
    expect(await backfillAgentBefore(store)).toBe(0)
  })

  it('leaves a genuine creation alone', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-backfill-'))
    const store = new HistoryStore(root)
    const blob = await store.putBlob('brand new\n')
    await store.append({
      id: 'n1', path: '/proj/new.ts', hash: blob.hash, beforeHash: null, bytes: blob.bytes,
      mtime: 1, source: 'agent', kind: 'add', sessionId: 's', turn: 1,
    }, limits, 1)
    expect(await backfillAgentBefore(store)).toBe(0)
    expect((await store.load()).records[0]?.kind).toBe('add')
  })

  it('never rewrites a record that already has a beforeHash', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-backfill-'))
    const store = new HistoryStore(root)
    const older = await store.putBlob('older\n')
    await store.append({
      id: 'o1', path: PATH_, hash: older.hash, beforeHash: null, bytes: older.bytes,
      mtime: 1, source: 'agent', kind: 'add', sessionId: 's', turn: 1,
    }, limits, 1)
    const newer = await store.putBlob('newer\n')
    await store.append({
      id: 'o2', path: PATH_, hash: newer.hash, beforeHash: older.hash, bytes: newer.bytes,
      mtime: 2, source: 'agent', kind: 'edit', sessionId: 's', turn: 2,
    }, limits, 2)
    expect(await backfillAgentBefore(store)).toBe(0)
  })
})
