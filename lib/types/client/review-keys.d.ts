/**
 * Cmd/Ctrl+Z and Shift+Z for the review revert stack.
 * Last registered handler wins; returning false falls through.
 * Capture on window so it still works after the change tab closes
 * (focus is usually back in the file editor).
 */
export declare function isReviewUndoKey(event: KeyboardEvent): boolean;
export declare function isReviewRedoKey(event: KeyboardEvent): boolean;
export declare function bindReviewKeys(onUndo: () => boolean | void, onRedo: () => boolean | void): () => void;
