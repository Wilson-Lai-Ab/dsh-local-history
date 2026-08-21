import { createHash, randomBytes } from 'node:crypto'
import { readdirSync, statSync, unlinkSync } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { blobPath, emptyIndex, parseIndex } from './document.ts'
import type { HistoryIndex, HistoryLimits, HistoryRecord } from '../types.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const storeLocks = new Map<string, Promise<void>>()
/** Roots whose critical section is currently executing; nested calls run inline. */
const storeLockHeld = new Set<string>()

export { blobPath, emptyIndex, parseIndex }

export function sha256Hex(bytes: Uint8Array | string): string {
  const hash = createHash('sha256')
  hash.update(typeof bytes === 'string' ? bytes : Buffer.from(bytes))
  return hash.digest('hex')
}

/**
 * Serialize read-modify-write cycles per historyRoot. Re-entrant: a call made
 * while the same root's critical section is already executing runs inline, so
 * composite operations (e.g. `claimAgentCards` per-hit work) can hold the lock
 * across load → compute → append without deadlocking on nested store calls.
 */
function withStoreLock<T>(historyRoot: string, fn: () => Promise<T>): Promise<T> {
  if (storeLockHeld.has(historyRoot)) return fn()
  const previous = storeLocks.get(historyRoot) ?? Promise.resolve()
  const run = previous.then(
    () => {
      storeLockHeld.add(historyRoot)
      return fn()
    },
    () => {
      storeLockHeld.add(historyRoot)
      return fn()
    },
  )
  storeLocks.set(historyRoot, run.then(
    () => {
      storeLockHeld.delete(historyRoot)
      return undefined
    },
    () => {
      storeLockHeld.delete(historyRoot)
      return undefined
    },
  ))
  return run
}

export class HistoryStore {
  constructor(readonly historyRoot: string) {}

  /** Run `fn` inside this store's serialized critical section (re-entrant). */
  withLock<T>(fn: () => Promise<T>): Promise<T> {
    return withStoreLock(this.historyRoot, fn)
  }

  async load(): Promise<HistoryIndex> {
    try {
      const raw = await readFile(join(this.historyRoot, 'index.json'), 'utf8')
      return parseIndex(JSON.parse(raw) as unknown)
    } catch {
      return emptyIndex()
    }
  }

  async hasBlob(hash: string): Promise<boolean> {
    try {
      await stat(blobPath(this.historyRoot, hash))
      return true
    } catch {
      return false
    }
  }

  async save(index: HistoryIndex): Promise<void> {
    return withStoreLock(this.historyRoot, () => this.saveUnlocked(index))
  }

  async putBlob(content: string): Promise<{ hash: string; bytes: number }> {
    return withStoreLock(this.historyRoot, () => this.putBlobUnlocked(content))
  }

  async readBlob(hash: string): Promise<string> {
    return await readFile(blobPath(this.historyRoot, hash), 'utf8')
  }

  async append(record: HistoryRecord, limits: HistoryLimits, now?: number): Promise<HistoryIndex> {
    return withStoreLock(this.historyRoot, async () => {
      const index = await this.load()
      index.records.push(record)
      const next = this.gc(index, limits, now)
      await this.saveUnlocked(next)
      return next
    })
  }

