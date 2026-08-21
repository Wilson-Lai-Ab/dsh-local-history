/**
  * Per-hunk review: consecutive changed regions between two snapshots,
  * plus undo of one region by splicing the old block back in.
  * Ported from DSH-better-sidebar review-hunks.ts (no DiffView import).
  */

export interface ReviewHunk {
  key: string
  start: number
  end: number
  paintStart: number
  paintEnd: number
  oldBlock: string
  newBlock: string
}

export function splitLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

function joinLines(lines: readonly string[], trailingNl: boolean): string {
  if (lines.length === 0) return trailingNl ? '\n' : ''
  return trailingNl ? `${lines.join('\n')}\n` : lines.join('\n')
}

/** One tool-card hunk: 3-line-context snippet, not a full file. */
export interface FileDiffHunk {
  oldText?: string | null
  newText: string
}

/**
 * Rebuild the prior full file by undoing tool-card hunks last-to-first.
 * Returns null when a new-side snippet is missing or not unique in `after`.
 */
export function reconstructBefore(after: string, diffs: readonly FileDiffHunk[]): string | null {
  if (diffs.length === 0) return null
  let text = after
  for (const diff of [...diffs].reverse()) {
    const next = applySnippetUndo(text, diff)
    if (next === null) return null
    text = next
  }
  return text
}

function applySnippetUndo(after: string, diff: FileDiffHunk): string | null {
  const inserted = diff.newText
  if (inserted === '') return null
  const first = after.indexOf(inserted)
  if (first === -1) return null
  if (after.indexOf(inserted, first + 1) !== -1) return null
  return `${after.slice(0, first)}${diff.oldText ?? ''}${after.slice(first + inserted.length)}`
}

/** Consecutive changed regions between two snapshots. */
export function hunksFromTexts(oldText: string, newText: string): ReviewHunk[] {
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)
  if (oldLines.length > 6000 || newLines.length > 6000) return []
  const out: ReviewHunk[] = []
  let i = 0
  let j = 0
  const window = 80
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i += 1
      j += 1
      continue
    }
    const oldStart = i
    const newStart = j
    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) break
      let synced = false
      const iMax = Math.min(oldLines.length, i + window)
      const jMax = Math.min(newLines.length, j + window)
      if (j < newLines.length) {
        for (let look = i + 1; look < iMax; look += 1) {
          if (oldLines[look] === newLines[j]) { i = look; synced = true; break }
        }
      }
      if (!synced && i < oldLines.length) {
        for (let look = j + 1; look < jMax; look += 1) {
          if (newLines[look] === oldLines[i]) { j = look; synced = true; break }
        }
      }
      if (synced) break
      if (i < oldLines.length) i += 1
      if (j < newLines.length) j += 1
    }
    const oldBlock = oldLines.slice(oldStart, i)
    const newBlock = newLines.slice(newStart, j)
    if (oldBlock.length === 0 && newBlock.length === 0) continue
    const start = newBlock.length === 0 ? Math.max(1, newStart) : newStart + 1
    const end = newBlock.length === 0 ? start : newStart + newBlock.length
    out.push({
      key: `${start}:${end}:${oldStart}:${oldBlock.length}:${newBlock.length}`,
      start,
      end,
      paintStart: start,
      paintEnd: end,
      oldBlock: oldBlock.join('\n'),
      newBlock: newBlock.join('\n'),
    })
  }
  return out
}

/**
  * Replace this hunk's new-file block with its old-file block.
  * Whole-file additions (empty old block + span covering the file) become ''.
  */
export function applyHunkUndo(text: string, hunk: ReviewHunk): string {
  const trailing = text.endsWith('\n')
  const lines = splitLines(text)
  const newLines = hunk.newBlock === '' && hunk.oldBlock === ''
    ? lines.slice(hunk.start - 1, hunk.end)
    : splitLines(hunk.newBlock)
  const oldLines = splitLines(hunk.oldBlock)
  if (newLines.length === 0 && oldLines.length === 0) return ''
  const from = Math.max(0, hunk.start - 1)
  const count = newLines.length === 0 ? 0 : Math.min(newLines.length, Math.max(0, lines.length - from))
  const next = [...lines]
  next.splice(from, count, ...oldLines)
  return joinLines(next, trailing && next.length > 0)
}

/**
  * True when `text` still contains this hunk's new block at its recorded span.
  */
