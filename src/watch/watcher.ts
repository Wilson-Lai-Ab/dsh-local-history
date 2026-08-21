import { statSync, watch, type FSWatcher } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { shouldSkipDir } from './ignore.ts'
import { sameCardPath, type AgentCardHit } from '../agent/cards.ts'
import { claimAgentCards } from '../agent/tag.ts'
import { sha256Hex, type HistoryStore } from '../history/store.ts'
import type { HistoryKind, HistoryLimits, HistoryRecord } from '../types.ts'

const DEBOUNCE_MS = 100

export interface WatchHandle {
  close(): void
}

export function pathHasSkippedSegment(absPath: string, cwd?: string): boolean {
  const rel = cwd !== undefined && absPath.startsWith(cwd) ? absPath.slice(cwd.length) : absPath
  return rel.split(/[\\/]/).filter(Boolean).some((segment) => shouldSkipDir(segment))
}

/**
  * Recursive `fs.watch` when the platform supports it. Skips ignored path
  * segments and debounces 100ms per absolute path before `onWrite`.
  */
export function startWatcher(cwd: string, onWrite: (absPath: string) => void): WatchHandle {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let closed = false
  let watcher: FSWatcher
  try {
    watcher = watch(cwd, { recursive: true, persistent: true }, (_event, filename) => {
      if (closed) return
      if (filename === null || filename === undefined || filename === '' || filename === '.') return
      const absPath = resolve(cwd, filename.toString())
      if (absPath === resolve(cwd)) return
      if (pathHasSkippedSegment(absPath, cwd)) return
      try {
        if (statSync(absPath).isDirectory()) return
      } catch {
        // missing path: still debounce so a delete can snapshot
      }
      const previous = timers.get(absPath)
      if (previous !== undefined) clearTimeout(previous)
      timers.set(absPath, setTimeout(() => {
        timers.delete(absPath)
        if (closed) return
        onWrite(absPath)
      }, DEBOUNCE_MS))
    })
    watcher.on('error', () => { /* unreadable cwd / deleted root */ })
  } catch {
    return { close() { /* cwd missing or unwatchable */ } }
  }
  return {
    close() {
      closed = true
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      watcher.close()
    },
  }
}

export interface WatchWriteInput {
  store: HistoryStore
  sessionId: string
  cwd?: string
  absPath: string
  limits: HistoryLimits
  hits: readonly AgentCardHit[]
  readCurrent(absPath: string): Promise<{ content: string | null; binary: boolean }>
}

function latestForPath(records: readonly HistoryRecord[], path: string): HistoryRecord | undefined {
  let latest: HistoryRecord | undefined
  for (const record of records) {
    if (!sameCardPath(record.path, path)) continue
    if (latest === undefined || record.mtime > latest.mtime || (record.mtime === latest.mtime && record.id > latest.id)) {
      latest = record
    }
  }
  return latest
}

function kindFrom(previousHash: string | null, currentHash: string | null, binary: boolean): HistoryKind {
  if (binary) return previousHash === null ? 'add' : 'edit'
  if (previousHash === null && currentHash !== null) return 'add'
  if (currentHash === null) return 'delete'
  return 'edit'
}

const BINARY_MARK = '__binary__'
const writeQueues = new Map<string, Map<string, Promise<void>>>()
/** Last successfully considered content hash per historyRoot+path (duplicate consecutive save is a no-op). */
const lastHash = new Map<string, Map<string, string | null>>()

function lastHashMap(historyRoot: string): Map<string, string | null> {
  let map = lastHash.get(historyRoot)
  if (map === undefined) {
    map = new Map()
    lastHash.set(historyRoot, map)
  }
  return map
}

function enqueueWrite(historyRoot: string, path: string, task: () => Promise<void>): Promise<void> {
  let perPath = writeQueues.get(historyRoot)
  if (perPath === undefined) {
    perPath = new Map()
    writeQueues.set(historyRoot, perPath)
  }
  const previous = perPath.get(path) ?? Promise.resolve()
  const next = previous.then(task, task).catch(() => { /* previous write or disk gone */ })
  perPath.set(path, next)
  return next
}

async function snapshotSave(input: WatchWriteInput): Promise<void> {
  const path = resolve(input.absPath)
  const seen = lastHashMap(input.store.historyRoot)
  const current = await input.readCurrent(path)
  const hash = current.binary ? BINARY_MARK : current.content === null ? null : sha256Hex(current.content)
  if (seen.has(path) && seen.get(path) === hash) return
  // Load the index and derive `previousHash` inside the store lock so a
  // concurrent writer can never drop the referenced blob between our load and
  // append (which previously produced dangling beforeHash references).
  await input.store.withLock(async () => {
    const index = await input.store.load()
    const latest = latestForPath(index.records, path)
    const previousHash = latest?.hash ?? null
    if (!current.binary && previousHash === hash) {
      seen.set(path, hash)
      return
    }
    if (current.binary) {
      if (latest !== undefined && latest.hash === null && latest.kind !== 'delete') {
        seen.set(path, BINARY_MARK)
        return
      }
      const record: HistoryRecord = {
        id: randomUUID(),
        path,
        hash: null,
        beforeHash: previousHash,
        bytes: 0,
        mtime: Date.now(),
        source: 'save',
        kind: kindFrom(previousHash, null, true),
        sessionId: input.sessionId,
      }
      await input.store.append(record, input.limits, Date.now())
      seen.set(path, BINARY_MARK)
      return
    }
    if (current.content === null) {
      if (previousHash === null && latest === undefined) return
      const record: HistoryRecord = {
        id: randomUUID(),
        path,
        hash: null,
        beforeHash: previousHash,
        bytes: 0,
        mtime: Date.now(),
        source: 'save',
        kind: 'delete',
        sessionId: input.sessionId,
      }
      await input.store.append(record, input.limits, Date.now())
      seen.set(path, null)
      return
    }
    const blob = await input.store.putBlob(current.content)
    const record: HistoryRecord = {
      id: randomUUID(),
      path,
      hash: blob.hash,
      beforeHash: previousHash,
      bytes: blob.bytes,
      mtime: Date.now(),
      source: 'save',
      kind: kindFrom(previousHash, blob.hash, false),
      sessionId: input.sessionId,
    }
    await input.store.append(record, input.limits, Date.now())
    seen.set(path, blob.hash)
  })
}

/** Claim an unclaimed agent hit for this path, else append a non-duplicate save. */
export async function handleWatchWrite(input: WatchWriteInput): Promise<void> {
  const absPath = resolve(input.absPath)
  if (pathHasSkippedSegment(absPath, input.cwd)) return
  const next = { ...input, absPath }
  return enqueueWrite(input.store.historyRoot, absPath, async () => {
    const matched = input.hits.filter((hit) => sameCardPath(hit.path, absPath))
    if (matched.length > 0) {
      const claimed = await claimAgentCards({
        store: input.store,
        sessionId: input.sessionId,
        cwd: input.cwd,
        hits: matched,
        limits: input.limits,
        readCurrent: input.readCurrent,
      })
      if (claimed.length > 0) return
    }
    await snapshotSave(next)
  })
}
