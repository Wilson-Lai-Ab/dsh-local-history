/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearReviewRevert } from '../src/client/review-revert.ts'
import { subscribeReviewChanged } from '../src/client/pending.ts'
import { createElement, type ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { hunksFromTexts } from '../src/history/hunks.ts'
import type { HistoryRecord } from '../src/types.ts'
import { DiffView } from '../src/client/DiffView.tsx'
import { lookup, zh } from '../src/client/locales.ts'
import type { LocalHistoryFace } from '../src/client/remote.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = false

const record: HistoryRecord = {
  id: 'rec-1',
  path: '/proj/src/app.ts',
  hash: 'after',
  beforeHash: 'before',
  bytes: 12,
  mtime: Date.now(),
  source: 'agent',
  kind: 'edit',
  sessionId: 'sess-1',
  turn: 1,
  decision: 'pending',
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value }
}

function fakeRemote(over: Partial<LocalHistoryFace> = {}): LocalHistoryFace {
  return {
    listReview: async () => ok({ records: [record], pending: 1 }),
    listTimeline: async () => ok({ records: [] }),
    readBlob: async () => ok({ content: 'a\n' }),
    readCurrent: async () => ok({ content: 'a\nB\n', binary: false }),
    acceptFile: async () => ok({ records: [] }),
    rejectFile: async () => ok({ records: [] }),
    acceptHunk: async () => ok({ records: [] }),
    rejectHunk: async () => ok({ records: [] }),
    restore: async () => ok({ records: [] }),
    reopenRecord: async () => ok({ records: [] }),
    getSettings: async () => ok({ watchEnabled: true, maxPerFile: 50, maxBytesMb: 200, retentionDays: 30 }),
    updateSettings: async () => ok({ watchEnabled: true, maxPerFile: 50, maxBytesMb: 200, retentionDays: 30 }),
    syncSession: async () => ok({ pending: 1 }),
    ...over,
  }
}

function mount(element: ReactElement): { root: Root; container: HTMLDivElement } {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  flushSync(() => { root.render(element) })
  return { root, container }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  flushSync(() => {})
}

function marks(container: HTMLDivElement): string[] {
  return [...container.querySelectorAll('.dsh_lh_rowLine')].map((row) => {
    const kind = row.getAttribute('data-mark') ?? ''
    const text = row.querySelector('.dsh_lh_code')?.textContent ?? ''
    return `${kind}:${text}`
  })
}

function undoFileButton(container: HTMLDivElement): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('.dsh_lh_reviewBar button')].find((item) => item.textContent === zh.undoFile) as HTMLButtonElement | undefined
}

afterEach(() => {
  document.body.replaceChildren()
  clearReviewRevert()
})

