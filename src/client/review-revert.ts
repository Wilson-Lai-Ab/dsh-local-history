/**
 * Review-tab Cmd+Z stack. Independent of the sidebar editor history.
 * One chronological stack; a path filter pops the latest action on that file.
 */
import type { ReviewHunk } from '../history/hunks.ts'
import type { LocalHistoryFace } from './remote.ts'
import { unwrapResult } from './remote.ts'

export type ReviewRevertKind = 'file-accept' | 'file-reject' | 'hunk-accept' | 'hunk-reject'

export interface ReviewRevert {
  kind: ReviewRevertKind
  sessionId: string
  cwd?: string
  recordId: string
  path: string
  previous?: string | null
  next?: string | null
  hunkKey?: string
  hunk?: ReviewHunk
}

const undo: ReviewRevert[] = []
const redo: ReviewRevert[] = []

function matches(entry: ReviewRevert, sessionId?: string, path?: string): boolean {
  if (sessionId !== undefined && entry.sessionId !== sessionId) return false
  if (path !== undefined && entry.path !== path) return false
  return true
}

function lastIndex(stack: ReviewRevert[], sessionId?: string, path?: string): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i]
    if (entry !== undefined && matches(entry, sessionId, path)) return i
  }
  return -1
}

export function reviewRevertKey(sessionId: string, path: string): string {
  return `${sessionId}\n${path}`
}

export function pushReviewRevert(entry: ReviewRevert): void {
  undo.push(entry)
  redo.length = 0
}

export function peekReviewUndo(sessionId?: string, path?: string): ReviewRevert | undefined {
  const index = lastIndex(undo, sessionId, path)
  return index === -1 ? undefined : undo[index]
}

export function popReviewUndo(sessionId?: string, path?: string): ReviewRevert | undefined {
  const index = lastIndex(undo, sessionId, path)
  if (index === -1) return undefined
  const [entry] = undo.splice(index, 1)
  if (entry === undefined) return undefined
  redo.push(entry)
  return entry
}

export function popReviewRedo(sessionId?: string, path?: string): ReviewRevert | undefined {
  const index = lastIndex(redo, sessionId, path)
  if (index === -1) return undefined
  const [entry] = redo.splice(index, 1)
  if (entry === undefined) return undefined
  undo.push(entry)
  return entry
}

function reopenPayloadOf(entry: ReviewRevert): { content?: string | null; hunkKey?: string } {
  const payload: { content?: string | null; hunkKey?: string } = {}
  if (entry.kind !== 'file-accept' && entry.kind !== 'hunk-accept') {
    payload.content = entry.previous ?? null
  }
  if (entry.hunkKey !== undefined) payload.hunkKey = entry.hunkKey
  return payload
}

export async function applyReviewRevert(
  remote: LocalHistoryFace,
  entry: ReviewRevert,
  direction: 'undo' | 'redo',
): Promise<void> {
  const { sessionId, cwd, recordId } = entry
  if (direction === 'undo') {
    unwrapResult(await remote.reopenRecord(sessionId, cwd, recordId, reopenPayloadOf(entry)))
    return
  }
  if (entry.kind === 'file-accept') {
    unwrapResult(await remote.acceptFile(sessionId, cwd, recordId))
    return
  }
  if (entry.kind === 'file-reject') {
    unwrapResult(await remote.rejectFile(sessionId, cwd, recordId))
    return
  }
  if (entry.kind === 'hunk-accept' && entry.hunkKey !== undefined) {
    unwrapResult(await remote.acceptHunk(sessionId, cwd, recordId, entry.hunkKey))
    return
  }
  if (entry.kind === 'hunk-reject' && entry.hunk !== undefined) {
    unwrapResult(await remote.rejectHunk(sessionId, cwd, recordId, entry.hunk))
  }
}

export function clearReviewRevert(): void {
  undo.length = 0
  redo.length = 0
}
