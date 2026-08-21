/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createElement, type ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import type { HistoryRecord } from '../src/types.ts'
import { SnapshotView } from '../src/client/SnapshotView.tsx'
import { lookup } from '../src/client/locales.ts'
import type { LocalHistoryFace } from '../src/client/remote.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = false

const record: HistoryRecord = {
  id: 'rec-1',
  path: '/proj/src/app.ts',
  hash: 'hash-1',
  beforeHash: null,
  bytes: 12,
  mtime: Date.now(),
  source: 'agent',
  kind: 'edit',
  sessionId: 'sess-1',
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value }
}

function fakeRemote(): LocalHistoryFace {
  return {
    listReview: async () => ok({ records: [], pending: 0 }),
    listTimeline: async () => ok({ records: [] }),
    readBlob: async () => ok({ content: "export const x = 'hi'\n" }),
    readCurrent: async () => ok({ content: 'live\n', binary: false }),
    acceptFile: async () => ok({ records: [] }),
    rejectFile: async () => ok({ records: [] }),
    acceptHunk: async () => ok({ records: [] }),
    rejectHunk: async () => ok({ records: [] }),
    restore: async () => ok({ records: [] }),
    reopenRecord: async () => ok({ records: [] }),
    getSettings: async () => ok({ watchEnabled: true, maxPerFile: 50, maxBytesMb: 200, retentionDays: 30 }),
    updateSettings: async () => ok({ watchEnabled: true, maxPerFile: 50, maxBytesMb: 200, retentionDays: 30 }),
    syncSession: async () => ok({ pending: 0 }),
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

describe('SnapshotView', () => {
  it('renders the blob with token spans in one pre, not live disk', async () => {
    const { root, container } = mount(createElement(SnapshotView, {
      record,
      cwd: '/proj',
      remote: fakeRemote(),
      t: lookup,
    }))
    await flush()
    const code = container.querySelector('.dsh_lh_snapCode')
    expect(code?.innerHTML).toContain('data-tok="kw"')
    expect(code?.textContent).toContain("export const x = 'hi'")
    expect(container.textContent).not.toContain('live')
    root.unmount()
  })
})
