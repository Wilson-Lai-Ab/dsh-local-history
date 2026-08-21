import type { HistoryIndex } from '../types.ts';
export declare function emptyIndex(): HistoryIndex;
export declare function blobPath(historyRoot: string, hash: string): string;
export declare function parseIndex(raw: unknown): HistoryIndex;
