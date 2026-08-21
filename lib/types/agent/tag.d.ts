import type { HistoryLimits, HistoryRecord } from '../types.ts';
import type { HistoryStore } from '../history/store.ts';
import { type AgentCardHit } from './cards.ts';
export { collectSessionEdits, diffsOf, oldTextOf, resolveProjectPath, reviewLocations, sameCardPath, } from './cards.ts';
export type { AgentCardHit, AgentEditKind, FileDiffHunk } from './cards.ts';
export interface ClaimInput {
    store: HistoryStore;
    sessionId: string;
    cwd?: string;
    /** Conversation nodes; ignored when `hits` is provided. */
    nodes?: readonly unknown[];
    /** Compact card list collected on the client (preferred v1 wire shape). */
    hits?: readonly AgentCardHit[];
    limits: HistoryLimits;
    /** Disk reader used ONLY to persist the *new* blob after a card, never as before. */
    readCurrent(absPath: string): Promise<{
        content: string | null;
        binary: boolean;
    }>;
}
export declare function claimAgentCards(input: ClaimInput): Promise<HistoryRecord[]>;
