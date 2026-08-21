import type { HistoryRecord } from './types.ts';
/** One pending agent row per path — later turns supersede earlier ones. */
export declare function latestPendingPerPath(records: readonly HistoryRecord[]): HistoryRecord[];
export declare function pendingCount(records: readonly HistoryRecord[]): number;
