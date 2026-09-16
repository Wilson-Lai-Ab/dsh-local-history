/**
 * Oversized snapshots: runtime logs reached 61MB and blew a session store past
 * 230MB, which is what made every review sync churn. Nothing that big is
 * recorded, nothing that big is served, and the review pane says so plainly
 * instead of rendering an empty diff.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MAX_SNAPSHOT_BYTES, shouldSkipDir } from '../src/defaults.ts'
import { HistoryStore, sha256Hex } from '../src/history/store.ts'
import { historyDir, projectKey, sessionDir } from '../src/session-path.ts'
import { LocalHistoryRuntime } from '../src/runtime.ts'
import { handleWatchWrite, pathHasSkippedSegment } from '../src/watch/watcher.ts'

const limits = { maxPerFile: 50, maxBytes: 100 * 1024 * 1024, retentionDays: 14 }
let root = ''

afterEach(async () => {
  if (root !== '') await rm(root, { recursive: true, force: true })
  root = ''
  delete process.env.DSH_SESSIONS_ROOT
})

describe('runtime output is not watched', () => {
  it('skips a logs directory and any path under it', () => {
    expect(shouldSkipDir('logs')).toBe(true)
    expect(pathHasSkippedSegment('/proj/logs/hexin-job/console.log', '/proj')).toBe(true)
    expect(pathHasSkippedSegment('/proj/src/app.ts', '/proj')).toBe(false)
  })
})

describe('oversized content is never recorded', () => {
  it('writes no record for content over the cap, and a record under it', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-size-'))
    const store = new HistoryStore(join(root, 'history'))
    const big = join(root, 'console.log')
    const small = join(root, 'app.ts')

    await handleWatchWrite({
      store,
      sessionId: 's',
      cwd: root,
      absPath: big,
      limits,
      hits: [],
      readCurrent: async () => ({ content: 'x'.repeat(MAX_SNAPSHOT_BYTES + 1), binary: false }),
    })
    expect((await store.load()).records).toHaveLength(0)

    await handleWatchWrite({
      store,
      sessionId: 's',
      cwd: root,
      absPath: small,
      limits,
      hits: [],
      readCurrent: async () => ({ content: 'export const a = 1\n', binary: false }),
    })
    const records = (await store.load()).records
    expect(records).toHaveLength(1)
    expect(records[0]?.path).toBe(small)
  })

  it('writes no record for a path under a skipped directory', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-size-'))
    const store = new HistoryStore(join(root, 'history'))
    await handleWatchWrite({
      store,
      sessionId: 's',
      cwd: root,
      absPath: join(root, 'logs', 'hexin-job', 'console.log'),
      limits,
      hits: [],
      readCurrent: async () => ({ content: 'small but ignored\n', binary: false }),
    })
    expect((await store.load()).records).toHaveLength(0)
  })
})

describe('oversized blobs are not served', () => {
  it('reports the stored size and refuses to send it to the client', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-size-'))
    process.env.DSH_SESSIONS_ROOT = root
    const cwd = '/proj'
    const sessionId = 'sess-1'
    const history = historyDir(sessionDir(root, cwd, sessionId))
    const store = new HistoryStore(history)
    const bigHash = sha256Hex('big')
    await mkdir(join(history, 'blobs'), { recursive: true })
    await writeFile(join(history, 'blobs', bigHash), 'x'.repeat(MAX_SNAPSHOT_BYTES + 1))
    await writeFile(join(history, 'index.json'), JSON.stringify({ version: 1, records: [] }))

    expect(await store.blobBytes(bigHash)).toBe(MAX_SNAPSHOT_BYTES + 1)

    const settings = {
      get: () => ({ watchEnabled: false, maxPerFile: 50, maxBytesMb: 100, retentionDays: 14 }),
      update: async () => ({ watchEnabled: false, maxPerFile: 50, maxBytesMb: 100, retentionDays: 14 }),
    }
    const runtime = new LocalHistoryRuntime({} as never, settings as never)
    await expect(runtime.readBlob(sessionId, cwd, bigHash)).rejects.toThrow('blob-too-large')

    // a blob within the cap still round-trips
    const okHash = sha256Hex('ok')
    await writeFile(join(history, 'blobs', okHash), 'fine\n')
    expect(await runtime.readBlob(sessionId, cwd, okHash)).toEqual({ content: 'fine\n' })
    expect(projectKey(cwd)).toBeTruthy()
  })
})
