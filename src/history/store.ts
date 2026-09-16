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

  /** Stored size of a blob in bytes; 0 when it is missing. */
  async blobBytes(hash: string): Promise<number> {
    try {
      return (await stat(blobPath(this.historyRoot, hash))).size
    } catch {
      return 0
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

  /**
    * Recycle per spec; returns next index.
    *
    * The byte cap is reclaimed from SAVE records first, biggest first: that is
    * where bulk actually lives (one runtime log outweighed a whole session of
    * edits). The old version could only shed RESOLVED agent records, so a store
    * pinned over the cap by a log kept deleting the user's review history — and
    * the next sync rebuilt it, which is what made every review sync churn.
    *
    * PENDING agent records are never dropped: they are review items the user has
    * not answered yet.
    *
    * Live bytes are computed once per call; the old loop recomputed them (stat-ing
    * blobs) on every iteration.
    */
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
      // Still over: shed the oldest DECIDED agent rows. An agent row without a
      // decision is pending (the user has not answered it) and is kept.
      for (const record of oldestFirst) {
        if (extra <= 0) break
        if (drop.has(record.id)) continue
        if (record.source === 'agent' && isDecided(record)) {
          drop.add(record.id)
          extra -= 1
        }
      }
    }

    let liveBytes = uniqueLiveBytes(remaining(), this.historyRoot)

    // Fewest deletions first: drop the largest saves until the cap is met.
    if (liveBytes > limits.maxBytes) {
      const saves = remaining()
        .filter((record) => record.source === 'save')
        .sort((a, b) => b.bytes - a.bytes || byMtimeThenId(a, b))
      for (const record of saves) {
        if (liveBytes <= limits.maxBytes) break
        drop.add(record.id)
        liveBytes -= record.bytes
      }
    }

    // Still over: only the agent's own content is left. Shed the oldest RESOLVED
    // ones. When nothing droppable remains we stop and report honestly instead
    // of thrashing records between syncs.
    if (liveBytes > limits.maxBytes) {
      const resolved = remaining()
        .filter((record) => record.source === 'agent' && isDecided(record))
        .sort(byMtimeThenId)
      for (const record of resolved) {
        if (liveBytes <= limits.maxBytes) break
        drop.add(record.id)
        liveBytes -= record.bytes
      }
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

/** An agent row the user has already answered; undecided rows are pending work. */
function isDecided(record: HistoryRecord): boolean {
  return record.decision === 'accepted' || record.decision === 'rejected'
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
