/**
 * Client half: locale, remote mount, optional better-sidebar review tab.
 * Without betterSidebar the plugin still loads (no throw, no register).
 */
import { type ReactNode } from 'react';
import { en, zh, type Translate } from './locales.ts';
import { LOCAL_HISTORY_REMOTE } from './remote.ts';
import type { SessionsFace } from './session-tree.ts';
export declare const inject: string[];
export interface SessionScope {
    sessionId: string;
    cwd?: string;
}
export interface BetterSidebarService {
    registerTab(descriptor: {
        id: string;
        title: string | (() => string);
        icon?: ReactNode | ((size: number) => ReactNode);
        order?: number;
        single?: boolean;
        badge?: () => string | number | null | undefined;
        settings?: {
            pluginToggles?: readonly {
                key: string;
                title: string | (() => string);
                type?: 'switch' | 'text' | 'number';
                min?: number;
                max?: number;
                unit?: string;
            }[];
            render?: (props: Record<string, unknown>) => ReactNode;
        };
        hidden?: boolean;
        dedupeKey?: (tab: {
            id: string;
        }) => string | undefined;
        component: (props: {
            scope: SessionScope;
            visible: boolean;
            tab?: {
                id: string;
                path?: string;
                meta?: unknown;
            };
        }) => unknown;
    }): () => void;
    openFile?(scope: SessionScope, path: string, title?: string): void;
    openTab?(seed: {
        type: string;
        title?: string;
        path?: string;
        id?: string;
        meta?: unknown;
    }, scope?: SessionScope): void;
    closeTab?(tabId: string, scope?: SessionScope): void;
    updateTab?(tabId: string, patch: {
        title?: string;
        path?: string;
        meta?: unknown;
    }): void;
    getSnapshot?(): {
        prefs?: {
            editorMinimap?: boolean;
        };
    };
    subscribeState?(listener: () => void): () => void;
}
export interface ClientContext {
    effect(fn: () => (() => void) | void, label?: string): void;
    inject(deps: string[], fn: (scope: ClientContext) => void | (() => void)): void;
    get?(name: string): unknown;
    betterSidebar?: BetterSidebarService;
    locale: {
        register(ns: string, dicts: {
            zh: typeof zh;
            en: typeof en;
        }): unknown;
        bind?(ns: string): Translate;
    };
    remote: {
        $mount(contribution: typeof LOCAL_HISTORY_REMOTE): unknown;
    };
    reflect?: {
        get(name: string): unknown;
    };
    sessions?: SessionsFace;
}
export declare function apply(ctx: ClientContext): void;
export { ReviewApp } from './ReviewView.tsx';
export { DiffView } from './DiffView.tsx';
export { TimelineView } from './TimelineView.tsx';
export { LOCAL_HISTORY_REMOTE } from './remote.ts';
export { NS, en, zh } from './locales.ts';
