/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindReviewKeys } from '../src/client/review-keys.ts'

afterEach(() => {
  document.body.replaceChildren()
})

describe('bindReviewKeys', () => {
  it('handles Mod-Z outside the review pane when the stack can undo', () => {
    const undo = vi.fn(() => true)
    const stop = bindReviewKeys(undo, () => false)
    const other = document.createElement('div')
    document.body.append(other)
    other.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }))
    expect(undo).toHaveBeenCalledTimes(1)
    stop()
  })

  it('does not steal Mod-Z from an input field', () => {
    const undo = vi.fn(() => true)
    const stop = bindReviewKeys(undo, () => false)
    const input = document.createElement('input')
    document.body.append(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }))
    expect(undo).not.toHaveBeenCalled()
    stop()
  })
})