  /** Recycle per spec; returns next index. Never drops pending agent or live hashes. */
  gc(index: HistoryIndex, limits: HistoryLimits, now: number = Date.now()): HistoryIndex {
    const drop = new Set<string>()
    const cutoff = now - limits.retentionDays * DAY_MS

    for (const record of index.records) {
      if (record.source === 'save' && record.mtime < cutoff) drop.add(record.id)
    }

    const remaining = (): HistoryRecord[] => index.records.filter((record) => !drop.has(record.id))

    for (const group of groupedByPath(remaining()).values()) {
      let extra = group.length - limits.maxPerFile
      if (extra <= 0) continue
      const oldestFirst = group.slice().sort(byMtimeThenId)
      for (const record of oldestFirst) {
        if (extra <= 0) break
        if (record.source === 'save') {
          drop.add(record.id)
          extra -= 1
        }
      }
    }

    while (true) {
      const list = remaining()
      const overCount = [...groupedByPath(list).values()].some((group) => group.length > limits.maxPerFile)
      const overBytes = uniqueLiveBytes(list, this.historyRoot) > limits.maxBytes
      if (!overCount && !overBytes) break
      const victim = list
        .filter((record) => record.source === 'agent' && (record.decision === 'accepted' || record.decision === 'rejected'))
        .slice()
        .sort(byMtimeThenId)[0]
      if (victim === undefined) break
      drop.add(victim.id)
    }

    return { version: 1, records: remaining() }
  }

  private async saveUnlocked(index: HistoryIndex): Promise<void> {
    await mkdir(this.historyRoot, { recursive: true })
    const dest = join(this.historyRoot, 'index.json')
    const previous = await this.load()
    await writeAtomic(dest, `${JSON.stringify(index, null, 2)}\n`)
    unlinkDeadBlobs(this.historyRoot, liveHashes(previous.records), liveHashes(index.records))
  }

  private async putBlobUnlocked(content: string): Promise<{ hash: string; bytes: number }> {
    const hash = sha256Hex(content)
    const bytes = Buffer.byteLength(content, 'utf8')
    const dest = blobPath(this.historyRoot, hash)
    await mkdir(dirname(dest), { recursive: true })
    try {
      await stat(dest)
      return { hash, bytes }
    } catch {
      await writeAtomic(dest, content)
      return { hash, bytes }
    }
  }
}

function byMtimeThenId(a: HistoryRecord, b: HistoryRecord): number {
  return a.mtime - b.mtime || a.id.localeCompare(b.id)
}

function groupedByPath(records: HistoryRecord[]): Map<string, HistoryRecord[]> {
  const groups = new Map<string, HistoryRecord[]>()
  for (const record of records) {
    const group = groups.get(record.path)
    if (group) group.push(record)
    else groups.set(record.path, [record])
  }
  return groups
}

function liveHashes(records: HistoryRecord[]): Set<string> {
  const hashes = new Set<string>()
  for (const record of records) {
    if (record.hash !== null) hashes.add(record.hash)
    if (record.beforeHash !== null) hashes.add(record.beforeHash)
  }
  return hashes
}

function uniqueLiveBytes(records: HistoryRecord[], historyRoot: string): number {
  const sizes = new Map<string, number>()
  for (const record of records) {
    if (record.hash !== null) sizes.set(record.hash, record.bytes)
  }
  for (const record of records) {
    if (record.beforeHash !== null && !sizes.has(record.beforeHash)) {
      sizes.set(record.beforeHash, blobFileSize(historyRoot, record.beforeHash))
    }
  }
  let sum = 0
  for (const size of sizes.values()) sum += size
  return sum
}

function blobFileSize(historyRoot: string, hash: string): number {
  try {
    return statSync(blobPath(historyRoot, hash)).size
  } catch {
    return 0
  }
}

/** Sweep only hashes that were live in the previous index and are absent after this write. */
function unlinkDeadBlobs(historyRoot: string, previousLive: Set<string>, nextLive: Set<string>): void {
  let names: string[]
  try {
    names = readdirSync(join(historyRoot, 'blobs'))
  } catch {
    return
  }
  for (const name of names) {
    if (name.startsWith('.')) continue
    if (!previousLive.has(name)) continue
    if (nextLive.has(name)) continue
    try {
      unlinkSync(join(historyRoot, 'blobs', name))
    } catch {
      // ignore races / already-gone files
    }
  }
}

async function writeAtomic(dest: string, content: string): Promise<void> {
  const tmp = `${dest}.${randomBytes(8).toString('hex')}.tmp`
  await writeFile(tmp, content)
  await rename(tmp, dest)
}
