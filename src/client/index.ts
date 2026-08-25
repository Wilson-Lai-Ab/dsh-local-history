/**
 * Client half: locale, remote mount, optional better-sidebar review tab.
 * Without betterSidebar the plugin still loads (no throw, no register).
 */
import { createElement, type ReactNode } from 'react'
import { ReviewApp } from './ReviewView.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'
import { DiffView } from './DiffView.tsx'
import { SplitDiffView } from './SplitDiffView.tsx'
import {
  COMPARE_TAB,
  REVIEW_TAB,
  compareTabId,
  fileNameOf,
  isCompareSeed,
  isHistoryRecord,
  reviewTabId,
  type CompareSeed,
} from './compare.ts'
import { NS, en, zh, lookup, type Translate } from './locales.ts'
import { getPendingCount, pendingBadge, subscribePending } from './pending.ts'
import { LOCAL_HISTORY_REMOTE, type LocalHistoryFace } from './remote.ts'
import { adoptStyles } from './styles.ts'
import type { SessionsFace } from './session-tree.ts'

export const inject = ['remote', 'slots', 'locale', 'sessions']

export interface SessionScope {
  sessionId: string
  cwd?: string
}

export interface BetterSidebarService {
  registerTab(descriptor: {
    id: string
    title: string | (() => string)
    icon?: ReactNode | ((size: number) => ReactNode)
    order?: number
    single?: boolean
    badge?: () => string | number | null | undefined
    settings?: {
      pluginToggles?: readonly {
        key: string
        title: string | (() => string)
        type?: 'switch' | 'text' | 'number'
        min?: number
        max?: number
        unit?: string
      }[]
      render?: (props: Record<string, unknown>) => ReactNode
    }
    hidden?: boolean
    dedupeKey?: (tab: { id: string }) => string | undefined
    component: (props: {
      scope: SessionScope
      visible: boolean
      tab?: { id: string; path?: string; meta?: unknown }
    }) => unknown
  }): () => void
  openFile?(scope: SessionScope, path: string, title?: string): void
  openTab?(seed: {
    type: string
    title?: string
    path?: string
    id?: string
    meta?: unknown
  }, scope?: SessionScope): void
  closeTab?(tabId: string, scope?: SessionScope): void
  updateTab?(tabId: string, patch: { title?: string; path?: string; meta?: unknown }): void
  getSnapshot?(): { prefs?: { editorMinimap?: boolean } }
  subscribeState?(listener: () => void): () => void
}

export interface ClientContext {
  effect(fn: () => (() => void) | void, label?: string): void
  inject(deps: string[], fn: (scope: ClientContext) => void | (() => void)): void
  get?(name: string): unknown
  betterSidebar?: BetterSidebarService
  locale: {
    register(ns: string, dicts: { zh: typeof zh; en: typeof en }): unknown
    bind?(ns: string): Translate
  }
  remote: {
    $mount(contribution: typeof LOCAL_HISTORY_REMOTE): unknown
  }
  reflect?: { get(name: string): unknown }
  sessions?: SessionsFace
}

