/**
 * Shared TypeScript-only types for dsh-local-history.
 * Wire contract types land in later tasks (`contract.ts`).
 */

/** Host plugin configuration after schema defaults are applied. */
export interface ResolvedConfig {
  readonly watchEnabled: boolean
  readonly maxPerFile: number
  readonly maxBytes: number
  readonly retentionDays: number
}

export type HistorySource = 'agent' | 'save'
export type HistoryKind = 'add' | 'edit' | 'delete'
export type HistoryDecision = 'pending' | 'accepted' | 'rejected'

export interface HistoryRecord {
  id: string
  path: string
  hash: string | null
  beforeHash: string | null
  bytes: number
  mtime: number
  source: HistorySource
  kind: HistoryKind
  sessionId: string
  turn?: number
  agentSessionId?: string
  decision?: HistoryDecision
  hunks?: Record<string, 'accepted' | 'rejected'>
}

export interface HistoryIndex {
  version: 1
  records: HistoryRecord[]
}

export interface HistoryLimits {
  maxPerFile: number
  maxBytes: number
  retentionDays: number
}
