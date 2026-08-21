/**
 * Review-list presentation: IDE-style path rows and turn prompt previews.
 */
export interface ReviewHitPresentation {
    name: string;
    location: string | null;
    module: string | null;
}
export declare function relativeTo(cwd: string | undefined, path: string): string;
/** IDE-style row: file name, leftover folder, top-level module. */
export declare function presentReviewHit(path: string, cwd?: string): ReviewHitPresentation;
export declare function promptPreview(prompt: string, max?: number): string;
export declare function promptOfNode(node: unknown): string;
/** Last user prompt seen before tools of each turn. */
export declare function collectTurnPrompts(nodes: readonly unknown[]): Map<number | 'x', string>;
export type HighlightKind = 'kw' | 'str' | 'cmt' | 'fn';
export interface HighlightSpan {
    kind?: HighlightKind;
    text: string;
}
export type ScanMode = 'code' | 'block' | 'template';
/** One HTML string for a snapshot pane — cheaper than a React node per token. */
export declare function highlightToHtml(text: string): string;
/** Highlight a single painted row, carrying javadoc / template state. */
export declare function highlightLineHtml(text: string, start?: ScanMode): {
    html: string;
    mode: ScanMode;
};
/**
 * Highlight painted review rows. After-file lines (ctx/add) keep javadoc
 * state; interleaved deletions highlight on their own so they cannot
 * break the current-file comment mode.
 */
export declare function highlightRowsHtml(rows: readonly {
    kind?: string;
    text: string;
}[]): string[];
/** Cheap JS/TS highlighter for the review file pane (not a full parser). */
export declare function highlightLine(text: string): HighlightSpan[];
