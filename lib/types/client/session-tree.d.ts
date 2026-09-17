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
     *
     * The window opens with only ~50 messages (`events.open({ maxMessages: 50 })`),
     * so a long session is paged: `hasMore` is normally true.
     */
    eventSource?: {
        getSnapshot?: () => {
            entries?: readonly unknown[];
            hasMore?: boolean;
        };
    };
    /** Opens ONE older page of the window (the Session face's own API). */
    session?: {
        loadOlder?: () => Promise<void>;
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
/** True when any session in the tree still holds older events off-window. */
export declare function treeWindowHasMore(sessions: SessionsFace | undefined, sessionId: string): boolean;
/**
 * Page the window back so an older change can be matched to the user input that
 * caused it.
 *
 * Changes made before the loaded window have no user message in view, which
 * would render them as an engine turn with 「(无用户消息)」. Loading older pages
 * is how the session itself exposes that history.
 *
 * @param maxPages - pages this caller is still willing to pull, so a huge
 *   session is never loaded wholesale by the review pane.
 * @returns how many pages were actually loaded.
 */
export declare function loadOlderPages(sessions: SessionsFace | undefined, sessionId: string, maxPages: number): Promise<number>;
