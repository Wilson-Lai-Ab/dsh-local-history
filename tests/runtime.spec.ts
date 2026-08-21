import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HistoryStore } from '../src/history/store.ts'
import { historyDir, sessionDir } from '../src/session-path.ts'
import { LocalHistoryRuntime } from '../src/runtime.ts'
import { registerLocalHistorySettings } from '../src/settings.ts'
import { hunksFromTexts } from '../src/history/hunks.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { HistoryRecord } from '../src/types.ts'
import type { LocalHistorySettings, LocalHistorySettingsScope } from '../src/contract.ts'

let root = ''
const previousSessionsRoot = process.env.DSH_SESSIONS_ROOT

afterEach(async () => {
  if (previousSessionsRoot === undefined) delete process.env.DSH_SESSIONS_ROOT
  else process.env.DSH_SESSIONS_ROOT = previousSessionsRoot
  if (root !== '') await rm(root, { recursive: true, force: true })
  root = ''
})

function memorySettings(over: Partial<LocalHistorySettings> = {}): LocalHistorySettingsScope {
  let value: LocalHistorySettings = {
    watchEnabled: true,
    maxPerFile: 50,
    maxBytesMb: 200,
    retentionDays: 30,
    ...over,
  }
  return {
    get: () => ({ ...value }),
    update: async (patch) => {
      value = { ...value, ...patch }
      return { ...value }
    },
  }
}

async function seedRecord(sessionsRoot: string, cwd: string, sessionId: string, record: HistoryRecord): Promise<void> {
  const store = new HistoryStore(historyDir(sessionDir(sessionsRoot, cwd, sessionId)))
  if (record.hash) await store.putBlob(await blobOr(record.hash))
  if (record.beforeHash) await store.putBlob(await blobOr(record.beforeHash))
  await store.append(record, { maxPerFile: 50, maxBytes: 1_000_000, retentionDays: 30 }, record.mtime)
}

async function blobOr(hash: string): Promise<string> {
  return `blob-${hash}`
}

describe('LocalHistoryRuntime.listTimeline', () => {
  it('returns sibling session records for the same path and drops missing dirs', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-rt-'))
    process.env.DSH_SESSIONS_ROOT = root
    const cwd = '/proj'
    const path = '/proj/a.ts'
    await seedRecord(root, cwd, 'sess-a', {
      id: 'a1',
      path,
      hash: 'ha',
      beforeHash: null,
      bytes: 8,
      mtime: 10,
      source: 'save',
      kind: 'edit',
      sessionId: 'sess-a',
    })
    await seedRecord(root, cwd, 'sess-b', {
      id: 'b1',
      path,
      hash: 'hb',
      beforeHash: null,
      bytes: 8,
      mtime: 20,
      source: 'agent',
      kind: 'edit',
      sessionId: 'sess-b',
    })
    await seedRecord(root, cwd, 'sess-b', {
      id: 'b-other',
      path: '/proj/other.ts',
      hash: 'hx',
      beforeHash: null,
      bytes: 8,
      mtime: 30,
      source: 'save',
      kind: 'edit',
      sessionId: 'sess-b',
    })

    const runtime = new LocalHistoryRuntime({} as Context, memorySettings())
    const first = await runtime.listTimeline('sess-a', cwd, path)
    expect(first.records.map((record) => record.id)).toEqual(['b1', 'a1'])

    await rm(sessionDir(root, cwd, 'sess-b'), { recursive: true, force: true })
    const second = await runtime.listTimeline('sess-a', cwd, path)
    expect(second.records.map((record) => record.id)).toEqual(['a1'])
  })

  it('normalizes backslashes when matching path', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-rt-slash-'))
    process.env.DSH_SESSIONS_ROOT = root
    const cwd = '/proj'
    await seedRecord(root, cwd, 'sess-a', {
      id: 'win',
      path: String.raw`/proj\a.ts`,
      hash: 'h',
      beforeHash: null,
      bytes: 1,
      mtime: 1,
      source: 'save',
      kind: 'edit',
      sessionId: 'sess-a',
    })
    const runtime = new LocalHistoryRuntime({} as Context, memorySettings())
    const listed = await runtime.listTimeline('sess-a', cwd, '/proj/a.ts')
    expect(listed.records.map((record) => record.id)).toEqual(['win'])
  })
})

