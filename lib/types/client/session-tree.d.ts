/**
 * Minimal session-tree walk over the sessions list snapshot.
 * Reimplements sidebar treeSessionIds without importing better-sidebar.
 */
import { type AgentCardHit } from '../agent/cards.ts';
export interface SessionSummary {
    id: string;
    cwd?: string;
    parentId?: string;
    origin?: string;
}
export interface SessionListSnapshot {
    current?: string;
    byId?: Record<string, SessionSummary | undefined>;
}
export interface SessionBinding {
    session?: {
        getSnapshot?: () => {
            nodes?: readonly unknown[];
        };
    };
}
export interface SessionsFace {
    list?: {
        getSnapshot?: () => SessionListSnapshot;
        subscribe?: (listener: () => void) => () => void;
    };
    binding?: (id: string) => SessionBinding | undefined;
}
/** Session ids in the tree rooted at rootId (root + subagent descendants). */
export declare function treeSessionIds(byId: Record<string, SessionSummary | undefined>, rootId: string | undefined): string[];
/** Collect agent card hits for the current session plus its subagent tree. */
export declare function collectTreeHits(sessions: SessionsFace | undefined, sessionId: string, cwd: string | undefined): AgentCardHit[];
/** User prompts keyed by conversation turn for the current session tree. */
export declare function collectTreePrompts(sessions: SessionsFace | undefined, sessionId: string): Map<number | 'x', string>;
