import { describe, expect, it } from 'vitest'
import { collectTurnRounds, highlightLine, highlightLineHtml, highlightRowsHtml, highlightToHtml, presentReviewHit, promptPreview, roundAt, type TurnRound } from '../src/client/present.ts'

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

describe('collectTurnRounds', () => {
  const event = (type: string, data: unknown) => ({ type: 'event', event: { type, data } })
  const user = (text: string, kind = 'user') => event('user/message', {
    content: [{ type: 'text', text }],
    source: { kind },
  })

  it('numbers rounds by user input and skips auto-continued turns', () => {
    const rounds = collectTurnRounds([
      event('turn/start', { turn: 1 }),
      user('第一问'),
      event('turn/start', { turn: 2 }),
      user('第二问'),
      event('turn/start', { turn: 3 }),
      event('turn/start', { turn: 4 }),
      user('第三问'),
    ])
    expect(rounds.get(1)).toEqual({ sinceTurn: 1, round: 1, prompt: '第一问' })
    expect(rounds.get(2)).toEqual({ sinceTurn: 2, round: 2, prompt: '第二问' })
    expect(rounds.has(3)).toBe(false)
    expect(rounds.get(4)).toEqual({ sinceTurn: 4, round: 3, prompt: '第三问' })
  })

  it('ignores injected user/message sources', () => {
    const rounds = collectTurnRounds([
      event('turn/start', { turn: 1 }),
      user('技能目录', 'skill-catalog'),
      user('插件注入', 'plugin'),
      user('运行时上下文', 'agent-instructions'),
    ])
    expect(rounds.size).toBe(0)
  })

  it('lets the first message of a turn name its round', () => {
    const rounds = collectTurnRounds([
      event('turn/start', { turn: 1 }),
      user('主问题'),
      user('补一句'),
    ])
    expect(rounds.get(1)).toEqual({ sinceTurn: 1, round: 1, prompt: '主问题' })
  })

  it('binds a prompt that arrives before any turn/start to the first turn', () => {
    const rounds = collectTurnRounds([user('先说的话'), event('turn/start', { turn: 1 })])
    expect(rounds.get(1)).toEqual({ sinceTurn: 1, round: 1, prompt: '先说的话' })
  })

  it('keeps prompts but omits the ordinal when the window is not numbered', () => {
    const rounds = collectTurnRounds([
      event('turn/start', { turn: 9 }),
      user('很久以后的第九问'),
    ], { numbered: false })
    expect(rounds.get(9)).toEqual({ sinceTurn: 9, prompt: '很久以后的第九问' })
    expect(rounds.get(9)?.round).toBeUndefined()
  })

  it('keeps a stable per-turn identity even when ordinals are unavailable', () => {
    // C1 regression guard: grouping keys off sinceTurn, never off the ordinal,
    // otherwise every unnumbered turn collapses into one group.
    const rounds = collectTurnRounds([
      event('turn/start', { turn: 24 }),
      user('第二十四问'),
      event('turn/start', { turn: 25 }),
      user('第二十五问'),
      event('turn/start', { turn: 26 }),
      user('第二十六问'),
    ], { numbered: false })
    expect([...rounds.keys()]).toEqual([24, 25, 26])
    expect(rounds.get(24)?.sinceTurn).toBe(24)
    expect(rounds.get(26)?.sinceTurn).toBe(26)
  })
})

describe('roundAt', () => {
  it('merges a turn with no user input into the previous round', () => {
    const rounds = new Map<number | 'x', TurnRound>([
      [1, { sinceTurn: 1, round: 1, prompt: 'A' }],
      [4, { sinceTurn: 4, round: 2, prompt: 'B' }],
    ])
    expect(roundAt(rounds, 3)).toEqual({ sinceTurn: 1, round: 1, prompt: 'A' })
    expect(roundAt(rounds, 4)).toEqual({ sinceTurn: 4, round: 2, prompt: 'B' })
    expect(roundAt(rounds, 1)).toEqual(rounds.get(1))
    expect(roundAt(rounds, undefined)).toBeUndefined()
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
