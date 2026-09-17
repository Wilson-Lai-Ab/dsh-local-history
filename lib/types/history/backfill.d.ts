import { type HistoryStore } from './store.ts';
/** @returns how many records were repaired. */
export declare function backfillAgentBefore(store: HistoryStore): Promise<number>;
