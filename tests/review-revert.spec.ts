import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyReviewRevert,
  clearReviewRevert,
  peekReviewUndo,
  popReviewRedo,
  popReviewUndo,
  pushReviewRevert,
  type ReviewRevert,
} from '../src/client/review-revert.ts'
import type { LocalHistoryFace } from '../src/client/remote.ts'

const sample: ReviewRevert = {
  kind: 'file-reject',
  sessionId: 'sess-1',
  cwd: '/proj',
  recordId: 'rec-1',
  path: '/proj/a.ts',
  previous: 'old\n',
  next: 'new\n',
}

afterEach(() => {
  clearReviewRevert()
})

describe('review revert stack', () => {
  it('Cmd+Z pops the last review action; Shift+Z redoes it', () => {
    pushReviewRevert(sample)
    expect(peekReviewUndo()?.recordId).toBe('rec-1')
    expect(popReviewUndo()?.previous).toBe('old\n')
    expect(popReviewUndo()).toBeUndefined()
    expect(popReviewRedo()?.next).toBe('new\n')
  })

  it('undo reopens the record with previous disk contents', async () => {
    const reopenRecord = vi.fn(async () => ({ ok: true as const, value: { records: [] } }))
    const remote = { reopenRecord } as unknown as LocalHistoryFace
    await applyReviewRevert(remote, sample, 'undo')
    expect(reopenRecord).toHaveBeenCalledWith('sess-1', '/proj', 'rec-1', {
      content: 'old\n',
    })
  })

  it('undo of file-accept sends an empty payload, never undefined keys', async () => {
    const reopenRecord = vi.fn(async () => ({ ok: true as const, value: { records: [] } }))
    const remote = { reopenRecord } as unknown as LocalHistoryFace
    await applyReviewRevert(remote, { ...sample, kind: 'file-accept', previous: undefined }, 'undo')
    expect(reopenRecord).toHaveBeenCalledWith('sess-1', '/proj', 'rec-1', {})
    const payload = reopenRecord.mock.calls[0]?.[3] as Record<string, unknown>
    expect(Object.keys(payload)).toEqual([])
    expect(JSON.stringify(payload)).toBe('{}')
  })

  it('redo of a file reject calls rejectFile again', async () => {
    const rejectFile = vi.fn(async () => ({ ok: true as const, value: { records: [] } }))
    const remote = { rejectFile } as unknown as LocalHistoryFace
    await applyReviewRevert(remote, sample, 'redo')
    expect(rejectFile).toHaveBeenCalledWith('sess-1', '/proj', 'rec-1')
  })
})
