/**
 * Tiny module-level pending badge store. ReviewApp updates it after listReview;
 * the tab descriptor reads it synchronously (throws are swallowed → no badge).
 * Review-changed listeners replace the old 4s list poll.
 */
export declare function setPendingCount(value: number | null): void;
export declare function getPendingCount(): number | null;
export declare function subscribePending(listener: () => void): () => void;
export declare function notifyReviewChanged(): void;
export declare function subscribeReviewChanged(listener: () => void): () => void;
export declare function pendingBadge(): number | null;
