import { describe, expect, it } from 'vitest'
import {
  DEFAULT_IGNORE_DIRS,
  DEFAULT_WATCH_ENABLED,
  MAX_BYTES,
  MAX_PER_FILE,
  RETENTION_DAYS,
  clampMaxBytes,
  clampMaxPerFile,
  clampRetentionDays,
  shouldSkipDir,
} from '../src/defaults.ts'

const MB = 1024 * 1024

describe('ignore list', () => {
  it('skips sidebar-aligned build and VCS directories', () => {
    for (const name of [
      'node_modules',
      '.git',
      'dist',
      'lib',
      'coverage',
      '.pnpm-store',
      'target',
      'build',
      '.next',
      '.turbo',
      'out',
    ]) {
      expect(DEFAULT_IGNORE_DIRS, name).toContain(name)
      expect(shouldSkipDir(name), name).toBe(true)
    }
  })

  it('skips any dotted directory name', () => {
    expect(shouldSkipDir('.cache')).toBe(true)
    expect(shouldSkipDir('.hidden')).toBe(true)
  })

  it('does not skip ordinary source directories', () => {
    expect(shouldSkipDir('src')).toBe(false)
    expect(shouldSkipDir('client')).toBe(false)
  })
})

describe('settings clamps', () => {
  it('uses documented defaults', () => {
    expect(MAX_PER_FILE).toBe(50)
    expect(MAX_BYTES).toBe(200 * MB)
    expect(RETENTION_DAYS).toBe(30)
    expect(DEFAULT_WATCH_ENABLED).toBe(true)
  })

  it('clamps maxPerFile to 1–200 and falls back to 50', () => {
    expect(clampMaxPerFile(1)).toBe(1)
    expect(clampMaxPerFile(200)).toBe(200)
    expect(clampMaxPerFile(0)).toBe(1)
    expect(clampMaxPerFile(201)).toBe(200)
    expect(clampMaxPerFile(Number.NaN)).toBe(50)
  })

  it('clamps maxBytes to 16MB–2048MB and falls back to 200MB', () => {
    expect(clampMaxBytes(16 * MB)).toBe(16 * MB)
    expect(clampMaxBytes(2048 * MB)).toBe(2048 * MB)
    expect(clampMaxBytes(15 * MB)).toBe(16 * MB)
    expect(clampMaxBytes(2049 * MB)).toBe(2048 * MB)
    expect(clampMaxBytes(Number.NaN)).toBe(200 * MB)
  })

  it('clamps retentionDays to 1–365 and falls back to 30', () => {
    expect(clampRetentionDays(1)).toBe(1)
    expect(clampRetentionDays(365)).toBe(365)
    expect(clampRetentionDays(0)).toBe(1)
    expect(clampRetentionDays(366)).toBe(365)
    expect(clampRetentionDays(Number.NaN)).toBe(30)
  })
})
