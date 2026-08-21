/**
  * Per-hunk review: consecutive changed regions between two snapshots,
  * plus undo of one region by splicing the old block back in.
  * Ported from DSH-better-sidebar review-hunks.ts (no DiffView import).
  */
export interface ReviewHunk {
    key: string;
    start: number;
    end: number;
    paintStart: number;
    paintEnd: number;
    oldBlock: string;
    newBlock: string;
}
export declare function splitLines(text: string): string[];
/** One tool-card hunk: 3-line-context snippet, not a full file. */
export interface FileDiffHunk {
    oldText?: string | null;
    newText: string;
}
/**
 * Rebuild the prior full file by undoing tool-card hunks last-to-first.
 * Returns null when a new-side snippet is missing or not unique in `after`.
 */
export declare function reconstructBefore(after: string, diffs: readonly FileDiffHunk[]): string | null;
/** Consecutive changed regions between two snapshots. */
export declare function hunksFromTexts(oldText: string, newText: string): ReviewHunk[];
/**
  * Replace this hunk's new-file block with its old-file block.
  * Whole-file additions (empty old block + span covering the file) become ''.
  */
export declare function applyHunkUndo(text: string, hunk: ReviewHunk): string;
/**
  * True when `text` still contains this hunk's new block at its recorded span.
  */
export declare function hunkMatches(text: string, hunk: ReviewHunk): boolean;
/** One painted row of the current file, plus deleted lines inserted before their replacement. */
export interface PaintRow {
    kind: 'ctx' | 'add' | 'del';
    text: string;
    line?: number;
    hunkKey?: string;
}
/**
 * Walk the current file and interleave each hunk's deleted block immediately
 * before its new-file span. Unchanged lines keep their current-file numbers.
 */
export declare function paintFileDiff(before: string, after: string): {
    rows: PaintRow[];
    hunks: ReviewHunk[];
};
/** After-file only: changed spans wash as add, no interleaved deletions. */
export declare function paintAfterOnly(before: string, after: string): {
    rows: PaintRow[];
    hunks: ReviewHunk[];
};
export interface SplitCell {
    kind: 'ctx' | 'add' | 'del' | 'empty';
    text: string;
    line?: number;
}
export interface SplitRow {
    left: SplitCell;
    right: SplitCell;
}
/** Side-by-side rows: previous snapshot on the left, this snapshot on the right. */
export declare function paintSplitDiff(before: string, after: string): {
    rows: SplitRow[];
    hunks: ReviewHunk[];
};