describe('LocalHistoryRuntime wire methods', () => {
  it('syncs hits, lists pending review, reads current text, and accepts a file', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-rt-wire-'))
    process.env.DSH_SESSIONS_ROOT = root
    const cwd = join(root, 'proj')
    await mkdir(cwd)
    const filePath = join(cwd, 'a.ts')
    await writeFile(filePath, 'new')
    const runtime = new LocalHistoryRuntime({} as Context, memorySettings({ watchEnabled: false }))

    const synced = await runtime.syncSession('sess-1', cwd, [
      { path: filePath, kind: 'edit', oldText: 'old', turn: 1 },
    ])
    expect(synced.pending).toBe(1)

    const review = await runtime.listReview('sess-1', cwd)
    expect(review.pending).toBe(1)
    expect(review.records).toHaveLength(1)
    expect(review.records[0]?.source).toBe('agent')

    const current = await runtime.readCurrent('sess-1', cwd, filePath)
    expect(current).toEqual({ content: 'new', binary: false })

    const blob = await runtime.readBlob('sess-1', cwd, review.records[0]!.beforeHash!)
    expect(blob.content).toBe('old')

    const accepted = await runtime.acceptFile('sess-1', cwd, review.records[0]!.id)
    expect(accepted.records[0]?.decision).toBe('accepted')
    expect(await readFile(filePath, 'utf8')).toBe('new')
  })

  it('claims a live binary as a non-delete and reject does not unlink it', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-rt-bin-claim-'))
    process.env.DSH_SESSIONS_ROOT = root
    const cwd = join(root, 'proj')
    await mkdir(cwd)
    const filePath = join(cwd, 'a.bin')
    const bytes = Buffer.from([0x00, 0x01, 0x02])
    await writeFile(filePath, bytes)
    const runtime = new LocalHistoryRuntime({} as Context, memorySettings({ watchEnabled: false }))
    await runtime.syncSession('sess-1', cwd, [{ path: filePath, kind: 'edit' }])
    const review = await runtime.listReview('sess-1', cwd)
    expect(review.records).toHaveLength(1)
    expect(review.records[0]?.kind).not.toBe('delete')
    expect(review.records[0]?.hash).toBeNull()
    await runtime.rejectFile('sess-1', cwd, review.records[0]!.id)
    expect(await readFile(filePath)).toEqual(bytes)
  })

  it('detects binary current files conservatively', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-rt-bin-'))
    process.env.DSH_SESSIONS_ROOT = root
    const cwd = join(root, 'proj')
    await mkdir(cwd)
    const filePath = join(cwd, 'a.bin')
    await writeFile(filePath, Buffer.from([0x68, 0x00, 0x69]))
    const runtime = new LocalHistoryRuntime({} as Context, memorySettings({ watchEnabled: false }))
    expect(await runtime.readCurrent('sess-1', cwd, filePath)).toEqual({ content: null, binary: true })
    expect(await runtime.readCurrent('sess-1', cwd, join(cwd, 'missing.ts'))).toEqual({ content: null, binary: false })
  })

  it('rejects a hunk through the remote and restores a snapshot', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-rt-hunk-'))
    process.env.DSH_SESSIONS_ROOT = root
    const cwd = join(root, 'proj')
    await mkdir(cwd)
    const filePath = join(cwd, 'a.ts')
    await writeFile(filePath, 'keep\nNEW\n')
    const runtime = new LocalHistoryRuntime({} as Context, memorySettings({ watchEnabled: false }))
    await runtime.syncSession('sess-1', cwd, [
      { path: filePath, kind: 'edit', oldText: 'keep\n' },
    ])
    const review = await runtime.listReview('sess-1', cwd)
    const hunks = hunksFromTexts('keep\n', 'keep\nNEW\n')
    expect(hunks.length).toBeGreaterThan(0)
    const rejected = await runtime.rejectHunk('sess-1', cwd, review.records[0]!.id, hunks[0]!)
    expect(await readFile(filePath, 'utf8')).toBe('keep\n')
    expect(rejected.records.some((record) => record.source === 'save')).toBe(true)

    const restored = await runtime.restore('sess-1', cwd, review.records[0]!.id)
    expect(await readFile(filePath, 'utf8')).toBe('keep\nNEW\n')
    expect(restored.records.some((record) => record.source === 'save')).toBe(true)
  })

  it('readBlob and restore resolve a sibling session store by record.sessionId', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-rt-sib-'))
    process.env.DSH_SESSIONS_ROOT = root
    const cwd = join(root, 'proj')
    await mkdir(cwd)
    const filePath = join(cwd, 'a.ts')
    await writeFile(filePath, 'live')
    const siblingStore = new HistoryStore(historyDir(sessionDir(root, cwd, 'sess-sib')))
    const blob = await siblingStore.putBlob('from-sib')
    const record: HistoryRecord = {
      id: 'sib-1',
      path: filePath,
      hash: blob.hash,
      beforeHash: null,
      bytes: blob.bytes,
      mtime: Date.now(),
      source: 'save',
      kind: 'edit',
      sessionId: 'sess-sib',
    }
    await siblingStore.append(record, { maxPerFile: 50, maxBytes: 1_000_000, retentionDays: 30 }, record.mtime)
    const runtime = new LocalHistoryRuntime({} as Context, memorySettings({ watchEnabled: false }))
    const read = await runtime.readBlob('sess-sib', cwd, blob.hash)
    expect(read.content).toBe('from-sib')
    await runtime.restore('sess-sib', cwd, 'sib-1')
    expect(await readFile(filePath, 'utf8')).toBe('from-sib')
  })
})

