import type { HistoryIndex, HistoryLimits } from '../types.ts';
import type { HistoryStore } from './store.ts';
import { type ReviewHunk } from './hunks.ts';
export interface ActionIo {
    store: HistoryStore;
    sessionId: string;
    writeFile(path: string, content: string): Promise<void>;
    unlink(path: string): Promise<void>;
    readFile(path: string): Promise<string | null>;
    limits: HistoryLimits;
}
export declare function acceptFile(io: ActionIo, recordId: string): Promise<HistoryIndex>;
export declare function rejectFile(io: ActionIo, recordId: string): Promise<HistoryIndex>;
export declare function acceptHunk(io: ActionIo, recordId: string, hunkKey: string): Promise<HistoryIndex>;
export declare function rejectHunk(io: ActionIo, recordId: string, hunk: ReviewHunk): Promise<HistoryIndex>;
export interface ReopenPayload {
    content?: string | null;
    hunkKey?: string;
}
/** Put a decided file or hunk back to pending; optionally restore disk. */
export declare function reopenRecord(io: ActionIo, recordId: string, payload: ReopenPayload): Promise<HistoryIndex>;
export declare function restoreSnapshot(io: ActionIo, recordId: string): Promise<HistoryIndex>;
