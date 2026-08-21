import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPendingCount, notifyReviewChanged, setPendingCount, subscribePending, subscribeReviewChanged } from '../src/client/pending.ts'

afterEach(() => {
  setPendingCount(null)
})

describe('pending notifications', () => {
  it('notifies pending listeners when the count changes', () => {
    const listener = vi.fn()
    const stop = subscribePending(listener)
    setPendingCount(3)
    expect(getPendingCount()).toBe(3)
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    setPendingCount(0)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifies review-changed listeners without waiting for a timer', () => {
    const listener = vi.fn()
    const stop = subscribeReviewChanged(listener)
    notifyReviewChanged()
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
  })
})
