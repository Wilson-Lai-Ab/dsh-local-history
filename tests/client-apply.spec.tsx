/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setPendingCount } from '../src/client/pending.ts'
import { createElement, type ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { apply, inject } from '../src/client/index.ts'
import type { LocalHistoryFace } from '../src/client/remote.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = false

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value }
}

function fakeRemote(over: Partial<LocalHistoryFace> = {}): LocalHistoryFace {
  return {
    listReview: async () => ok({ records: [], pending: 0 }),
    listTimeline: async () => ok({ records: [] }),
    readBlob: async () => ok({ content: '' }),
    readCurrent: async () => ok({ content: '', binary: false }),
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

function mount(element: ReactElement): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  flushSync(() => { root.render(element) })
  return { container, unmount: () => { root.unmount(); container.remove() } }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  flushSync(() => {})
}

afterEach(() => {
  setPendingCount(null)
})

function fakeCtx(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const ctx: Record<string, unknown> = {
    effect: (fn: () => unknown) => {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    inject: (deps: string[], fn: (scope: Record<string, unknown>) => void) => {
      if (deps.includes('betterSidebar') && extra.betterSidebar !== undefined) {
        fn({ ...ctx, ...extra, get: (name: string) => (extra as Record<string, unknown>)[name] })
      }
    },
    locale: {
      register: vi.fn(() => () => {}),
      bind: vi.fn(() => (key: string) => key),
    },
    remote: {
      $mount: vi.fn(async () => () => {}),
    },
    reflect: {
      get: vi.fn(() => undefined),
    },
    sessions: {
      list: {
        getSnapshot: () => ({ current: 'sess-1', byId: {} }),
        subscribe: () => () => {},
      },
    },
    slots: { inject: vi.fn(), register: vi.fn() },
    ...extra,
  }
  return ctx
}

describe('client apply', () => {
  it('does not throw without betterSidebar', () => {
    expect(() => apply(fakeCtx({}) as never)).not.toThrow()
  })

  it('registers dsh-local-history:review when sidebar exists', () => {
    const ids: string[] = []
    apply(fakeCtx({
      betterSidebar: { registerTab: (d: { id: string }) => { ids.push(d.id); return () => {} } },
    }) as never)
    expect(ids).toEqual(['dsh-local-history:review', 'dsh-local-history:compare', 'dsh-local-history:change'])
  })

  it('gives the review tab a plus-menu icon', () => {
    let review: { icon?: (size: number) => ReactElement } | undefined
    apply(fakeCtx({
      betterSidebar: {
        registerTab: (d: { id?: string; icon?: (size: number) => ReactElement }) => {
          if (d.id === 'dsh-local-history:review') review = d
          return () => {}
        },
      },
    }) as never)
    expect(review?.icon).toBeTypeOf('function')
    const { container, unmount } = mount(review!.icon!(16))
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16')
    expect(svg?.getAttribute('width')).toBe('16')
    unmount()
  })

  it('bumps the review tab when pending count changes', () => {
    const updateTab = vi.fn()
    apply(fakeCtx({
      betterSidebar: {
        registerTab: () => () => {},
        updateTab,
      },
    }) as never)
    setPendingCount(4)
    expect(updateTab).toHaveBeenCalledWith('dsh-local-history:review', { meta: { pending: 4 } })
  })

  it('does not register the built-in review id', () => {
    const ids: string[] = []
    apply(fakeCtx({
      betterSidebar: { registerTab: (d: { id: string }) => { ids.push(d.id); return () => {} } },
    }) as never)
    expect(ids).not.toContain('review')
  })

  it('declares required inject without betterSidebar', () => {
    expect(inject).toEqual(['remote', 'slots', 'locale', 'sessions'])
    expect(inject).not.toContain('betterSidebar')
  })

  it('settings gear seeds from getSettings and writes via updateSettings', async () => {
    const getSettings = vi.fn(async () => ok({
      watchEnabled: false,
      maxPerFile: 12,
      maxBytesMb: 64,
      retentionDays: 7,
    }))
    const updateSettings = vi.fn(async (update) => ok({
      watchEnabled: update.watchEnabled ?? false,
      maxPerFile: update.maxPerFile ?? 12,
      maxBytesMb: update.maxBytesMb ?? 64,
      retentionDays: update.retentionDays ?? 7,
    }))
    const remote = fakeRemote({ getSettings, updateSettings })
    let descriptor: {
      settings?: {
        pluginToggles?: readonly { key: string; min?: number; max?: number }[]
        render?: (props: Record<string, unknown>) => ReactElement
      }
    } | undefined
    apply(fakeCtx({
      reflect: { get: (name: string) => name === 'remote.localHistory' ? remote : undefined },
      betterSidebar: {
        registerTab: (d: typeof descriptor & { id?: string }) => {
          if (d?.id === 'dsh-local-history:review') descriptor = d
          return () => {}
        },
      },
    }) as never)
    expect(descriptor?.settings?.pluginToggles?.map((row) => row.key)).toEqual([
      'watchEnabled',
      'maxPerFile',
      'maxBytesMb',
      'retentionDays',
    ])
    expect(descriptor?.settings?.pluginToggles?.[1]).toMatchObject({ min: 1, max: 200 })
    expect(descriptor?.settings?.pluginToggles?.[2]).toMatchObject({ min: 16, max: 2048 })
    expect(descriptor?.settings?.pluginToggles?.[3]).toMatchObject({ min: 1, max: 365 })
    expect(descriptor?.settings?.render).toBeTypeOf('function')
    const { container, unmount } = mount(descriptor!.settings!.render!({
      pluginSettings: {},
      updatePluginSetting: () => {},
      close: () => {},
    }))
    await flush()
    expect(getSettings).toHaveBeenCalled()
    const watch = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null
    expect(watch?.checked).toBe(false)
    watch!.click()
    await flush()
    expect(updateSettings).toHaveBeenCalledWith({ watchEnabled: true })
    expect(container.textContent).toContain('watchEnabled')
    unmount()
  })
})
