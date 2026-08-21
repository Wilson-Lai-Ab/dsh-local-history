import { randomUUID } from 'node:crypto'
import type { HistoryKind, HistoryLimits, HistoryRecord } from '../types.ts'
import type { HistoryStore } from '../history/store.ts'
import { reconstructBefore } from '../history/hunks.ts'
import {
  collectSessionEdits,
  sameCardPath,
  type AgentCardHit,
} from './cards.ts'

export {
  collectSessionEdits,
  diffsOf,
  oldTextOf,
  resolveProjectPath,
  reviewLocations,
  sameCardPath,
} from './cards.ts'
export type { AgentCardHit, AgentEditKind, FileDiffHunk } from './cards.ts'

export interface ClaimInput {
  store: HistoryStore
  sessionId: string
  cwd?: string
  /** Conversation nodes; ignored when `hits` is provided. */
  nodes?: readonly unknown[]
  /** Compact card list collected on the client (preferred v1 wire shape). */
  hits?: readonly AgentCardHit[]
  limits: HistoryLimits
  /** Disk reader used ONLY to persist the *new* blob after a card, never as before. */
  readCurrent(absPath: string): Promise<{ content: string | null; binary: boolean }>
}

function sameTurn(a: number | undefined, b: number | undefined): boolean {
  return a === b
}

function claimedBy(record: HistoryRecord, sessionId: string, path: string, turn: number | undefined): boolean {
  if (record.source !== 'agent') return false
  if (!sameCardPath(record.path, path)) return false
  const sessionMatch = record.sessionId === sessionId || record.agentSessionId === sessionId
  if (!sessionMatch) return false
  return sameTurn(record.turn, turn)
}

function latestHashForPath(records: readonly HistoryRecord[], path: string): string | null {
  let latest: HistoryRecord | undefined
  for (const record of records) {
    if (!sameCardPath(record.path, path)) continue
    if (latest === undefined || record.mtime > latest.mtime || (record.mtime === latest.mtime && record.id > latest.id)) {
      latest = record
    }
  }
  return latest?.hash ?? null
}

async function beforeHashOf(
  store: HistoryStore,
  records: readonly HistoryRecord[],
  hit: AgentCardHit,
  current: string | null,
): Promise<{ beforeHash: string | null; kind: HistoryKind }> {
  let kind: HistoryKind = hit.kind
  if (typeof current === 'string' && hit.diffs !== undefined && hit.diffs.length > 0) {
    const reconstructed = reconstructBefore(current, hit.diffs)
    if (reconstructed !== null) {
      const blob = await store.putBlob(reconstructed)
      if (kind === 'add' && reconstructed !== '') kind = 'edit'
      return { beforeHash: blob.hash, kind }
    }
  }
  const previous = latestHashForPath(records, hit.path)
  if (typeof hit.oldText === 'string') {
    if (looksLikeHunkSnippet(hit.oldText, current) && previous !== null && (await store.hasBlob(previous))) {
      return { beforeHash: previous, kind: kind === 'add' ? 'edit' : kind }
    }
    const blob = await store.putBlob(hit.oldText)
    return { beforeHash: blob.hash, kind }
  }
  if (hit.oldText === null) {
    return { beforeHash: null, kind: 'add' }
  }
  if (previous === null) kind = 'add'
  else if (kind !== 'delete') kind = 'edit'
  if (previous !== null && !(await store.hasBlob(previous))) {
    // The previous snapshot was gc-dropped; never reference a missing blob.
    return { beforeHash: null, kind: kind === 'add' ? 'add' : 'edit' }
  }
  return { beforeHash: previous, kind }
}

function looksLikeHunkSnippet(oldText: string, current: string | null): boolean {
  if (current === null || current === '') return false
  const oldLines = oldText === '' ? [] : oldText.split('\n')
  const newLines = current === '' ? [] : current.split('\n')
  return oldLines.length * 2 < newLines.length
}

