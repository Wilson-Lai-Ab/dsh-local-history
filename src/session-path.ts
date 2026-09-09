/**
 * Session-directory encoding. `encodeSessionSegment` and `projectKey` are
 * copied from DSH's jsonl session encoding so local-history lives next to
 * `session.jsonl.zstd`. Trailing slashes on `cwd` are stripped so `/proj`
 * and `/proj/` share one folder.
 */
import { join } from 'node:path'
import { homedir } from 'node:os'

/** Encode one path segment the same way DSH's jsonl backend does. */
export function encodeSessionSegment(raw: string): string {
  if (raw.length === 0) throw new Error('cannot encode an empty path segment')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += `~${code.toString(16).toUpperCase().padStart(4, '0')}`
  }
  return out
}

/** Drop trailing slashes so `/proj` and `/proj/` share one session folder. */
export function normalizeCwd(cwd: string | undefined): string | undefined {
  if (cwd === undefined) return undefined
  const trimmed = cwd.replace(/[\\/]+$/, '')
  return trimmed === '' ? undefined : trimmed
}

/** Human-navigable project folder under `~/.dsh/sessions`. */
export function projectKey(cwd: string): string {
  const trimmed = normalizeCwd(cwd)
  if (trimmed === undefined) throw new Error('cannot encode an empty project path')
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i]!
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += `~${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`
}

export function defaultSessionsRoot(): string {
  const fromEnv = process.env.DSH_SESSIONS_ROOT
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv
  return join(homedir(), '.dsh', 'sessions')
}

export function sessionDir(root: string, cwd: string | undefined, sessionId: string): string {
  const normalized = normalizeCwd(cwd)
  const project = normalized === undefined ? join(root, '_no-cwd') : join(root, projectKey(normalized))
  return join(project, encodeSessionSegment(sessionId))
}

export function historyDir(sessionDirPath: string): string {
  return join(sessionDirPath, 'local-history')
}
