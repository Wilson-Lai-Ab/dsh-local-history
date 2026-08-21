import { type AgentCardHit } from '../agent/cards.ts';
import { type HistoryStore } from '../history/store.ts';
import type { HistoryLimits } from '../types.ts';
export interface WatchHandle {
    close(): void;
}
export declare function pathHasSkippedSegment(absPath: string, cwd?: string): boolean;
/**
  * Recursive `fs.watch` when the platform supports it. Skips ignored path
  * segments and debounces 100ms per absolute path before `onWrite`.
  */
export declare function startWatcher(cwd: string, onWrite: (absPath: string) => void): WatchHandle;
export interface WatchWriteInput {
    store: HistoryStore;
    sessionId: string;
    cwd?: string;
    absPath: string;
    limits: HistoryLimits;
    hits: readonly AgentCardHit[];
    readCurrent(absPath: string): Promise<{
        content: string | null;
        binary: boolean;
    }>;
}
/** Claim an unclaimed agent hit for this path, else append a non-duplicate save. */
export declare function handleWatchWrite(input: WatchWriteInput): Promise<void>;
