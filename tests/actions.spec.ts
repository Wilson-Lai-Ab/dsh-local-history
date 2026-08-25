import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acceptFile, acceptHunk, rejectFile, rejectHunk, reopenRecord, restoreSnapshot, type ActionIo } from '../src/history/actions.ts'
import { hunksFromTexts } from '../src/history/hunks.ts'
import { HistoryStore } from '../src/history/store.ts'
import type { HistoryLimits, HistoryRecord } from '../src/types.ts'

const limits: HistoryLimits = { maxPerFile: 50, maxBytes: 1_000_000, retentionDays: 30 }
let root = ''
afterEach(async () => {
  if (root !== '') await rm(root, { recursive: true, force: true })
  root = ''
})

function ioFor(store: HistoryStore, sessionId: string): ActionIo {
  return {
    store,
    sessionId,
    limits,
    writeFile: (path, content) => writeFile(path, content),
    unlink: (path) => unlink(path),
    readFile: async (path) => {
      try {
        return await readFile(path, 'utf8')
      } catch {
        return null
      }
    },
  }
}

async function pendingAgent(
  store: HistoryStore,
  filePath: string,
  before: string,
  current: string,
): Promise<HistoryRecord> {
  const beforeBlob = await store.putBlob(before)
  const currentBlob = await store.putBlob(current)
  await writeFile(filePath, current)
  const record: HistoryRecord = {
    id: 'agent-1',
    path: filePath,
    hash: currentBlob.hash,
    beforeHash: beforeBlob.hash,
    bytes: currentBlob.bytes,
    mtime: 1,
    source: 'agent',
    kind: 'edit',
    sessionId: 'sess-1',
    decision: 'pending',
  }
  await store.append(record, limits, 10)
  return record
}

describe('file actions', () => {
  it('rejectFile restores beforeHash and marks rejected', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-act-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    await pendingAgent(store, filePath, 'old\n', 'new\n')
    const index = await rejectFile(ioFor(store, 'sess-1'), 'agent-1')
    expect(await readFile(filePath, 'utf8')).toBe('old\n')
    expect(index.records.find((r) => r.id === 'agent-1')?.decision).toBe('rejected')
  })

  it('persists rejected before restoring disk', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-act-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    await pendingAgent(store, filePath, 'old\n', 'new\n')
    let decisionAtWrite: string | undefined
    const io = ioFor(store, 'sess-1')
    io.writeFile = async (path, content) => {
      decisionAtWrite = (await store.load()).records.find((r) => r.id === 'agent-1')?.decision
      await writeFile(path, content)
    }
    await rejectFile(io, 'agent-1')
    expect(decisionAtWrite).toBe('rejected')
    expect(await readFile(filePath, 'utf8')).toBe('old\n')
  })

  it('restores disk when gc drops the just-rejected row', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-act-gc-reject-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    const tight: HistoryLimits = { maxPerFile: 1, maxBytes: 1_000_000, retentionDays: 30 }
    const keepBefore = await store.putBlob('keep-old\n')
    const keepNew = await store.putBlob('keep-new\n')
    await store.append({
      id: 'agent-keep',
      path: filePath,
      hash: keepNew.hash,
      beforeHash: keepBefore.hash,
      bytes: keepNew.bytes,
      mtime: 2,
      source: 'agent',
      kind: 'edit',
      sessionId: 'sess-1',
      decision: 'pending',
    }, tight, 10)
    await pendingAgent(store, filePath, 'old\n', 'new\n')
    const io = { ...ioFor(store, 'sess-1'), limits: tight }
    const next = await rejectFile(io, 'agent-1')
    expect(await readFile(filePath, 'utf8')).toBe('old\n')
    expect(next.records.find((r) => r.id === 'agent-1')).toBeUndefined()
    expect(next.records.find((r) => r.id === 'agent-keep')?.decision).toBe('pending')
  })

  it('does not write disk when persist fails', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-act-persist-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    await pendingAgent(store, filePath, 'old\n', 'new\n')
    const io = ioFor(store, 'sess-1')
    const failSave: HistoryStore['save'] = async () => {
      throw new Error('persist-fail')
    }
    store.save = failSave
    await expect(rejectFile(io, 'agent-1')).rejects.toThrow(/persist-fail/)
    expect(await readFile(filePath, 'utf8')).toBe('new\n')
  })

  it('rejectFile tolerates a gc-dropped before-blob (marks rejected, no restore)', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-act-dangling-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    await pendingAgent(store, filePath, 'old\n', 'new\n')
    const record = (await store.load()).records.find((r) => r.id === 'agent-1')!
    await rm(join(root, 'hist', 'blobs', record.beforeHash!), { force: true })
    const index = await rejectFile(ioFor(store, 'sess-1'), 'agent-1')
    expect(index.records.find((r) => r.id === 'agent-1')?.decision).toBe('rejected')
    // The before content is gone; rejecting must not throw and leaves disk as-is.
    expect(await readFile(filePath, 'utf8')).toBe('new\n')
  })

  it('acceptFile leaves disk and marks accepted', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-act-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    await pendingAgent(store, filePath, 'old\n', 'new\n')
    const index = await acceptFile(ioFor(store, 'sess-1'), 'agent-1')
    expect(await readFile(filePath, 'utf8')).toBe('new\n')
    expect(index.records.find((r) => r.id === 'agent-1')?.decision).toBe('accepted')
  })
})

