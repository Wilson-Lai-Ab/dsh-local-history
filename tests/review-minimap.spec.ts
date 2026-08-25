import { describe, expect, it } from 'vitest'
import {
  minimapClickRatio,
  minimapLayout,
  minimapLines,
  minimapWidthPx,
  readEditorMinimap,
  type MinimapRow,
} from '../src/client/review-minimap.ts'

describe('review minimap (character mode)', () => {
  it('matches the file-preview width formula min(120, host/6)', () => {
    expect(minimapWidthPx(384)).toBe(64)
    expect(minimapWidthPx(720)).toBe(120)
    expect(minimapWidthPx(1200)).toBe(120)
  })

  it('keeps Replit 1/4 scale on short files instead of stretching to the pane', () => {
    const short = minimapLayout({
      rowCount: 40,
      editorLinePx: 20,
      gutterHeight: 800,
      scrollHeight: 800,
      clientHeight: 800,
      scrollTop: 0,
    })
    expect(short.lineHeight).toBe(5)
    expect(short.paintHeight).toBe(200)
    expect(short.overlayHeight).toBe(200)
    expect(short.overlayTop).toBe(0)
  })

  it('paints keyword glyphs instead of a single density bar color', () => {
    const rows: MinimapRow[] = [
      { kind: 'ctx', text: 'const name = "hi"' },
      { kind: 'add', text: 'inserted' },
      { kind: 'del', text: 'removed' },
    ]
    const lines = minimapLines(rows)
    expect(lines).toHaveLength(3)
    const keyword = lines[0]?.glyphs.find((glyph) => glyph.text.includes('const'))
    const string = lines[0]?.glyphs.find((glyph) => glyph.text.includes('hi'))
    expect(keyword).toBeDefined()
    expect(string).toBeDefined()
    expect(keyword!.color).not.toBe(string!.color)
    expect(lines[1]?.wash).toBeDefined()
    expect(lines[2]?.wash).toBeDefined()
    expect(lines[1]?.wash).not.toBe(lines[2]?.wash)
    expect(lines[0]?.wash).toBeUndefined()
  })

  it('maps a click in the top quarter to ratio 0.25', () => {
    expect(minimapClickRatio(25, 100)).toBe(0.25)
    expect(minimapClickRatio(-10, 100)).toBe(0)
    expect(minimapClickRatio(200, 100)).toBe(1)
  })

  it('follows the sidebar editorMinimap pref, defaulting on', () => {
    expect(readEditorMinimap()).toBe(true)
    expect(readEditorMinimap({ getSnapshot: () => ({ prefs: {} }) })).toBe(true)
    expect(readEditorMinimap({ getSnapshot: () => ({ prefs: { editorMinimap: false } }) })).toBe(false)
  })
})
