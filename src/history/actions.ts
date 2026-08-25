import { randomUUID } from 'node:crypto'
import type { HistoryDecision, HistoryIndex, HistoryLimits, HistoryRecord } from '../types.ts'
import type { HistoryStore } from './store.ts'
import { applyHunkUndo, hunkMatches, hunksFromTexts, type ReviewHunk } from './hunks.ts'

export interface ActionIo {
  store: HistoryStore
  sessionId: string
  writeFile(path: string, content: string): Promise<void>
  unlink(path: string): Promise<void>
  readFile(path: string): Promise<string | null>
  limits: HistoryLimits
}

function requireRecord(index: HistoryIndex, recordId: string): HistoryRecord {
  const record = index.records.find((item) => item.id === recordId)
  if (record === undefined) throw new Error(`record-not-found: ${recordId}`)
  return record
}

async function persist(io: ActionIo, index: HistoryIndex): Promise<HistoryIndex> {
  const next = io.store.gc(index, io.limits, Date.now())
  await io.store.save(next)
  return next
}

function decideFileFromHunks(record: HistoryRecord, before: string, after: string): void {
  const original = hunksFromTexts(before, after)
  const decided = record.hunks ?? {}
  if (original.length === 0) {
    if (Object.keys(decided).length === 0) return
  } else if (!original.every((hunk) => decided[hunk.key] !== undefined)) {
    return
  }
  record.decision = Object.values(decided).some((value) => value === 'rejected') ? 'rejected' : 'accepted'
}

async function beforeTextOf(io: ActionIo, record: HistoryRecord): Promise<string> {
  if (record.beforeHash === null) return ''
  try {
    return await io.store.readBlob(record.beforeHash)
  } catch {
    // The before-blob was gc-dropped (dangling reference); treat as no before.
    return ''
  }
}

export async function acceptFile(io: ActionIo, recordId: string): Promise<HistoryIndex> {
  return io.store.withLock(async () => {
    const index = await io.store.load()
    const record = requireRecord(index, recordId)
    record.decision = 'accepted'
    return persist(io, index)
  })
}

export async function rejectFile(io: ActionIo, recordId: string): Promise<HistoryIndex> {
  return io.store.withLock(async () => {
    const index = await io.store.load()
    const record = requireRecord(index, recordId)
    let restore: string | null = null
    if (record.beforeHash !== null) {
      try {
        restore = await io.store.readBlob(record.beforeHash)
      } catch {
        restore = null
      }
    }
    record.decision = 'rejected'
    const next = await persist(io, index)
    if (restore !== null) await io.writeFile(record.path, restore)
    else if (record.kind === 'add' && record.hash !== null) await io.unlink(record.path)
    return next
  })
}

export async function acceptHunk(io: ActionIo, recordId: string, hunkKey: string): Promise<HistoryIndex> {
  return io.store.withLock(async () => {
    const index = await io.store.load()
    const record = requireRecord(index, recordId)
    record.hunks = { ...record.hunks, [hunkKey]: 'accepted' }
    const before = await beforeTextOf(io, record)
    const after = record.hash === null ? '' : await io.store.readBlob(record.hash).catch(() => '')
    decideFileFromHunks(record, before, after)
    return persist(io, index)
  })
}

export async function rejectHunk(io: ActionIo, recordId: string, hunk: ReviewHunk): Promise<HistoryIndex> {
  return io.store.withLock(async () => {
    const index = await io.store.load()
    const record = requireRecord(index, recordId)
    const current = await io.readFile(record.path)
    if (current === null || !hunkMatches(current, hunk)) throw new Error('hunk-mismatch')
    const nextText = applyHunkUndo(current, hunk)
    const blob = await io.store.putBlob(nextText)
    const save: HistoryRecord = {
      id: randomUUID(),
      path: record.path,
      hash: blob.hash,
      beforeHash: record.hash,
      bytes: blob.bytes,
      mtime: Date.now(),
      source: 'save',
      kind: 'edit',
      sessionId: io.sessionId,
    }
    index.records.push(save)
    record.hunks = { ...record.hunks, [hunk.key]: 'rejected' }
    const before = await beforeTextOf(io, record)
    const after = record.hash === null ? '' : await io.store.readBlob(record.hash).catch(() => '')
    decideFileFromHunks(record, before, after)
    const next = await persist(io, index)
    await io.writeFile(record.path, nextText)
    return next
  })
}

export interface ReopenPayload {
  content?: string | null
  hunkKey?: string
}

/** Put a decided file or hunk back to pending; optionally restore disk. */
export async function reopenRecord(io: ActionIo, recordId: string, payload: ReopenPayload): Promise<HistoryIndex> {
  return io.store.withLock(async () => {
    const index = await io.store.load()
    const record = requireRecord(index, recordId)
    if (payload.hunkKey !== undefined) {
      const nextHunks = { ...record.hunks }
      delete nextHunks[payload.hunkKey]
      record.hunks = Object.keys(nextHunks).length === 0 ? undefined : nextHunks
    }
    record.decision = 'pending'
    const next = await persist(io, index)
    if (typeof payload.content === 'string') await io.writeFile(record.path, payload.content)
    return next
  })
}

export async function restoreSnapshot(io: ActionIo, recordId: string): Promise<HistoryIndex> {
  return io.store.withLock(async () => {
    const index = await io.store.load()
    const record = requireRecord(index, recordId)
    const previous = await io.readFile(record.path)
    if (previous !== null) {
      const blob = await io.store.putBlob(previous)
      index.records.push({
        id: randomUUID(),
        path: record.path,
        hash: blob.hash,
        beforeHash: record.hash,
        bytes: blob.bytes,
        mtime: Date.now(),
        source: 'save',
        kind: 'edit',
        sessionId: io.sessionId,
      })
    } else {
      index.records.push({
        id: randomUUID(),
        path: record.path,
        hash: null,
        beforeHash: record.hash,
        bytes: 0,
        mtime: Date.now(),
        source: 'save',
        kind: 'delete',
        sessionId: io.sessionId,
      })
    }
    const next = await persist(io, index)
    if (record.hash === null) await io.unlink(record.path)
    else await io.writeFile(record.path, await io.store.readBlob(record.hash))
    return next
  })
}
