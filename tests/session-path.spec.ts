import { describe, expect, it } from 'vitest'
import { encodeSessionSegment, historyDir, projectKey, sessionDir } from '../src/session-path.ts'

describe('encodeSessionSegment', () => {
  it('passes through safe chars', () => {
    expect(encodeSessionSegment('abc-123_X')).toBe('abc-123_X')
  })
  it('encodes empty as throw', () => {
    expect(() => encodeSessionSegment('')).toThrow(/empty/)
  })
  it('encodes . and ..', () => {
    expect(encodeSessionSegment('.')).toBe('~002E')
    expect(encodeSessionSegment('..')).toBe('~002E~002E')
  })
  it('encodes slash and tilde', () => {
    expect(encodeSessionSegment('a/b')).toBe('a~002Fb')
    expect(encodeSessionSegment('a~b')).toBe('a~007Eb')
  })
})

describe('projectKey', () => {
  it('wraps a readable cwd', () => {
    expect(projectKey('/Users/me/work')).toBe('--Users-me-work--')
  })
  it('collapses a trailing slash so listReview hits the same session folder', () => {
    expect(projectKey('/Users/me/work/')).toBe('--Users-me-work--')
    expect(sessionDir('/tmp/sessions', '/proj/', 's').replace(/\\/g, '/'))
      .toBe('/tmp/sessions/--proj--/s')
  })
  it('collapses consecutive separators', () => {
    expect(projectKey('C:\\foo\\bar')).toBe('--C-foo-bar--')
  })
  it('throws on empty cwd', () => {
    expect(() => projectKey('')).toThrow(/empty/)
  })
})

describe('sessionDir', () => {
  it('nests project then session and history', () => {
    const dir = sessionDir('/tmp/sessions', '/proj', 'sid/1')
    expect(dir.replace(/\\/g, '/')).toBe('/tmp/sessions/--proj--/sid~002F1')
    expect(historyDir(dir).replace(/\\/g, '/')).toBe('/tmp/sessions/--proj--/sid~002F1/local-history')
  })
  it('uses _no-cwd when cwd is missing', () => {
    expect(sessionDir('/tmp/sessions', undefined, 's').replace(/\\/g, '/'))
      .toBe('/tmp/sessions/_no-cwd/s')
  })
})
