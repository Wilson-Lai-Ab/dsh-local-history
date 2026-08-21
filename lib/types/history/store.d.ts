import { blobPath, emptyIndex, parseIndex } from './document.ts';
import type { HistoryIndex, HistoryLimits, HistoryRecord } from '../types.ts';
export { blobPath, emptyIndex, parseIndex };
export declare function sha256Hex(bytes: Uint8Array | string): string;
export declare class HistoryStore {
    readonly historyRoot: string;
    constructor(historyRoot: string);
    /** Run `fn` inside this store's serialized critical section (re-entrant). */
    withLock<T>(fn: () => Promise<T>): Promise<T>;
    load(): Promise<HistoryIndex>;
    hasBlob(hash: string): Promise<boolean>;
    save(index: HistoryIndex): Promise<void>;
    putBlob(content: string): Promise<{
        hash: string;
        bytes: number;
    }>;
    readBlob(hash: string): Promise<string>;
    append(record: HistoryRecord, limits: HistoryLimits, now?: number): Promise<HistoryIndex>;
    /** Recycle per spec; returns next index. Never drops pending agent or live hashes. */
    gc(index: HistoryIndex, limits: HistoryLimits, now?: number): HistoryIndex;
    private saveUnlocked;
    private putBlobUnlocked;
}