export function hunkMatches(text: string, hunk: ReviewHunk): boolean {
  const lines = splitLines(text)
  if (hunk.newBlock === '' && hunk.oldBlock === '') {
    const span = Math.max(1, lines.length)
    return hunk.start === 1 && hunk.end === span
  }
  if (hunk.newBlock !== '') {
    const expected = splitLines(hunk.newBlock)
    const slice = lines.slice(hunk.start - 1, hunk.end)
    if (slice.length !== expected.length) return false
    return slice.every((line, index) => line === expected[index])
  }
  const from = Math.max(0, hunk.start - 1)
  return from <= lines.length
}

/** One painted row of the current file, plus deleted lines inserted before their replacement. */
export interface PaintRow {
  kind: 'ctx' | 'add' | 'del'
  text: string
  line?: number
  hunkKey?: string
}

/**
 * Walk the current file and interleave each hunk's deleted block immediately
 * before its new-file span. Unchanged lines keep their current-file numbers.
 */
export function paintFileDiff(before: string, after: string): { rows: PaintRow[]; hunks: ReviewHunk[] } {
  const hunks = hunksFromTexts(before, after)
  const afterLines = splitLines(after)
  const rows: PaintRow[] = []
  let cursor = 1
  for (const hunk of hunks) {
    const ctxEnd = hunk.newBlock === '' ? hunk.start : hunk.start - 1
    while (cursor <= ctxEnd && cursor <= afterLines.length) {
      rows.push({ kind: 'ctx', text: afterLines[cursor - 1] ?? '', line: cursor })
      cursor += 1
    }
    for (const [index, text] of splitLines(hunk.oldBlock).entries()) {
      rows.push({ kind: 'del', text, hunkKey: hunk.key, line: index === 0 ? hunk.start : undefined })
    }
    if (hunk.newBlock !== '') {
      const last = hunk.end
      while (cursor <= last && cursor <= afterLines.length) {
        rows.push({
          kind: 'add',
          text: afterLines[cursor - 1] ?? '',
          line: cursor,
          hunkKey: hunk.key,
        })
        cursor += 1
      }
    }
  }
  while (cursor <= afterLines.length) {
    rows.push({ kind: 'ctx', text: afterLines[cursor - 1] ?? '', line: cursor })
    cursor += 1
  }
  return { rows, hunks }
}

/** After-file only: changed spans wash as add, no interleaved deletions. */
export function paintAfterOnly(before: string, after: string): { rows: PaintRow[]; hunks: ReviewHunk[] } {
  const painted = paintFileDiff(before, after)
  return {
    hunks: painted.hunks,
    rows: painted.rows.filter((row) => row.kind !== 'del'),
  }
}

export interface SplitCell {
  kind: 'ctx' | 'add' | 'del' | 'empty'
  text: string
  line?: number
}

export interface SplitRow {
  left: SplitCell
  right: SplitCell
}

/** Side-by-side rows: previous snapshot on the left, this snapshot on the right. */
export function paintSplitDiff(before: string, after: string): { rows: SplitRow[]; hunks: ReviewHunk[] } {
  const hunks = hunksFromTexts(before, after)
  const oldLines = splitLines(before)
  const newLines = splitLines(after)
  const rows: SplitRow[] = []
  let left = 1
  let right = 1
  const pushCtx = (): void => {
    rows.push({
      left: { kind: 'ctx', text: oldLines[left - 1] ?? '', line: left },
      right: { kind: 'ctx', text: newLines[right - 1] ?? '', line: right },
    })
    left += 1
    right += 1
  }
  for (const hunk of hunks) {
    const ctxEnd = hunk.newBlock === '' ? hunk.start : hunk.start - 1
    while (right <= ctxEnd && right <= newLines.length && left <= oldLines.length) pushCtx()
    const dels = splitLines(hunk.oldBlock)
    const adds = splitLines(hunk.newBlock)
    const count = Math.max(dels.length, adds.length)
    for (let index = 0; index < count; index += 1) {
      const del = dels[index]
      const add = adds[index]
      rows.push({
        left: del === undefined
          ? { kind: 'empty', text: '' }
          : { kind: 'del', text: del, line: left++ },
        right: add === undefined
          ? { kind: 'empty', text: '' }
          : { kind: 'add', text: add, line: right++ },
      })
    }
  }
  while (left <= oldLines.length && right <= newLines.length) pushCtx()
  while (left <= oldLines.length) {
    rows.push({
      left: { kind: 'del', text: oldLines[left - 1] ?? '', line: left },
      right: { kind: 'empty', text: '' },
    })
    left += 1
  }
  while (right <= newLines.length) {
    rows.push({
      left: { kind: 'empty', text: '' },
      right: { kind: 'add', text: newLines[right - 1] ?? '', line: right },
    })
    right += 1
  }
  return { rows, hunks }
}
