/**
 * Review-tab Cmd+Z stack. Independent of the sidebar editor history.
 * One chronological stack; a path filter pops the latest action on that file.
 */
import type { ReviewHunk } from '../history/hunks.ts';
import type { LocalHistoryFace } from './remote.ts';
export type ReviewRevertKind = 'file-accept' | 'file-reject' | 'hunk-accept' | 'hunk-reject';
export interface ReviewRevert {
    kind: ReviewRevertKind;
    sessionId: string;
    cwd?: string;
    recordId: string;
    path: string;
    previous?: string | null;
    next?: string | null;
    hunkKey?: string;
    hunk?: ReviewHunk;
}
export declare function reviewRevertKey(sessionId: string, path: string): string;
export declare function pushReviewRevert(entry: ReviewRevert): void;
export declare function peekReviewUndo(sessionId?: string, path?: string): ReviewRevert | undefined;
export declare function popReviewUndo(sessionId?: string, path?: string): ReviewRevert | undefined;
export declare function popReviewRedo(sessionId?: string, path?: string): ReviewRevert | undefined;
export declare function applyReviewRevert(remote: LocalHistoryFace, entry: ReviewRevert, direction: 'undo' | 'redo'): Promise<void>;
export declare function clearReviewRevert(): void;