/** Plus-menu glyph: checklist on a file (same outline language as sidebar tabs). */
function reviewTabIcon(size: number): ReactNode {
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      'aria-hidden': true,
    },
    createElement('rect', {
      x: '2',
      y: '1.5',
      width: '9.5',
      height: '13',
      rx: '1.5',
      stroke: 'currentColor',
      strokeWidth: '1.5',
    }),
    createElement('path', {
      d: 'M4.25 5.25h5M4.25 8h5M4.25 10.75h2.75',
      stroke: 'currentColor',
      strokeWidth: '1.5',
      strokeLinecap: 'round',
    }),
    createElement('path', {
      d: 'm10.25 9.5 1.5 1.5 3-3',
      stroke: 'currentColor',
      strokeWidth: '1.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  )
}

function bindT(ctx: ClientContext): Translate {
  if (typeof ctx.locale.bind === 'function') return ctx.locale.bind(NS)
  return lookup
}

function resolveRemote(ctx: ClientContext): LocalHistoryFace | undefined {
  const face = ctx.reflect?.get('remote.localHistory')
  return face as LocalHistoryFace | undefined
}

function ReviewTab(props: {
  ctx: ClientContext
  sidebar?: BetterSidebarService
  scope: SessionScope
  visible: boolean
}): ReactNode {
  const t = bindT(props.ctx)
  const remote = resolveRemote(props.ctx)
  if (remote === undefined) {
    return createElement('div', { className: 'dsh_lh_error' }, t('loadFailed'))
  }
  return createElement(ReviewApp, {
    scope: props.scope,
    visible: props.visible,
    remote,
    sessions: props.ctx.sessions,
    t,
    onOpenCompare: (seed: CompareSeed) => {
      props.sidebar?.openTab?.({
        type: COMPARE_TAB,
        title: fileNameOf(seed.path),
        path: seed.path,
        id: compareTabId(seed),
        meta: seed,
      }, props.scope)
    },
    onOpenReview: (record) => {
      props.sidebar?.openTab?.({
        type: REVIEW_TAB,
        title: fileNameOf(record.path),
        path: record.path,
        id: reviewTabId(record),
        meta: record,
      }, props.scope)
    },
  })
}

export function apply(ctx: ClientContext): void {
  adoptStyles()
  ctx.locale.register(NS, { zh, en })
  void ctx.remote.$mount(LOCAL_HISTORY_REMOTE)
  ctx.inject(['betterSidebar'], (scope) => {
    const sidebar = scope.betterSidebar
      ?? (scope.get?.('betterSidebar') as BetterSidebarService | undefined)
    if (sidebar === undefined) return
    const t = bindT(ctx)
    ctx.effect(() => subscribePending(() => {
      sidebar.updateTab?.('dsh-local-history:review', { meta: { pending: getPendingCount() } })
    }), 'dsh-local-history: badge bump')
    ctx.effect(() => sidebar.registerTab({
      id: 'dsh-local-history:review',
      title: () => t('reviewTitle'),
      icon: reviewTabIcon,
      order: 26,
      single: true,
      badge: () => pendingBadge(),
      settings: {
        pluginToggles: [
          { key: 'watchEnabled', type: 'switch', title: () => t('watchEnabled') },
          { key: 'maxPerFile', type: 'number', title: () => t('maxPerFile'), min: 1, max: 200 },
          { key: 'maxBytesMb', type: 'number', title: () => t('maxBytesMb'), min: 16, max: 2048, unit: t('unitMb') },
          { key: 'retentionDays', type: 'number', title: () => t('retentionDays'), min: 1, max: 365, unit: t('unitDays') },
        ],
        render: () => {
          const remote = resolveRemote(ctx)
          if (remote === undefined) return createElement('div', { className: 'dsh_lh_error' }, t('loadFailed'))
          return createElement(SettingsPanel, { remote, t })
        },
      },
      component: (props) => createElement(ReviewTab, {
        ctx,
        sidebar,
        scope: props.scope,
        visible: props.visible,
      }),
    }), 'dsh-local-history: review tab')
    ctx.effect(() => sidebar.registerTab({
      id: COMPARE_TAB,
      title: () => t('compareTitle'),
      order: -1,
      hidden: true,
      dedupeKey: (tab) => tab.id,
      component: (props) => {
        const remote = resolveRemote(ctx)
        const seed = isCompareSeed(props.tab?.meta) ? props.tab.meta : undefined
        if (remote === undefined || seed === undefined) {
          return createElement('div', { className: 'dsh_lh_error' }, t('loadFailed'))
        }
        return createElement(SplitDiffView, { seed, remote, t, prefs: sidebar })
      },
    }), 'dsh-local-history: compare tab')
    ctx.effect(() => sidebar.registerTab({
      id: REVIEW_TAB,
      title: () => t('agentEdited'),
      order: -1,
      hidden: true,
      dedupeKey: (tab) => tab.id,
      component: (props) => {
        const remote = resolveRemote(ctx)
        const record = isHistoryRecord(props.tab?.meta) ? props.tab.meta : undefined
        if (remote === undefined || record === undefined) {
          return createElement('div', { className: 'dsh_lh_error' }, t('loadFailed'))
        }
        return createElement(DiffView, {
          record,
          sessionId: props.scope.sessionId,
          cwd: props.scope.cwd,
          remote,
          t,
          prefs: sidebar,
          afterHash: record.hash,
          visible: props.visible,
          onRecord: (next) => {
            if (props.tab?.id !== undefined) sidebar.updateTab?.(props.tab.id, { meta: next })
          },
          onFileDone: () => {
            if (props.tab?.id !== undefined) sidebar.closeTab?.(props.tab.id, props.scope)
          },
        })
      },
    }), 'dsh-local-history: change tab')
  })
}

export { ReviewApp } from './ReviewView.tsx'
export { DiffView } from './DiffView.tsx'
export { TimelineView } from './TimelineView.tsx'
export { LOCAL_HISTORY_REMOTE } from './remote.ts'
export { NS, en, zh } from './locales.ts'
