/**
 * Tiny module-level pending badge store. ReviewApp updates it after listReview;
 * the tab descriptor reads it synchronously (throws are swallowed → no badge).
 * Review-changed listeners replace the old 4s list poll.
 */

let pending: number | null = null
const pendingListeners = new Set<() => void>()
const reviewListeners = new Set<() => void>()

export function setPendingCount(value: number | null): void {
  pending = value
  for (const listener of pendingListeners) listener()
}

export function getPendingCount(): number | null {
  return pending
}

export function subscribePending(listener: () => void): () => void {
  pendingListeners.add(listener)
  return () => { pendingListeners.delete(listener) }
}

export function notifyReviewChanged(): void {
  for (const listener of reviewListeners) listener()
}

export function subscribeReviewChanged(listener: () => void): () => void {
  reviewListeners.add(listener)
  return () => { reviewListeners.delete(listener) }
}

export function pendingBadge(): number | null {
  try {
    const value = pending
    if (value === null || value <= 0) return null
    return value
  } catch {
    return null
  }
}
