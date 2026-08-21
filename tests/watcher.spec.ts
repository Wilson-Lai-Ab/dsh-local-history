import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HistoryStore } from '../src/history/store.ts'
import { shouldSkipDir } from '../src/watch/ignore.ts'
import { handleWatchWrite, startWatcher } from '../src/watch/watcher.ts'
import type { AgentCardHit } from '../src/agent/cards.ts'

const limits = { maxPerFile: 50, maxBytes: 1_000_000, retentionDays: 30 }
let root = ''
const stops: Array<{ close(): void }> = []
const pending: Array<Promise<void>> = []

afterEach(async () => {
  while (stops.length > 0) stops.pop()?.close()
  await Promise.all(pending.splice(0))
  if (root !== '') await rm(root, { recursive: true, force: true })
  root = ''
})

async function waitUntil(check: () => Promise<boolean>, ms = 4000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  throw new Error('timeout waiting for watcher')
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

describe('watch ignore', () => {
  it('re-exports shouldSkipDir', () => {
    expect(shouldSkipDir('node_modules')).toBe(true)
    expect(shouldSkipDir('src')).toBe(false)
  })
})

describe('startWatcher', () => {
  it('debounces a write into a save record and ignores node_modules', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-watch-'))
    const cwd = join(root, 'proj')
    await mkdir(cwd)
    const store = new HistoryStore(join(root, 'hist'))
    const hits: AgentCardHit[] = []
    stops.push(startWatcher(cwd, (absPath) => {
      pending.push(handleWatchWrite({
        store,
        sessionId: 'sess-1',
        cwd,
        absPath,
        limits,
        hits,
        readCurrent: async (path) => {
          const content = await readText(path)
          return { content, binary: false }
        },
      }))
    }))
    await new Promise((resolve) => setTimeout(resolve, 80))

    const filePath = join(cwd, 'a.ts')
    await writeFile(filePath, 'hello')
    await waitUntil(async () => {
      const index = await store.load()
      return index.records.some((record) => record.source === 'save' && record.path === filePath)
    })
    await Promise.all(pending.splice(0))
    const first = await store.load()
    expect(first.records.filter((record) => record.source === 'save')).toHaveLength(1)

    await writeFile(filePath, 'hello')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await Promise.all(pending.splice(0))
    const dup = await store.load()
    expect(dup.records.filter((record) => record.source === 'save')).toHaveLength(1)

    await mkdir(join(cwd, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(join(cwd, 'node_modules', 'pkg', 'x.js'), 'ignored')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await Promise.all(pending.splice(0))
    const afterIgnore = await store.load()
    expect(afterIgnore.records.some((record) => record.path.includes('node_modules'))).toBe(false)
  })

  it('claims an unclaimed agent hit for that path instead of saving', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-watch-claim-'))
    const cwd = join(root, 'proj')
    await mkdir(cwd)
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(cwd, 'a.ts')
    const hits: AgentCardHit[] = [{ path: filePath, kind: 'edit', oldText: 'before', turn: 3 }]
    await writeFile(filePath, 'after')
    await handleWatchWrite({
      store,
      sessionId: 'sess-1',
      cwd,
      absPath: filePath,
      limits,
      hits,
      readCurrent: async () => ({ content: 'after', binary: false }),
    })
    const index = await store.load()
    expect(index.records).toHaveLength(1)
    expect(index.records[0]?.source).toBe('agent')
    expect(index.records[0]?.decision).toBe('pending')
    expect(index.records[0]?.turn).toBe(3)
    expect(await store.readBlob(index.records[0]!.beforeHash!)).toBe('before')
    expect(await store.readBlob(index.records[0]!.hash!)).toBe('after')

    await handleWatchWrite({
      store,
      sessionId: 'sess-1',
      cwd,
      absPath: filePath,
      limits,
      hits,
      readCurrent: async () => ({ content: 'after', binary: false }),
    })
    const again = await store.load()
    expect(again.records.filter((record) => record.source === 'agent')).toHaveLength(1)
    expect(again.records.filter((record) => record.source === 'save')).toHaveLength(0)
  })

  it('serializes writes and skips duplicate hashes across HistoryStore instances that share historyRoot', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-watch-root-'))
    const cwd = join(root, 'proj')
    await mkdir(cwd)
    const historyRoot = join(root, 'hist')
    const a = new HistoryStore(historyRoot)
    const b = new HistoryStore(historyRoot)
    const filePath = join(cwd, 'a.ts')
    await writeFile(filePath, 'hello')
    const slowRead = async (): Promise<{ content: string; binary: boolean }> => {
      await new Promise((resolve) => setTimeout(resolve, 40))
      return { content: 'hello', binary: false }
    }
    const input = (store: HistoryStore) => ({
      store,
      sessionId: 'sess-1',
      cwd,
      absPath: filePath,
      limits,
      hits: [] as AgentCardHit[],
      readCurrent: slowRead,
    })
    const originalAppend = HistoryStore.prototype.append
    let appends = 0
    HistoryStore.prototype.append = async function appendCounted(...args) {
      appends += 1
      return await originalAppend.apply(this, args)
    }
    try {
      await Promise.all([handleWatchWrite(input(a)), handleWatchWrite(input(b))])
      expect(appends).toBe(1)
      expect((await a.load()).records.filter((record) => record.source === 'save')).toHaveLength(1)

      await handleWatchWrite(input(new HistoryStore(historyRoot)))
      expect(appends).toBe(1)
      expect((await b.load()).records.filter((record) => record.source === 'save')).toHaveLength(1)
    } finally {
      HistoryStore.prototype.append = originalAppend
    }
  })

  it('does not snapshot an existing binary as a delete and skips identical binary writes', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-watch-bin-'))
    const cwd = join(root, 'proj')
    await mkdir(cwd)
    const store = new HistoryStore(join(root, 'hist'))
    const filePath = join(cwd, 'a.bin')
    await writeFile(filePath, Buffer.from([0x00, 0x01]))
    const input = {
      store,
      sessionId: 'sess-1',
      cwd,
      absPath: filePath,
      limits,
      hits: [] as AgentCardHit[],
      readCurrent: async () => ({ content: null, binary: true }),
    }
    await handleWatchWrite(input)
    const first = await store.load()
    expect(first.records).toHaveLength(1)
    expect(first.records[0]?.kind).not.toBe('delete')
    expect(first.records[0]?.hash).toBeNull()
    await handleWatchWrite(input)
    expect((await store.load()).records).toHaveLength(1)
  })
})
