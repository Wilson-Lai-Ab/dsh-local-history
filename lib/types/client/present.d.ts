export interface ReviewHitPresentation {
    name: string;
    location: string | null;
    module: string | null;
}
export declare function relativeTo(cwd: string | undefined, path: string): string;
/** IDE-style row: file name, leftover folder, top-level module. */
export declare function presentReviewHit(path: string, cwd?: string): ReviewHitPresentation;
export declare function promptPreview(prompt: string, max?: number): string;
/** One user input: the message that opened it, plus its ordinal when known. */
export interface TurnRound {
    /**
     * 1-based user-input ordinal. Absent when the loaded event window does not
     * reach the session start, so the ordinal cannot be counted honestly.
     */
    round?: number;
    prompt: string;
}
/**
 * Engine turn → the user input that opened it.
 *
 * A round is one engine turn containing at least one real user message, so a
 * turn with no user input (an automatic continuation) is deliberately absent
 * from the map and is folded into the previous round by {@link roundAt}.
 * `user/message` events carry no turn number, so the turn is tracked from the
 * `turn/start` and tool events around them.
 *
 * @param options.numbered - false when the window starts mid-session: prompts
 *   are still bound to their turns, but no ordinal is invented.
 */
export declare function collectTurnRounds(nodes: readonly unknown[], options?: {
    numbered?: boolean;
}): Map<number | 'x', TurnRound>;
/** The user input a turn belongs to; a turn without one joins the round before it. */
export declare function roundAt(rounds: ReadonlyMap<number | 'x', TurnRound>, turn: number | undefined): TurnRound | undefined;
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
