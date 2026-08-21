/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import type { HistoryRecord } from '../src/types.ts'
import { TimelineView } from '../src/client/TimelineView.tsx'
import { zh } from '../src/client/locales.ts'
import type { LocalHistoryFace } from '../src/client/remote.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = false

const sibling: HistoryRecord = {
  id: 'rec-sib',
  path: '/proj/src/app.ts',
  hash: 'h-sib',
  beforeHash: null,
  bytes: 8,
  mtime: Date.now(),
  source: 'save',
  kind: 'edit',
  sessionId: 'sess-sibling',
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value }
}

function fakeRemote(over: Partial<LocalHistoryFace> = {}): LocalHistoryFace {
  return {
    listReview: async () => ok({ records: [], pending: 0 }),
    listTimeline: async () => ok({ records: [sibling] }),
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
    syncSession: async () => ok({ pending: 0 }),
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

afterEach(() => {
  document.body.replaceChildren()
})

describe('TimelineView', () => {
  it('lists snapshots without restore / source badges', async () => {
    const { root, container } = mount(createElement(TimelineView, {
      path: '/proj/src/app.ts',
      sessionId: 'sess-live',
      cwd: '/proj',
      remote: fakeRemote(),
      t: (key: string) => (zh as Record<string, string>)[key] ?? key,
    }))
    await flush()
    expect(container.textContent).not.toContain(zh.restore)
    expect(container.textContent).not.toContain(zh.badgeAI)
    expect(container.textContent).not.toContain(zh.badgeSave)
    expect(container.querySelector('.dsh_lh_timeRow')).not.toBeNull()
    root.unmount()
  })

  it('clicking a snapshot inspects it', async () => {
    const onSelect = vi.fn()
    const { root, container } = mount(createElement(TimelineView, {
      path: '/proj/src/app.ts',
      sessionId: 'sess-live',
      cwd: '/proj',
      remote: fakeRemote(),
      t: (key: string) => (zh as Record<string, string>)[key] ?? key,
      onSelect,
    }))
    await flush()
    container.querySelector('.dsh_lh_timeRow')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rec-sib' }),
      expect.arrayContaining([expect.objectContaining({ id: 'rec-sib' })]),
    )
    root.unmount()
  })
})