describe('settings', () => {
  it('clamps updates and uses in-memory defaults without ctx.settings', async () => {
    const scope = registerLocalHistorySettings({} as Context)
    expect(scope.get().watchEnabled).toBe(true)
    const runtime = new LocalHistoryRuntime({} as Context, scope)
    expect(runtime.getSettings()).toEqual({
      watchEnabled: true,
      maxPerFile: 50,
      maxBytesMb: 200,
      retentionDays: 30,
    })
    const next = await runtime.updateSettings({ maxPerFile: 999, maxBytesMb: 1, retentionDays: 0, watchEnabled: false })
    expect(next).toEqual({
      watchEnabled: false,
      maxPerFile: 200,
      maxBytesMb: 16,
      retentionDays: 1,
    })
  })

  it('starts watchers for known sessions when watch is re-enabled', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-rt-rewatch-'))
    process.env.DSH_SESSIONS_ROOT = root
    const cwd = join(root, 'proj')
    await mkdir(cwd)
    const filePath = join(cwd, 'a.ts')
    const runtime = new LocalHistoryRuntime({} as Context, memorySettings({ watchEnabled: true }))
    await runtime.syncSession('sess-1', cwd, [])
    await runtime.updateSettings({ watchEnabled: false })
    await writeFile(filePath, 'while-off')
    await new Promise((resolve) => setTimeout(resolve, 350))
    const store = new HistoryStore(historyDir(sessionDir(root, cwd, 'sess-1')))
    expect((await store.load()).records.filter((record) => record.source === 'save')).toHaveLength(0)
    await runtime.updateSettings({ watchEnabled: true })
    await writeFile(filePath, 'while-on')
    const start = Date.now()
    while (Date.now() - start < 4000) {
      const saves = (await store.load()).records.filter((record) => record.source === 'save')
      if (saves.length > 0) {
        runtime.dispose()
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
    runtime.dispose()
    throw new Error('watcher did not start after re-enable')
  })

  it('accepts a fake settings object', async () => {
    const fake = memorySettings({ watchEnabled: false, maxPerFile: 3 })
    const runtime = new LocalHistoryRuntime({} as Context, fake)
    expect(runtime.getSettings().maxPerFile).toBe(3)
    await runtime.updateSettings({ maxPerFile: 8 })
    expect(runtime.getSettings().maxPerFile).toBe(8)
  })
})
