/** Directory basenames skipped by the workspace watcher (sidebar-aligned). */
export const DEFAULT_IGNORE_DIRS = [
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
] as const

export const MAX_PER_FILE = 50
export const MAX_BYTES = 200 * 1024 * 1024
export const RETENTION_DAYS = 30
export const DEFAULT_WATCH_ENABLED = true

const MIN_PER_FILE = 1
const MAX_PER_FILE_CAP = 200
const MIN_BYTES = 16 * 1024 * 1024
const MAX_BYTES_CAP = 2048 * 1024 * 1024
const MIN_RETENTION_DAYS = 1
const MAX_RETENTION_DAYS = 365

const IGNORE_DIR_SET = new Set<string>(DEFAULT_IGNORE_DIRS)

export function shouldSkipDir(name: string): boolean {
  return name.startsWith('.') || IGNORE_DIR_SET.has(name)
}

export function clampMaxPerFile(n: number): number {
  if (!Number.isFinite(n)) return MAX_PER_FILE
  if (n < MIN_PER_FILE) return MIN_PER_FILE
  if (n > MAX_PER_FILE_CAP) return MAX_PER_FILE_CAP
  return n
}

export function clampMaxBytes(n: number): number {
  if (!Number.isFinite(n)) return MAX_BYTES
  if (n < MIN_BYTES) return MIN_BYTES
  if (n > MAX_BYTES_CAP) return MAX_BYTES_CAP
  return n
}

export function clampRetentionDays(n: number): number {
  if (!Number.isFinite(n)) return RETENTION_DAYS
  if (n < MIN_RETENTION_DAYS) return MIN_RETENTION_DAYS
  if (n > MAX_RETENTION_DAYS) return MAX_RETENTION_DAYS
  return n
}