describe('reopenRecord', () => {
  it('puts an accepted file back to pending without touching disk', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-reopen-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    await pendingAgent(store, filePath, 'old\n', 'new\n')
    await acceptFile(ioFor(store, 'sess-1'), 'agent-1')
    const index = await reopenRecord(ioFor(store, 'sess-1'), 'agent-1', {})
    expect(index.records.find((r) => r.id === 'agent-1')?.decision).toBe('pending')
    expect(await readFile(filePath, 'utf8')).toBe('new\n')
  })

  it('restores disk then pending after a reject', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-reopen-rej-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    await pendingAgent(store, filePath, 'old\n', 'new\n')
    await rejectFile(ioFor(store, 'sess-1'), 'agent-1')
    expect(await readFile(filePath, 'utf8')).toBe('old\n')
    const index = await reopenRecord(ioFor(store, 'sess-1'), 'agent-1', { content: 'new\n' })
    expect(index.records.find((r) => r.id === 'agent-1')?.decision).toBe('pending')
    expect(await readFile(filePath, 'utf8')).toBe('new\n')
  })

  it('ignores null content so a coerced undo payload cannot unlink', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-reopen-null-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    await pendingAgent(store, filePath, 'old\n', 'new\n')
    await acceptFile(ioFor(store, 'sess-1'), 'agent-1')
    await reopenRecord(ioFor(store, 'sess-1'), 'agent-1', { content: null })
    expect(await readFile(filePath, 'utf8')).toBe('new\n')
  })

  it('clears one hunk decision', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-reopen-hunk-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    await pendingAgent(store, filePath, 'keep\nold\nkeep2\n', 'keep\nnew\nkeep2\n')
    const hunk = hunksFromTexts('keep\nold\nkeep2\n', 'keep\nnew\nkeep2\n')[0]!
    await acceptHunk(ioFor(store, 'sess-1'), 'agent-1', hunk.key)
    const index = await reopenRecord(ioFor(store, 'sess-1'), 'agent-1', { hunkKey: hunk.key })
    const agent = index.records.find((r) => r.id === 'agent-1')
    expect(agent?.decision).toBe('pending')
    expect(agent?.hunks?.[hunk.key]).toBeUndefined()
  })
})

describe('rejectHunk', () => {
  it('undoes a one-island file, writes it, and appends a save', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-act-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    const oldT = 'a\nb\nc\n'
    const newT = 'a\nX\nb\nc\n'
    await pendingAgent(store, filePath, oldT, newT)
    const hunk = hunksFromTexts(oldT, newT)[0]!
    const index = await rejectHunk(ioFor(store, 'sess-1'), 'agent-1', hunk)
    expect(await readFile(filePath, 'utf8')).toBe(oldT)
    const agent = index.records.find((r) => r.id === 'agent-1')
    expect(agent?.hunks?.[hunk.key]).toBe('rejected')
    expect(agent?.decision).toBe('rejected')
    expect(index.records.some((r) => r.source === 'save' && r.path === filePath)).toBe(true)
  })

  it('persists the save record before writing undone text', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-act-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    const oldT = 'a\nb\nc\n'
    const newT = 'a\nX\nb\nc\n'
    await pendingAgent(store, filePath, oldT, newT)
    const hunk = hunksFromTexts(oldT, newT)[0]!
    let savesAtWrite = 0
    const io = ioFor(store, 'sess-1')
    io.writeFile = async (path, content) => {
      const index = await store.load()
      savesAtWrite = index.records.filter((r) => r.source === 'save').length
      await writeFile(path, content)
    }
    await rejectHunk(io, 'agent-1', hunk)
    expect(savesAtWrite).toBe(1)
    expect(await readFile(filePath, 'utf8')).toBe(oldT)
  })

  it('throws when the file drifted', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-act-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    await pendingAgent(store, filePath, 'a\n', 'a\nB\n')
    await writeFile(filePath, 'a\nC\n')
    const hunk = hunksFromTexts('a\n', 'a\nB\n')[0]!
    await expect(rejectHunk(ioFor(store, 'sess-1'), 'agent-1', hunk)).rejects.toThrow(/hunk-mismatch/)
  })
})

