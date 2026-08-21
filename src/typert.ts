/**
  * Hand-written host Typert manifest for the localHistory Remote. Registered
  * through `ctx.typert.register` when the registry exists. Strict codecs are
  * shared with the client; the gateway must not consult `@Remote` marker tables.
  */
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import { LOCAL_HISTORY_INVOCATIONS } from './contract.ts'

const METHODS: Array<{ name: string; signature: string }> = [
  { name: 'listReview', signature: 'listReview(sessionId: string, cwd?: string): Promise<{ records: HistoryRecord[]; pending: number }>' },
  { name: 'listTimeline', signature: 'listTimeline(sessionId: string, cwd: string | undefined, path: string): Promise<{ records: HistoryRecord[] }>' },
  { name: 'readBlob', signature: 'readBlob(sessionId: string, cwd: string | undefined, hash: string): Promise<{ content: string }>' },
  { name: 'readCurrent', signature: 'readCurrent(sessionId: string, cwd: string | undefined, path: string): Promise<{ content: string | null; binary: boolean }>' },
  { name: 'acceptFile', signature: 'acceptFile(sessionId: string, cwd: string | undefined, recordId: string): Promise<{ records: HistoryRecord[] }>' },
  { name: 'rejectFile', signature: 'rejectFile(sessionId: string, cwd: string | undefined, recordId: string): Promise<{ records: HistoryRecord[] }>' },
  { name: 'acceptHunk', signature: 'acceptHunk(sessionId: string, cwd: string | undefined, recordId: string, hunkKey: string): Promise<{ records: HistoryRecord[] }>' },
  { name: 'rejectHunk', signature: 'rejectHunk(sessionId: string, cwd: string | undefined, recordId: string, hunk: ReviewHunk): Promise<{ records: HistoryRecord[] }>' },
  { name: 'restore', signature: 'restore(sessionId: string, cwd: string | undefined, recordId: string): Promise<{ records: HistoryRecord[] }>' },
  { name: 'reopenRecord', signature: 'reopenRecord(sessionId: string, cwd: string | undefined, recordId: string, payload: ReopenPayload): Promise<{ records: HistoryRecord[] }>' },
  { name: 'getSettings', signature: 'getSettings(): LocalHistorySettings' },
  { name: 'updateSettings', signature: 'updateSettings(update: LocalHistorySettingsUpdate): Promise<LocalHistorySettings>' },
  { name: 'syncSession', signature: 'syncSession(sessionId: string, cwd: string | undefined, hits: AgentCardHit[]): Promise<{ pending: number }>' },
]

/** The localHistory namespace's host manifest (strict codecs shared with the client). */
export const TYPERT_MANIFEST: TypertContribution = {
  package: 'dsh-local-history',
  face: 'host',
  schemas: [],
  model: {
    services: [
      {
        key: 'localHistory',
        exportName: 'LocalHistoryRuntime',
        description: 'Session-scoped local history snapshots and AI change review.',
        tags: [],
        members: METHODS.map((method) => ({ kind: 'method' as const, ...method })),
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: LOCAL_HISTORY_INVOCATIONS,
}