async function repairSnippetBefore(
  input: ClaimInput,
  hit: AgentCardHit,
  record: HistoryRecord,
): Promise<void> {
  if (record.beforeHash === null) return
  if (hit.diffs === undefined || hit.diffs.length === 0) return
  const current = await input.readCurrent(hit.path)
  if (typeof current.content !== 'string') return
  let stored: string
  try {
    stored = await input.store.readBlob(record.beforeHash)
  } catch {
    // The before-blob was dropped by a concurrent gc sweep (lost-update race
    // between load and append). Heal the record so later diff reads and syncs
    // stop failing on the dangling reference instead of surfacing "加载失败".
    const index = await input.store.load()
    const target = index.records.find((item) => item.id === record.id)
    if (target !== undefined) {
      let changed = false
      if (target.beforeHash !== null) {
        target.beforeHash = null
        changed = true
      }
      if (target.hash !== null && !(await input.store.hasBlob(target.hash))) {
        target.hash = null
        target.bytes = 0
        changed = true
      }
      if (changed) await input.store.save(index)
    }
    return
  }
  const reconstructed = reconstructBefore(current.content, hit.diffs)
  if (reconstructed === null || reconstructed === stored) return
  const blob = await input.store.putBlob(reconstructed)
  if (blob.hash === record.beforeHash) return
  record.beforeHash = blob.hash
  if (record.kind === 'add' && reconstructed !== '') record.kind = 'edit'
  const index = await input.store.load()
  const target = index.records.find((item) => item.id === record.id)
  if (target === undefined) return
  target.beforeHash = blob.hash
  if (target.kind === 'add' && reconstructed !== '') target.kind = 'edit'
  await input.store.save(index)
}

export async function claimAgentCards(input: ClaimInput): Promise<HistoryRecord[]> {
  const hits = input.hits ?? collectSessionEdits(input.nodes ?? [], input.cwd)
  const claimed: HistoryRecord[] = []
  for (const hit of hits) {
    // Each hit is processed atomically: the store lock spans load → decide →
    // append, so a concurrent writer can no longer drop a blob the new record
    // is about to reference, and no stale save can resurrect dropped records.
    try {
      const saved = await input.store.withLock(async () => {
        const index = await input.store.load()
        const already = index.records.find((record) => claimedBy(record, input.sessionId, hit.path, hit.turn))
        if (already !== undefined) {
          await repairSnippetBefore(input, hit, already)
          return undefined
        }

        const current = await input.readCurrent(hit.path)
        const { beforeHash, kind: fromBefore } = await beforeHashOf(input.store, index.records, hit, current.content)
        let kind: HistoryKind = fromBefore
        let hash: string | null
        let bytes: number
        if (current.binary) {
          hash = null
          bytes = 0
          if (kind === 'delete') kind = beforeHash === null ? 'add' : 'edit'
        } else if (current.content === null) {
          kind = 'delete'
          hash = null
          bytes = 0
        } else {
          const blob = await input.store.putBlob(current.content)
          hash = blob.hash
          bytes = blob.bytes
          if (beforeHash === null) kind = 'add'
        }

        const record: HistoryRecord = {
          id: randomUUID(),
          path: hit.path,
          hash,
          beforeHash,
          bytes,
          mtime: Date.now(),
          source: 'agent',
          kind,
          sessionId: input.sessionId,
          decision: 'pending',
        }
        if (hit.turn !== undefined) record.turn = hit.turn
        const next = await input.store.append(record, input.limits, Date.now())
        await acceptEarlierPending(input.store, hit.path, record.id)
        return next.records.find((item) => item.id === record.id)
      })
      if (saved !== undefined) claimed.push(saved)
    } catch {
      // One bad hit (e.g. an already-dangling blob) must not abort the whole
      // review sync; remaining hits still get claimed.
    }
  }
  return claimed
}

/** A later write of the same path supersedes earlier pending review. */
async function acceptEarlierPending(store: HistoryStore, path: string, keepId: string): Promise<void> {
  const index = await store.load()
  let changed = false
  for (const record of index.records) {
    if (record.id === keepId) continue
    if (record.source !== 'agent') continue
    if (!sameCardPath(record.path, path)) continue
    if ((record.decision ?? 'pending') !== 'pending') continue
    record.decision = 'accepted'
    changed = true
  }
  if (changed) await store.save(index)
}