describe('acceptHunk', () => {
  it('accepts both islands, leaves disk, and marks the file accepted', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-act-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    const oldT = 'a\nb\nc\nd\n'
    const newT = 'a\nX\nb\nc\nY\nd\n'
    await pendingAgent(store, filePath, oldT, newT)
    const hunks = hunksFromTexts(oldT, newT)
    expect(hunks).toHaveLength(2)
    const io = ioFor(store, 'sess-1')
    await acceptHunk(io, 'agent-1', hunks[0]!.key)
    const afterOne = await store.load()
    expect(afterOne.records.find((r) => r.id === 'agent-1')?.decision).toBe('pending')
    expect(await readFile(filePath, 'utf8')).toBe(newT)
    const index = await acceptHunk(io, 'agent-1', hunks[1]!.key)
    const agent = index.records.find((r) => r.id === 'agent-1')
    expect(agent?.hunks?.[hunks[0]!.key]).toBe('accepted')
    expect(agent?.hunks?.[hunks[1]!.key]).toBe('accepted')
    expect(agent?.decision).toBe('accepted')
    expect(await readFile(filePath, 'utf8')).toBe(newT)
  })

  it('marks the file accepted from original hunk keys even if disk drifted', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-act-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    const oldT = 'a\nb\nc\n'
    const newT = 'a\nX\nb\nY\nc\n'
    await pendingAgent(store, filePath, oldT, newT)
    const hunks = hunksFromTexts(oldT, newT)
    expect(hunks).toHaveLength(2)
    await writeFile(filePath, 'a\nX\nb\nY\nc\nZ\n')
    const io = ioFor(store, 'sess-1')
    await acceptHunk(io, 'agent-1', hunks[0]!.key)
    expect((await store.load()).records.find((r) => r.id === 'agent-1')?.decision).toBe('pending')
    const index = await acceptHunk(io, 'agent-1', hunks[1]!.key)
    expect(index.records.find((r) => r.id === 'agent-1')?.decision).toBe('accepted')
  })
})

describe('restoreSnapshot', () => {
  it('persists the previous-disk save before restoring the snapshot', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-act-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    await pendingAgent(store, filePath, 'old\n', 'new\n')
    await writeFile(filePath, 'newer\n')
    let savedAtWrite: string | undefined
    const io = ioFor(store, 'sess-1')
    io.writeFile = async (path, content) => {
      const index = await store.load()
      const save = index.records.find((r) => r.source === 'save')
      savedAtWrite = save?.hash ? await store.readBlob(save.hash) : undefined
      await writeFile(path, content)
    }
    const index = await restoreSnapshot(io, 'agent-1')
    expect(savedAtWrite).toBe('newer\n')
    expect(await readFile(filePath, 'utf8')).toBe('new\n')
    const saves = index.records.filter((r) => r.source === 'save')
    expect(saves).toHaveLength(1)
    expect(await store.readBlob(saves[0]!.hash!)).toBe('newer\n')
  })

  it('saves current disk first then restores the snapshot blob', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-act-'))
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(root, 'a.ts')
    await pendingAgent(store, filePath, 'old\n', 'new\n')
    await writeFile(filePath, 'newer\n')
    const index = await restoreSnapshot(ioFor(store, 'sess-1'), 'agent-1')
    expect(await readFile(filePath, 'utf8')).toBe('new\n')
    const saves = index.records.filter((r) => r.source === 'save')
    expect(saves).toHaveLength(1)
    expect(await store.readBlob(saves[0]!.hash!)).toBe('newer\n')
  })
})
