/**
 * Client-side Typert Remote contribution for localHistory.
 * Resolve the mounted face with `ctx.reflect.get('remote.localHistory')`,
 * never the dotted `ctx.remote.localHistory` read.
 */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { AgentCardHit } from '../agent/cards.ts'
import type { ReviewHunk } from '../history/hunks.ts'
import type { LocalHistorySettings, LocalHistorySettingsUpdate } from '../contract.ts'
import { LOCAL_HISTORY_INVOCATIONS } from '../contract.ts'
import type { HistoryRecord } from '../types.ts'

export type { AgentCardHit, HistoryRecord, ReviewHunk, LocalHistorySettings, LocalHistorySettingsUpdate }

export type LocalHistoryRemoteResult<T> = RemoteResult<T>

/** Callable face of the mounted localHistory namespace. */
export interface LocalHistoryFace {
  listReview(sessionId: string, cwd?: string): Promise<RemoteResult<{ records: HistoryRecord[]; pending: number }>>
  listTimeline(sessionId: string, cwd: string | undefined, path: string): Promise<RemoteResult<{ records: HistoryRecord[] }>>
  readBlob(sessionId: string, cwd: string | undefined, hash: string): Promise<RemoteResult<{ content: string }>>
  readCurrent(sessionId: string, cwd: string | undefined, path: string): Promise<RemoteResult<{ content: string | null; binary: boolean }>>
  acceptFile(sessionId: string, cwd: string | undefined, recordId: string): Promise<RemoteResult<{ records: HistoryRecord[] }>>
  rejectFile(sessionId: string, cwd: string | undefined, recordId: string): Promise<RemoteResult<{ records: HistoryRecord[] }>>
  acceptHunk(sessionId: string, cwd: string | undefined, recordId: string, hunkKey: string): Promise<RemoteResult<{ records: HistoryRecord[] }>>
  rejectHunk(sessionId: string, cwd: string | undefined, recordId: string, hunk: ReviewHunk): Promise<RemoteResult<{ records: HistoryRecord[] }>>
  restore(sessionId: string, cwd: string | undefined, recordId: string): Promise<RemoteResult<{ records: HistoryRecord[] }>>
  reopenRecord(sessionId: string, cwd: string | undefined, recordId: string, payload: { content?: string | null; hunkKey?: string }): Promise<RemoteResult<{ records: HistoryRecord[] }>>
  getSettings(): Promise<RemoteResult<LocalHistorySettings>>
  updateSettings(update: LocalHistorySettingsUpdate): Promise<RemoteResult<LocalHistorySettings>>
  syncSession(sessionId: string, cwd: string | undefined, hits: AgentCardHit[]): Promise<RemoteResult<{ pending: number }>>
}

/** The localHistory Remote namespace's client contribution. */
export const LOCAL_HISTORY_REMOTE: TypertRemoteContribution = {
  package: 'dsh-local-history',
  descriptors: LOCAL_HISTORY_INVOCATIONS,
}

export function unwrapResult<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

export function isRemoteOk<T>(result: RemoteResult<T>): result is { ok: true; value: T } {
  return result.ok === true
}
