/**
 * Minimal session-tree walk over the sessions list snapshot.
 * Reimplements sidebar treeSessionIds without importing better-sidebar.
 */
import { type AgentCardHit } from '../agent/cards.ts';
import { type TurnRound } from './present.ts';
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
    /**
     * The live session event window. This is the ONLY conversation source: the
     * Session snapshot itself (`SessionSnapshot`) has no node list at all, so a
     * `nodes` probe would always read empty.
     */
    eventSource?: {
        getSnapshot?: () => {
            entries?: readonly unknown[];
            hasMore?: boolean;
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
/** Engine turn → user input for the current session tree (root + subagents). */
export declare function collectTreeRounds(sessions: SessionsFace | undefined, sessionId: string): Map<number | 'x', TurnRound>;
