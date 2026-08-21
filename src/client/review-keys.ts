/**
 * Cmd/Ctrl+Z and Shift+Z for the review revert stack.
 * Last registered handler wins; returning false falls through.
 * Capture on window so it still works after the change tab closes
 * (focus is usually back in the file editor).
 */

const handlers: Array<{ undo: () => boolean | void; redo: () => boolean | void }> = []

export function isReviewUndoKey(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'z' && !event.shiftKey
}

export function isReviewRedoKey(event: KeyboardEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false
  if (event.key.toLowerCase() === 'z' && event.shiftKey) return true
  return event.key.toLowerCase() === 'y' && !event.shiftKey
}

function typingInField(event: KeyboardEvent): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return (target as HTMLElement).isContentEditable === true
}

function onKey(event: KeyboardEvent): void {
  if (typingInField(event) || handlers.length === 0) return
  const undo = isReviewUndoKey(event)
  const redo = isReviewRedoKey(event)
  if (!undo && !redo) return
  for (let i = handlers.length - 1; i >= 0; i--) {
    const handler = handlers[i]
    if (handler === undefined) continue
    const handled = undo ? handler.undo() : handler.redo()
    if (handled === false) continue
    event.preventDefault()
    event.stopPropagation()
    return
  }
}

export function bindReviewKeys(onUndo: () => boolean | void, onRedo: () => boolean | void): () => void {
  const handler = { undo: onUndo, redo: onRedo }
  handlers.push(handler)
  if (handlers.length === 1) window.addEventListener('keydown', onKey, true)
  return () => {
    const index = handlers.lastIndexOf(handler)
    if (index !== -1) handlers.splice(index, 1)
    if (handlers.length === 0) window.removeEventListener('keydown', onKey, true)
  }
}
