/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createElement, type ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { SplitDiffView } from '../src/client/SplitDiffView.tsx'
import { lookup } from '../src/client/locales.ts'
import type { LocalHistoryFace } from '../src/client/remote.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = false

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value }
}

function fakeRemote(): LocalHistoryFace {
  return {
    listReview: async () => ok({ records: [], pending: 0 }),
    listTimeline: async () => ok({ records: [] }),
    readBlob: async (_session, _cwd, hash) => ok({
      content: hash === 'left' ? 'package com.old;\n' : 'package com.new;\n',
    }),
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

describe('SplitDiffView', () => {
  it('paints previous vs this snapshot with token spans, not live disk', async () => {
    const { root, container } = mount(createElement(SplitDiffView, {
      seed: {
        path: '/proj/A.java',
        sessionId: 'sess-1',
        cwd: '/proj',
        leftHash: 'left',
        rightHash: 'right',
      },
      remote: fakeRemote(),
      t: lookup,
    }))
    await flush()
    expect(container.querySelector('[data-lh-split]')).not.toBeNull()
    expect(container.querySelector('.dsh_lh_minimap')).not.toBeNull()
    expect(container.textContent).toContain('package com.old;')
    expect(container.textContent).toContain('package com.new;')
    expect(container.textContent).not.toContain('live')
    expect(container.querySelector('.dsh_lh_rowLine .dsh_lh_code')?.innerHTML).toContain('data-tok="kw"')
    const panes = container.querySelectorAll('.dsh_lh_splitPane')
    expect(panes.length).toBe(2)
    expect(panes[0]!.textContent).toContain('package com.old;')
    expect(panes[0]!.textContent).not.toContain('package com.new;')
    expect(panes[1]!.textContent).toContain('package com.new;')
    expect(panes[1]!.textContent).not.toContain('package com.old;')
    expect(container.querySelector('.dsh_lh_rowLine[data-mark="del"]')).not.toBeNull()
    expect(container.querySelector('.dsh_lh_rowLine[data-mark="add"]')).not.toBeNull()
    root.unmount()
  })
})
