import type { HistoryRecord } from '../types.ts';
export declare const COMPARE_TAB = "dsh-local-history:compare";
export declare const REVIEW_TAB = "dsh-local-history:change";
export declare function reviewTabId(record: HistoryRecord): string;
export declare function isHistoryRecord(value: unknown): value is HistoryRecord;
export interface CompareSeed {
    path: string;
    sessionId: string;
    cwd?: string;
    leftHash: string | null;
    rightHash: string | null;
    leftSessionId?: string;
    rightSessionId?: string;
}
export declare function compareTabId(seed: CompareSeed): string;
export declare function fileNameOf(path: string): string;
export declare function shortHash(hash: string | null): string;
/** This snapshot on the right, its predecessor on the left. */
export declare function compareSeedOf(record: HistoryRecord, cwd?: string): CompareSeed;
/** Timeline row vs the nearest older snapshot with a different hash. */
export declare function compareSeedFromTimeline(records: readonly HistoryRecord[], selected: HistoryRecord, cwd?: string): CompareSeed;
export declare function isCompareSeed(value: unknown): value is CompareSeed;
