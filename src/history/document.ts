import { join } from 'node:path'
import type {
  HistoryDecision,
  HistoryIndex,
  HistoryKind,
  HistoryRecord,
  HistorySource,
} from '../types.ts'

const SOURCES = new Set<HistorySource>(['agent', 'save'])
const KINDS = new Set<HistoryKind>(['add', 'edit', 'delete'])
const DECISIONS = new Set<HistoryDecision>(['pending', 'accepted', 'rejected'])
const HUNK_DECISIONS = new Set(['accepted', 'rejected'])

export function emptyIndex(): HistoryIndex {
  return { version: 1, records: [] }
}

export function blobPath(historyRoot: string, hash: string): string {
  return join(historyRoot, 'blobs', hash)
}

export function parseIndex(raw: unknown): HistoryIndex {
  if (!isPlainObject(raw)) return emptyIndex()
  if (raw.version !== 1) return emptyIndex()
  if (!Array.isArray(raw.records)) return emptyIndex()
  const records: HistoryRecord[] = []
  for (const item of raw.records) {
    const record = parseRecord(item)
    if (record === null) return emptyIndex()
    records.push(record)
  }
  return { version: 1, records }
}

function parseRecord(raw: unknown): HistoryRecord | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.id !== 'string') return null
  if (typeof raw.path !== 'string') return null
  if (!isHash(raw.hash) || !isHash(raw.beforeHash)) return null
  if (typeof raw.bytes !== 'number' || !Number.isFinite(raw.bytes)) return null
  if (typeof raw.mtime !== 'number' || !Number.isFinite(raw.mtime)) return null
  if (typeof raw.source !== 'string' || !SOURCES.has(raw.source as HistorySource)) return null
  if (typeof raw.kind !== 'string' || !KINDS.has(raw.kind as HistoryKind)) return null
  if (typeof raw.sessionId !== 'string') return null

  const record: HistoryRecord = {
    id: raw.id,
    path: raw.path,
    hash: raw.hash,
    beforeHash: raw.beforeHash,
    bytes: raw.bytes,
    mtime: raw.mtime,
    source: raw.source as HistorySource,
    kind: raw.kind as HistoryKind,
    sessionId: raw.sessionId,
  }

  if (raw.turn !== undefined) {
    if (typeof raw.turn !== 'number' || !Number.isFinite(raw.turn)) return null
    record.turn = raw.turn
  }
  if (raw.agentSessionId !== undefined) {
    if (typeof raw.agentSessionId !== 'string') return null
    record.agentSessionId = raw.agentSessionId
  }
  if (raw.decision !== undefined) {
    if (typeof raw.decision !== 'string' || !DECISIONS.has(raw.decision as HistoryDecision)) return null
    record.decision = raw.decision as HistoryDecision
  }
  if (raw.hunks !== undefined) {
    const hunks = parseHunks(raw.hunks)
    if (hunks === null) return null
    record.hunks = hunks
  }
  return record
}

function parseHunks(raw: unknown): Record<string, 'accepted' | 'rejected'> | null {
  if (!isPlainObject(raw)) return null
  const hunks: Record<string, 'accepted' | 'rejected'> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string' || !HUNK_DECISIONS.has(value)) return null
    hunks[key] = value as 'accepted' | 'rejected'
  }
  return hunks
}

function isHash(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
