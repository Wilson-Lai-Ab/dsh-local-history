import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(import.meta.dirname, '../src/client/styles.ts'), 'utf8')

describe('review kind colors', () => {
  it('uses git-panel business-primary for edits, not washed brand-primary', () => {
    expect(css).toContain(".dsh_lh_kind[data-kind='edit']")
    expect(css).toMatch(/data-kind='edit'[^}]*--dsw-alias-state-business-primary/)
    expect(css).not.toMatch(/data-kind='edit'[^}]*--dsw-alias-brand-primary/)
  })

  it('colors the of-location folder with the same kind as the file name', () => {
    expect(css).toContain(".dsh_lh_location[data-kind='edit']")
    expect(css).toContain(".dsh_lh_location[data-kind='add']")
    expect(css).toContain(".dsh_lh_location[data-kind='delete']")
  })
})