describe('DiffView', () => {
  it('diffs beforeHash against current disk, not the snapshot hash', async () => {
    const readBlob = vi.fn(async (_sessionId: string, _cwd: string | undefined, hash: string) => (
      ok({ content: hash === 'after' ? 'a\nB\n' : 'a\n' })
    ))
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote({
        readBlob,
        readCurrent: async () => ok({ content: 'a\nC\n', binary: false }),
      }),
      t: (key: string) => (zh as Record<string, string>)[key] ?? key,
    }))
    await flush()
    expect(marks(container)).toEqual(['ctx:a', 'add:C'])
    expect(container.querySelector('.dsh_lh_minimap')).not.toBeNull()
    expect(container.textContent).not.toContain('B')
    expect(readBlob.mock.calls.map((call) => call[2])).toEqual(['before'])
    root.unmount()
  })

  it('paints this snapshot against beforeHash when afterHash is set', async () => {
    const readCurrent = vi.fn(async () => ok({ content: 'live\n', binary: false }))
    const readBlob = vi.fn(async (_sessionId: string, _cwd: string | undefined, hash: string) => (
      ok({ content: hash === 'after' ? "export const x = 'new'\n" : "export const x = 'old'\n" })
    ))
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      afterHash: 'after',
      remote: fakeRemote({ readBlob, readCurrent }),
      t: (key: string) => (zh as Record<string, string>)[key] ?? key,
    }))
    await flush()
    expect(readCurrent).not.toHaveBeenCalled()
    expect(container.textContent).toContain("export const x = 'old'")
    expect(container.textContent).toContain("export const x = 'new'")
    expect(container.textContent).not.toContain('live')
    expect(container.querySelector('.dsh_lh_code')?.innerHTML).toContain('data-tok="kw"')
    expect(undoFileButton(container)).toBeDefined()
    root.unmount()
  })

  it('hides keep/undo on a decided file and only paints the diff', async () => {
    const { root, container } = mount(createElement(DiffView, {
      record: { ...record, decision: 'accepted' },
      sessionId: 'sess-1',
      cwd: '/proj',
      afterHash: 'after',
      remote: fakeRemote({
        readBlob: async (_sessionId: string, _cwd: string | undefined, hash: string) => (
          ok({ content: hash === 'after' ? 'keep\nnew\n' : 'keep\nold\n' })
        ),
      }),
      t: lookup,
    }))
    await flush()
    expect(container.querySelector('.dsh_lh_reviewBar')).toBeNull()
    expect(container.querySelector('.dsh_lh_inlineBar')).toBeNull()
    expect(container.querySelector('.dsh_lh_rowLine[data-mark="add"]')).not.toBeNull()
    root.unmount()
  })

  it('lets markdown files switch between preview and edit like the explorer editor', async () => {
    const { root, container } = mount(createElement(DiffView, {
      record: { ...record, path: '/proj/docs/note.md' },
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote({
        readCurrent: async () => ok({ content: '# Hello\n\nworld\n', binary: false }),
      }),
      t: lookup,
    }))
    await flush()
    const preview = [...container.querySelectorAll('button')].find((item) => item.textContent === zh.preview)
    const edit = [...container.querySelectorAll('button')].find((item) => item.textContent === zh.edit)
    expect(preview).toBeDefined()
    expect(edit).toBeDefined()
    expect(container.querySelector('.dsh_lh_file')).not.toBeNull()
    expect(container.querySelector('.dsh_lh_md')).toBeNull()
    flushSync(() => { preview!.click() })
    expect(container.querySelector('.dsh_lh_md')).not.toBeNull()
    expect(container.querySelector('.dsh_lh_file')).toBeNull()
    flushSync(() => { edit!.click() })
    expect(container.querySelector('.dsh_lh_file')).not.toBeNull()
    expect(container.querySelector('.dsh_lh_md')).toBeNull()
    root.unmount()
  })

  it('keeps the review bar when markdown preview throws', async () => {
    const { root, container } = mount(createElement(DiffView, {
      record: { ...record, path: '/proj/docs/note.md' },
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote({
        readCurrent: async () => ok({ content: '# Hello THROW_PREVIEW\n', binary: false }),
      }),
      t: lookup,
    }))
    await flush()
    const preview = [...container.querySelectorAll('button')].find((item) => item.textContent === zh.preview)
    flushSync(() => { preview!.click() })
    expect(container.querySelector('.dsh_lh_reviewBar')).not.toBeNull()
    expect(container.textContent).toContain(zh.loadFailed)
    expect([...container.querySelectorAll('button')].map((item) => item.textContent)).toContain(zh.edit)
    root.unmount()
  })

  it('does not show preview/edit on a plain source file', async () => {
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote(),
      t: lookup,
    }))
    await flush()
    expect([...container.querySelectorAll('button')].map((item) => item.textContent)).not.toContain(zh.preview)
    expect(container.querySelector('.dsh_lh_file')).not.toBeNull()
    root.unmount()
  })

  it('hides the review minimap when editorMinimap is off', async () => {
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote(),
      t: lookup,
      prefs: { getSnapshot: () => ({ prefs: { editorMinimap: false } }) },
    }))
    await flush()
    expect(container.querySelector('.dsh_lh_minimap')).toBeNull()
    root.unmount()
  })

  it('uses compareHash as the before side for an explicit Timeline compare', async () => {
    const readBlob = vi.fn(async (_sessionId: string, _cwd: string | undefined, hash: string) => (
      ok({ content: hash === 'cmp' ? 'OLD\n' : 'SNAP\n' })
    ))
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      compareHash: 'cmp',
      remote: fakeRemote({
        readBlob,
        readCurrent: async () => ok({ content: 'DISK\n', binary: false }),
      }),
      t: (key: string) => (zh as Record<string, string>)[key] ?? key,
    }))
    await flush()
    expect(marks(container)).toEqual(['del:OLD', 'add:DISK'])
    expect(container.textContent).not.toContain('SNAP')
    expect(readBlob.mock.calls.map((call) => call[2])).toEqual(['cmp'])
    root.unmount()
  })

  it('keeps unchanged lines and shows hunk accept/reject on the painted block', async () => {
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote({
        readBlob: async () => ok({ content: 'keep\nold\nkeep2\n' }),
        readCurrent: async () => ok({ content: 'keep\nnew\nkeep2\n', binary: false }),
      }),
      t: lookup,
    }))
    await flush()
    expect(marks(container)).toEqual(['ctx:keep', 'del:old', 'add:new', 'ctx:keep2'])
    const hunkBar = container.querySelector('.dsh_lh_inlineBar')
    expect(hunkBar).not.toBeNull()
    expect(hunkBar?.closest('.dsh_lh_block')).not.toBeNull()
    expect(hunkBar?.textContent).toContain(lookup('undoHunk', { range: '2' }))
    expect(hunkBar?.textContent).toContain(lookup('keepHunk', { range: '2' }))
    expect(container.textContent).toContain(zh.agentEdited)
    root.unmount()
  })

  it('click 拒绝 on a hunk calls rejectHunk', async () => {
    const rejectHunk = vi.fn(async () => ok({ records: [] }))
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote({
        readBlob: async () => ok({ content: 'keep\nold\nkeep2\n' }),
        readCurrent: async () => ok({ content: 'keep\nnew\nkeep2\n', binary: false }),
        rejectHunk,
      }),
      t: lookup,
    }))
    await flush()
    const button = [...container.querySelectorAll('.dsh_lh_inlineBar button')].find((item) => item.textContent?.includes(zh.undoFile))
    expect(button).toBeDefined()
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(rejectHunk).toHaveBeenCalled()
    expect(rejectHunk.mock.calls[0]?.[2]).toBe('rec-1')
    root.unmount()
  })

  it('loads the repaired beforeHash from listReview, not the stale tab record', async () => {
    const repaired = { ...record, beforeHash: 'full-before' }
    const readBlob = vi.fn(async (_sessionId: string, _cwd: string | undefined, hash: string) => {
      if (hash === 'full-before') return ok({ content: 'keep\nold\nkeep2\n' })
      if (hash === 'before') return ok({ content: 'old\n' })
      return ok({ content: 'keep\nnew\nkeep2\n' })
    })
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote({
        listReview: async () => ok({ records: [repaired], pending: 1 }),
        readBlob,
        readCurrent: async () => ok({ content: 'keep\nnew\nkeep2\n', binary: false }),
      }),
      t: lookup,
    }))
    await flush()
    expect(readBlob.mock.calls.map((call) => call[2])).toContain('full-before')
    expect(readBlob.mock.calls.map((call) => call[2])).not.toContain('before')
    expect(marks(container)).toEqual(['ctx:keep', 'del:old', 'add:new', 'ctx:keep2'])
    root.unmount()
  })

  it('remount keeps an already-accepted hunk settled from listReview', async () => {
    const hunk = hunksFromTexts('keep\nold\nkeep2\n', 'keep\nnew\nkeep2\n')[0]!
    const persisted = { ...record, hunks: { [hunk.key]: 'accepted' as const } }
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote({
        listReview: async () => ok({ records: [persisted], pending: 1 }),
        readBlob: async () => ok({ content: 'keep\nold\nkeep2\n' }),
        readCurrent: async () => ok({ content: 'keep\nnew\nkeep2\n', binary: false }),
      }),
      t: lookup,
    }))
    await flush()
    expect(marks(container)).toEqual(['ctx:keep', 'ctx:new', 'ctx:keep2'])
    expect(container.querySelector('.dsh_lh_inlineBar')).toBeNull()
    root.unmount()
  })

  it('Cmd+Z after keepFile does not paint loadFailed', async () => {
    const reopenRecord = vi.fn(async () => ok({ records: [] }))
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote({ reopenRecord }),
      t: lookup,
    }))
    await flush()
    const keep = [...container.querySelectorAll('.dsh_lh_reviewBar button')].find((item) => item.textContent === zh.keepFile)
    keep!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    container.querySelector('.dsh_lh_root')!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }))
    await flush()
    expect(reopenRecord).toHaveBeenCalledWith('sess-1', '/proj', 'rec-1', {})
    expect(container.textContent).not.toContain(zh.loadFailed)
    root.unmount()
  })

  it('acceptHunk turns that block into context and hides its buttons', async () => {
    const acceptHunk = vi.fn(async () => ok({ records: [] }))
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote({
        readBlob: async () => ok({ content: 'keep\nold\nkeep2\n' }),
        readCurrent: async () => ok({ content: 'keep\nnew\nkeep2\n', binary: false }),
        acceptHunk,
      }),
      t: lookup,
    }))
    await flush()
    const button = [...container.querySelectorAll('.dsh_lh_inlineBar button')].find((item) => item.textContent?.includes(zh.keepFile))
    expect(button).toBeDefined()
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(acceptHunk).toHaveBeenCalled()
    expect(marks(container)).toEqual(['ctx:keep', 'ctx:new', 'ctx:keep2'])
    expect(container.querySelector('.dsh_lh_inlineBar')).toBeNull()
    root.unmount()
  })

  it('rejectHunk reloads the live file instead of the frozen snapshot', async () => {
    const rejectHunk = vi.fn(async () => ok({ records: [] }))
    const readCurrent = vi.fn(async () => ok({ content: 'keep\nkeep2\n', binary: false }))
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      afterHash: 'after',
      remote: fakeRemote({
        readBlob: async (_sessionId: string, _cwd: string | undefined, hash: string) => (
          ok({ content: hash === 'after' ? 'keep\nnew\nkeep2\n' : 'keep\nold\nkeep2\n' })
        ),
        readCurrent,
        rejectHunk,
      }),
      t: lookup,
    }))
    await flush()
    expect(readCurrent).not.toHaveBeenCalled()
    const button = [...container.querySelectorAll('.dsh_lh_inlineBar button')].find((item) => item.textContent?.includes(zh.undoFile))
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(rejectHunk).toHaveBeenCalled()
    expect(readCurrent).toHaveBeenCalled()
    expect(marks(container)).toEqual(['ctx:keep', 'del:old', 'ctx:keep2'])
    root.unmount()
  })

  it('click 撤销 calls rejectFile with the record id', async () => {
    const rejectFile = vi.fn(async () => ok({ records: [] }))
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote({ rejectFile }),
      t: (key: string) => (zh as Record<string, string>)[key] ?? key,
    }))
    await flush()
    const button = undoFileButton(container)
    expect(button).toBeDefined()
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(rejectFile).toHaveBeenCalled()
    expect(rejectFile.mock.calls[0]?.[2]).toBe('rec-1')
    root.unmount()
  })

  it('file accept/reject calls onFileDone so the change tab can close', async () => {
    const onFileDone = vi.fn()
    const acceptFile = vi.fn(async () => ok({ records: [] }))
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote({ acceptFile }),
      t: (key: string) => (zh as Record<string, string>)[key] ?? key,
      onFileDone,
    }))
    await flush()
    const button = [...container.querySelectorAll('.dsh_lh_reviewBar button')].find((item) => item.textContent === zh.keepFile)
    expect(button).toBeDefined()
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(acceptFile).toHaveBeenCalled()
    expect(onFileDone).toHaveBeenCalled()
    root.unmount()
  })

  it('failed rejectFile shows loadFailed and does not treat as success', async () => {
    const onChanged = vi.fn()
    const rejectFile = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'rpc', message: 'nope', details: {} },
    }))
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote({ rejectFile }),
      t: (key: string) => (zh as Record<string, string>)[key] ?? key,
      onChanged,
    }))
    await flush()
    const button = undoFileButton(container)
    expect(button).toBeDefined()
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(container.textContent).toContain(zh.loadFailed)
    expect(onChanged).not.toHaveBeenCalled()
    root.unmount()
  })

  it('missing snapshot blob renders snapshotGone instead of loadFailed', async () => {
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote({
        readBlob: async () => ({
          ok: false as const,
          error: {
            code: 'rpc',
            message: 'ENOENT: no such file or directory, open /proj/.dsh/blobs/abc',
            details: {},
          },
        }),
      }),
      t: (key: string) => (zh as Record<string, string>)[key] ?? key,
    }))
    await flush()
    expect(container.textContent).toContain(zh.snapshotGone)
    expect(container.textContent).not.toContain(zh.loadFailed)
    root.unmount()
  })

  it('file accept notifies review listeners immediately', async () => {
    const listener = vi.fn()
    const stop = subscribeReviewChanged(listener)
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote(),
      t: lookup,
    }))
    await flush()
    const button = [...container.querySelectorAll('.dsh_lh_reviewBar button')].find((item) => item.textContent === zh.keepFile)
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(listener).toHaveBeenCalled()
    stop()
    root.unmount()
  })

  it('Cmd+Z after rejectFile reopens the file', async () => {
    const reopenRecord = vi.fn(async () => ok({ records: [] }))
    const rejectFile = vi.fn(async () => ok({ records: [] }))
    const { root, container } = mount(createElement(DiffView, {
      record,
      sessionId: 'sess-1',
      cwd: '/proj',
      remote: fakeRemote({ rejectFile, reopenRecord }),
      t: lookup,
    }))
    await flush()
    undoFileButton(container)!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    container.querySelector('.dsh_lh_root')!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }))
    await flush()
    expect(reopenRecord).toHaveBeenCalledWith('sess-1', '/proj', 'rec-1', expect.objectContaining({
      content: 'a\nB\n',
    }))
    root.unmount()
  })
})
