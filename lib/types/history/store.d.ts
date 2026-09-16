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
    /** Stored size of a blob in bytes; 0 when it is missing. */
    blobBytes(hash: string): Promise<number>;
    save(index: HistoryIndex): Promise<void>;
    putBlob(content: string): Promise<{
        hash: string;
        bytes: number;
    }>;
    readBlob(hash: string): Promise<string>;
    append(record: HistoryRecord, limits: HistoryLimits, now?: number): Promise<HistoryIndex>;
    /**
      * Recycle per spec; returns next index.
      *
      * The byte cap is reclaimed from SAVE records first, biggest first: that is
      * where bulk actually lives (one runtime log outweighed a whole session of
      * edits). The old version could only shed RESOLVED agent records, so a store
      * pinned over the cap by a log kept deleting the user's review history — and
      * the next sync rebuilt it, which is what made every review sync churn.
      *
      * PENDING agent records are never dropped: they are review items the user has
      * not answered yet.
      *
      * Live bytes are computed once per call; the old loop recomputed them (stat-ing
      * blobs) on every iteration.
      */
    gc(index: HistoryIndex, limits: HistoryLimits, now?: number): HistoryIndex;
    private saveUnlocked;
    private putBlobUnlocked;
}
