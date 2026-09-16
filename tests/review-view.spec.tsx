/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyReviewChanged } from '../src/client/pending.ts'
import { clearReviewRevert } from '../src/client/review-revert.ts'
import { createElement, type ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import type { HistoryRecord } from '../src/types.ts'
import { ReviewApp } from '../src/client/ReviewView.tsx'
import { lookup, zh } from '../src/client/locales.ts'
import type { LocalHistoryFace } from '../src/client/remote.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = false

const pending: HistoryRecord = {
  id: 'rec-1',
  path: '/proj/src/app.ts',
  hash: 'after',
  beforeHash: 'before',
  bytes: 12,
  mtime: Date.now(),
  source: 'agent',
  kind: 'edit',
  sessionId: 'sess-1',
  turn: 2,
  decision: 'pending',
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value }
}

function fakeRemote(over: Partial<LocalHistoryFace> = {}): LocalHistoryFace {
  return {
    listReview: async () => ok({ records: [pending], pending: 1 }),
    listTimeline: async () => ok({ records: [] }),
    readBlob: async () => ok({ content: 'old\n' }),
    readCurrent: async () => ok({ content: 'new\n', binary: false }),
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

function click(element: Element | null): void {
  expect(element).not.toBeNull()
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

afterEach(() => {
  document.body.replaceChildren()
  clearReviewRevert()
})

describe('ReviewApp', () => {
  it('lists pending records after syncSession then listReview', async () => {
    const remote = fakeRemote()
    const { root, container } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote,
      t: lookup,
    }))
    await flush()
    expect(container.textContent).toContain('app.ts')
    expect(container.textContent).toContain('src')
    expect(container.textContent).toContain('M')
    expect(container.textContent).toContain(zh.keepAll)
    expect(container.textContent).toContain(zh.undoAll)
    expect(container.querySelector('[data-lh-undo]')).toBeNull()
    expect(container.querySelector('[data-lh-keep]')).toBeNull()
    expect(container.querySelector('[data-lh-timeline]')?.textContent).toBe('▸')
    expect(container.querySelector('[data-lh-diff]')).toBeNull()
    root.unmount()
  })

  it('clicking the file name opens this change for review and keeps the list', async () => {
    const onOpenReview = vi.fn()
    const { root, container } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote: fakeRemote(),
      t: lookup,
      onOpenReview,
    }))
    await flush()
    click(container.querySelector('.dsh_lh_rowMain'))
    expect(onOpenReview).toHaveBeenCalledWith(expect.objectContaining({
      id: 'rec-1',
      path: '/proj/src/app.ts',
    }))
    expect(container.querySelector('[data-lh-review]')).not.toBeNull()
    expect(container.querySelector('[data-lh-snapshot]')).toBeNull()
    root.unmount()
  })

  it('chevron expands the path timeline under the row', async () => {
    const { root, container } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote: fakeRemote(),
      t: lookup,
    }))
    await flush()
    click(container.querySelector('[data-lh-timeline]'))
    await flush()
    expect(container.querySelector('[data-lh-timeline]')?.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('[data-lh-timeline]')?.textContent).toBe('▾')
    root.unmount()
  })

  it('pending hides an earlier turn of the same file', async () => {
    const first: HistoryRecord = { ...pending, id: 'rec-t1', turn: 1, mtime: 1 }
    const second: HistoryRecord = { ...pending, id: 'rec-t2', turn: 2, mtime: 2 }
    const remote = fakeRemote({
      listReview: async () => ok({ records: [first, second], pending: 1 }),
    })
    const { root, container } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote,
      t: lookup,
    }))
    await flush()
    expect(container.querySelectorAll('[data-lh-row]')).toHaveLength(1)
    expect(container.textContent).toContain(zh.turn.replace('{n}', '2'))
    expect(container.textContent).not.toContain(zh.turn.replace('{n}', '1'))
    root.unmount()
  })

  it('merges an auto-continued turn into the user round that opened it', async () => {
    const records: HistoryRecord[] = [
      { ...pending, id: 'rec-1', turn: 1, path: '/proj/src/one.ts', hash: 'h1', beforeHash: 'b1' },
      { ...pending, id: 'rec-2', turn: 2, path: '/proj/src/two.ts', hash: 'h2', beforeHash: 'b2' },
      { ...pending, id: 'rec-3', turn: 3, path: '/proj/src/three.ts', hash: 'h3', beforeHash: 'b3' },
    ]
    const event = (type: string, data: unknown) => ({ type: 'event', event: { type, data } })
    const sessions = {
      list: {
        getSnapshot: () => ({ current: 'sess-1', byId: { 'sess-1': { id: 'sess-1', cwd: '/proj' } } }),
      },
      binding: () => ({
        eventSource: {
          getSnapshot: () => ({
            entries: [
              event('turn/start', { turn: 1 }),
              event('user/message', { content: [{ type: 'text', text: '第一问' }], source: { kind: 'user' } }),
              event('turn/start', { turn: 2 }),
              event('turn/start', { turn: 3 }),
              event('user/message', { content: [{ type: 'text', text: '第二问' }], source: { kind: 'user' } }),
            ],
          }),
        },
      }),
    }
    const { root, container } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote: fakeRemote({ listReview: async () => ok({ records, pending: 3 }) }),
      sessions,
      t: lookup,
    }))
    await flush()
    const groups = [...container.querySelectorAll('.dsh_lh_group')]
    // turn 1 and the auto-continued turn 2 are ONE round carrying both files.
    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.querySelector('.dsh_lh_groupTurn')?.textContent))
      .toEqual([zh.turn.replace('{n}', '2'), zh.turn.replace('{n}', '1')])
    expect(groups.map((group) => group.querySelector('.dsh_lh_groupPrompt')?.textContent))
      .toEqual(['第二问', '第一问'])
    expect(groups[1]?.querySelectorAll('[data-lh-row]')).toHaveLength(2)
    expect(container.textContent).not.toContain(zh.noPrompt)
    root.unmount()
  })

  it('keeps prompts but no round ordinal when the event window misses the session start', async () => {
    const records: HistoryRecord[] = [
      { ...pending, id: 'rec-9', turn: 9, path: '/proj/src/nine.ts', hash: 'h9', beforeHash: 'b9' },
    ]
    const event = (type: string, data: unknown) => ({ type: 'event', event: { type, data } })
    const sessions = {
      list: {
        getSnapshot: () => ({ current: 'sess-1', byId: { 'sess-1': { id: 'sess-1', cwd: '/proj' } } }),
      },
      binding: () => ({
        eventSource: {
          getSnapshot: () => ({
            hasMore: true,
            entries: [
              event('turn/start', { turn: 9 }),
              event('user/message', { content: [{ type: 'text', text: '很久以后的第九问' }], source: { kind: 'user' } }),
            ],
          }),
        },
      }),
    }
    const { root, container } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote: fakeRemote({ listReview: async () => ok({ records, pending: 1 }) }),
      sessions,
      t: lookup,
    }))
    await flush()
    expect(container.querySelector('.dsh_lh_groupPrompt')?.textContent).toBe('很久以后的第九问')
    // Falls back to the engine turn rather than inventing "第 1 轮".
    expect(container.querySelector('.dsh_lh_groupTurn')?.textContent).toBe(zh.turn.replace('{n}', '9'))
    root.unmount()
  })

  it('keeps one group per turn when the window is paged and records span several turns', async () => {
    // C1 regression guard: a paged window yields no ordinals, so grouping must
    // still key off each round's own turn. Keying off the ordinal merged every
    // turn into a single group.
    const records: HistoryRecord[] = [
      { ...pending, id: 'rec-24', turn: 24, path: '/proj/src/a.ts', hash: 'h24', beforeHash: 'b24' },
      { ...pending, id: 'rec-25', turn: 25, path: '/proj/src/b.ts', hash: 'h25', beforeHash: 'b25' },
      { ...pending, id: 'rec-26', turn: 26, path: '/proj/src/c.ts', hash: 'h26', beforeHash: 'b26' },
    ]
    const event = (type: string, data: unknown) => ({ type: 'event', event: { type, data } })
    const sessions = {
      list: {
        getSnapshot: () => ({ current: 'sess-1', byId: { 'sess-1': { id: 'sess-1', cwd: '/proj' } } }),
      },
      binding: () => ({
        eventSource: {
          getSnapshot: () => ({
            hasMore: true,
            entries: [
              event('turn/start', { turn: 24 }),
              event('user/message', { content: [{ type: 'text', text: '第二十四问' }], source: { kind: 'user' } }),
              event('turn/start', { turn: 25 }),
              event('user/message', { content: [{ type: 'text', text: '第二十五问' }], source: { kind: 'user' } }),
              event('turn/start', { turn: 26 }),
              event('user/message', { content: [{ type: 'text', text: '第二十六问' }], source: { kind: 'user' } }),
            ],
          }),
        },
      }),
    }
    const { root, container } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote: fakeRemote({ listReview: async () => ok({ records, pending: 3 }) }),
      sessions,
      t: lookup,
    }))
    await flush()
    const groups = [...container.querySelectorAll('.dsh_lh_group')]
    expect(groups).toHaveLength(3)
    expect(groups.map((group) => group.querySelector('.dsh_lh_groupTurn')?.textContent))
      .toEqual([26, 25, 24].map((n) => zh.turn.replace('{n}', String(n))))
    expect(groups.map((group) => group.querySelector('.dsh_lh_groupPrompt')?.textContent))
      .toEqual(['第二十六问', '第二十五问', '第二十四问'])
    root.unmount()
  })

  it('clicking a timeline snapshot opens compare against the previous snapshot', async () => {
    const older: HistoryRecord = {
      ...pending,
      id: 'rec-old',
      hash: 'hash-old',
      beforeHash: 'hash-older',
      turn: 1,
      mtime: pending.mtime - 10_000,
      decision: 'accepted',
    }
    const remote = fakeRemote({
      listReview: async () => ok({ records: [pending, older], pending: 1 }),
      listTimeline: async () => ok({ records: [older, pending] }),
    })
    const onOpenCompare = vi.fn()
    const { root, container } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote,
      t: lookup,
      onOpenCompare,
    }))
    await flush()
    click(container.querySelector('[data-lh-timeline]'))
    await flush()
    const rows = [...container.querySelectorAll('.dsh_lh_timeRow')]
    expect(rows.length).toBeGreaterThan(1)
    click(rows[1] ?? null)
    expect(onOpenCompare).toHaveBeenCalledWith(expect.objectContaining({
      leftHash: 'hash-old',
      rightHash: 'after',
    }))
    expect(container.querySelector('[data-lh-review]')).not.toBeNull()
    root.unmount()
  })

  it('pending lists newest turn first; done lists oldest first', async () => {
    const older: HistoryRecord = { ...pending, id: 'rec-old', turn: 1, mtime: pending.mtime - 10_000, decision: 'accepted' }
    const newer: HistoryRecord = { ...pending, id: 'rec-new', turn: 9, path: '/proj/src/z.ts' }
    const remote = fakeRemote({
      listReview: async () => ok({ records: [older, newer], pending: 1 }),
    })
    const { root, container } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote,
      t: lookup,
    }))
    await flush()
    const pendingNames = [...container.querySelectorAll('.dsh_lh_name')].map((node) => node.textContent)
    expect(pendingNames[0]).toBe('z.ts')
    click([...container.querySelectorAll('.dsh_lh_filter')].find((button) => button.textContent === zh.filterDone) ?? null)
    await flush()
    const doneNames = [...container.querySelectorAll('.dsh_lh_name')].map((node) => node.textContent)
    expect(doneNames[0]).toBe('app.ts')
    root.unmount()
  })

  it('shows noSession when cwd is empty', async () => {
    const { root, container } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1' },
      remote: fakeRemote(),
      t: lookup,
    }))
    await flush()
    expect(container.textContent).toContain(zh.noSession)
    root.unmount()
  })

  it('shows loadFailed inline when remote errors', async () => {
    const remote = fakeRemote({
      syncSession: async () => { throw new Error('boom') },
    })
    const { root, container } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote,
      t: lookup,
    }))
    await flush()
    expect(container.textContent).toContain(zh.loadFailed)
    root.unmount()
  })

  it('shows loadFailed when syncSession returns ok:false', async () => {
    const remote = fakeRemote({
      syncSession: async () => ({ ok: false as const, error: { code: 'rpc', message: 'nope', details: {} } }),
    })
    const { root, container } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote,
      t: lookup,
    }))
    await flush()
    expect(container.textContent).toContain(zh.loadFailed)
    root.unmount()
  })

  it('reloads the list when the tab becomes visible', async () => {
    const listReview = vi.fn(async () => ok({ records: [pending], pending: 1 }))
    const remote = fakeRemote({ listReview })
    const { root } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote,
      t: lookup,
      visible: false,
    }))
    await flush()
    const afterHidden = listReview.mock.calls.length
    flushSync(() => {
      root.render(createElement(ReviewApp, {
        scope: { sessionId: 'sess-1', cwd: '/proj' },
        remote,
        t: lookup,
        visible: true,
      }))
    })
    await flush()
    expect(listReview.mock.calls.length).toBeGreaterThan(afterHidden)
    root.unmount()
  })

  it('does not poll the review list on an interval', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { root } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote: fakeRemote(),
      t: lookup,
    }))
    await flush()
    expect(setIntervalSpy).not.toHaveBeenCalled()
    setIntervalSpy.mockRestore()
    root.unmount()
  })

  it('reloads the list when notifyReviewChanged fires', async () => {
    let pendingCount = 1
    const listReview = vi.fn(async () => ok({ records: pendingCount > 0 ? [pending] : [], pending: pendingCount }))
    const { root } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote: fakeRemote({ listReview }),
      t: lookup,
    }))
    await flush()
    const before = listReview.mock.calls.length
    pendingCount = 0
    notifyReviewChanged()
    await flush()
    expect(listReview.mock.calls.length).toBeGreaterThan(before)
    root.unmount()
  })

  it('Cmd+Z still reopens after keepAll when the review tab is hidden', async () => {
    const reopenRecord = vi.fn(async () => ok({ records: [] }))
    const acceptFile = vi.fn(async () => ok({ records: [] }))
    const { root, container } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote: fakeRemote({ acceptFile, reopenRecord }),
      t: lookup,
      visible: true,
    }))
    await flush()
    click([...container.querySelectorAll('button')].find((button) => button.textContent === zh.keepAll) ?? null)
    await flush()
    expect(acceptFile).toHaveBeenCalled()
    root.unmount()
    const hidden = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote: fakeRemote({ acceptFile, reopenRecord }),
      t: lookup,
      visible: false,
    }))
    await flush()
    const elsewhere = document.createElement('div')
    document.body.append(elsewhere)
    elsewhere.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }))
    await flush()
    expect(reopenRecord).toHaveBeenCalledWith('sess-1', '/proj', 'rec-1', {})
    hidden.root.unmount()
  })

  it('Cmd+Z after keepAll reopens the last accepted file', async () => {
    const reopenRecord = vi.fn(async () => ok({ records: [] }))
    const acceptFile = vi.fn(async () => ok({ records: [] }))
    const { root, container } = mount(createElement(ReviewApp, {
      scope: { sessionId: 'sess-1', cwd: '/proj' },
      remote: fakeRemote({ acceptFile, reopenRecord }),
      t: lookup,
    }))
    await flush()
    click([...container.querySelectorAll('button')].find((button) => button.textContent === zh.keepAll) ?? null)
    await flush()
    expect(acceptFile).toHaveBeenCalled()
    container.querySelector('.dsh_lh_root')!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }))
    await flush()
    expect(reopenRecord).toHaveBeenCalledWith('sess-1', '/proj', 'rec-1', {})
    root.unmount()
  })
})
