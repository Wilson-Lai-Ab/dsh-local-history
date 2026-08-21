/**
  * Browser-safe session-card parsing. No node:fs — host tagger and client
  * both import this to collect agent hits from conversation nodes.
  */
import type { FileDiffHunk } from '../history/hunks.ts';
export type AgentEditKind = 'add' | 'edit' | 'delete';
export type { FileDiffHunk };
export interface AgentCardHit {
    path: string;
    kind: AgentEditKind;
    oldText?: string | null;
    turn?: number;
    /** Tool-card hunks for this path (3-line context, not a full file). */
    diffs?: FileDiffHunk[];
}
export declare function sameCardPath(a: string, b: string): boolean;
/** Resolve a (possibly relative) path against the session cwd. */
export declare function resolveProjectPath(cwd: string | undefined, path: string): string;
/** Paths a tool-result view reports as an agent mutation. */
export declare function reviewLocations(view: unknown): {
    path: string;
    kind: AgentEditKind;
}[];
/** Hunk snippets for this path (`newText` required so they can be undone). */
export declare function diffsOf(view: unknown, path: string): FileDiffHunk[];
/** Last tool card's old-file snapshot for this path (`null` = created). */
export declare function oldTextOf(view: unknown, path: string): string | null | undefined;
/**
  * Flatten conversation nodes into one hit per (turn, path). Paths are
  * resolved against cwd when provided.
  */
export declare function collectSessionEdits(nodes: readonly unknown[], cwd?: string): AgentCardHit[];
