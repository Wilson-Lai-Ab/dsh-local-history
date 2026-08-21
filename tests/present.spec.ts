import { describe, expect, it } from 'vitest'
import { collectTurnPrompts, highlightLine, highlightLineHtml, highlightRowsHtml, highlightToHtml, presentReviewHit, promptPreview } from '../src/client/present.ts'

describe('presentReviewHit', () => {
  it('splits cwd-relative path into name, leftover folder, and module', () => {
    expect(presentReviewHit('/proj/src/history/hunks.ts', '/proj')).toEqual({
      name: 'hunks.ts',
      location: 'history',
      module: 'src',
    })
  })
})

describe('promptPreview', () => {
  it('collapses whitespace and ellipsizes long prompts', () => {
    expect(promptPreview('ok\n再来一次', 20)).toBe('ok 再来一次')
    expect(promptPreview('abcdefghij', 8)).toBe('abcdefg…')
  })
})

describe('collectTurnPrompts', () => {
  it('attaches the last user message to the following tool turn', () => {
    const prompts = collectTurnPrompts([
      { kind: 'user', text: '多行也要留些行不改' },
      { kind: 'tool-result', turn: 46 },
    ])
    expect(prompts.get(46)).toBe('多行也要留些行不改')
  })
})

describe('highlightLine', () => {
  it('marks keywords and strings', () => {
    const spans = highlightLine("export const third = 'pad-8'")
    expect(spans.some((span) => span.kind === 'kw' && span.text === 'export')).toBe(true)
    expect(spans.some((span) => span.kind === 'str' && span.text.includes('pad-8'))).toBe(true)
  })

  it('marks Java package / public / class', () => {
    const pkg = highlightLine('package com.hexin.oms;')
    expect(pkg.some((span) => span.kind === 'kw' && span.text === 'package')).toBe(true)
    const pub = highlightLine('public class Foo {')
    expect(pub.some((span) => span.kind === 'kw' && span.text === 'public')).toBe(true)
    expect(pub.some((span) => span.kind === 'kw' && span.text === 'class')).toBe(true)
  })

  it('paints describe/it as functions and other names as idents', () => {
    const line = highlightLine("describe('paintFileDiff', () => {")
    expect(line.some((span) => span.kind === 'fn' && span.text === 'describe')).toBe(true)
    expect(line.some((span) => span.kind === 'str' && span.text.includes('paintFileDiff'))).toBe(true)
    const regex = highlightLine('const str = rest.match(/^foo$/g)')
    expect(regex.some((span) => span.kind === 'str' && span.text.includes('^foo$'))).toBe(true)
    const ident = highlightLine('const before = [')
    expect(ident.some((span) => span.kind === 'kw' && span.text === 'const')).toBe(true)
    expect(ident.some((span) => span.text.includes('before') && span.kind === undefined)).toBe(true)
  })
})

describe('highlightToHtml', () => {
  it('emits one escaped HTML string with token spans', () => {
    const html = highlightToHtml("export const x = '<hi>'")
    expect(html).toContain('data-tok="kw"')
    expect(html).toContain('&lt;hi&gt;')
    expect(html).not.toContain('<hi>')
  })

  it('keeps a block comment green across lines', () => {
    const html = highlightToHtml('/*\n * struck through in place\n */\nexport const x = 1')
    expect(html).toContain('data-tok="cmt"')
    expect(html).toContain('struck through in place')
    expect(html.split('\n')[1]).toContain('data-tok="cmt"')
  })

  it('carries javadoc mode across separately highlighted lines', () => {
    const first = highlightLineHtml('    /**')
    expect(first.mode).toBe('block')
    const body = highlightLineHtml('     * 未删除记录中是否已存在相同地址别称。', first.mode)
    expect(body.html).toContain('data-tok="cmt"')
    expect(body.mode).toBe('block')
    const close = highlightLineHtml('     */', body.mode)
    expect(close.html).toContain('data-tok="cmt"')
    expect(close.mode).toBe('code')
  })

  it('keeps javadoc green across painted rows even when a deletion is interleaved', () => {
    const html = highlightRowsHtml([
      { kind: 'add', text: '    /**' },
      { kind: 'del', text: '    old();' },
      { kind: 'add', text: '     * 未删除记录中是否已存在相同地址别称。' },
      { kind: 'add', text: '     */' },
      { kind: 'add', text: '    public boolean existsByAddressName() {' },
    ])
    expect(html[0]).toContain('data-tok="cmt"')
    expect(html[2]).toContain('data-tok="cmt"')
    expect(html[3]).toContain('data-tok="cmt"')
    expect(html[4]).toContain('data-tok="kw"')
  })
})
