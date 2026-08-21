/**
  * Host Remote service (`ctx.localHistory`, wire namespace `localHistory`).
  * Constructs HistoryStore from sessionDir(defaultSessionsRoot(), cwd, sessionId).
  */
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { AgentCardHit } from './agent/cards.ts'
import { claimAgentCards } from './agent/tag.ts'
import type { LocalHistorySettings, LocalHistorySettingsScope, LocalHistorySettingsUpdate } from './contract.ts'
import { acceptFile, acceptHunk, rejectFile, rejectHunk, reopenRecord, restoreSnapshot, type ActionIo, type ReopenPayload } from './history/actions.ts'
import type { ReviewHunk } from './history/hunks.ts'
import { HistoryStore } from './history/store.ts'
import type { HistoryLimits, HistoryRecord } from './types.ts'
import { defaultSessionsRoot, historyDir, projectKey, sessionDir } from './session-path.ts'
import { pendingCount } from './pending-latest.ts'
import { handleWatchWrite, startWatcher, type WatchHandle } from './watch/watcher.ts'

const MB = 1024 * 1024
const BINARY_SAMPLE = 4096

export function limitsFromSettings(settings: LocalHistorySettings): HistoryLimits {
  return {
    maxPerFile: settings.maxPerFile,
    maxBytes: settings.maxBytesMb * MB,
    retentionDays: settings.retentionDays,
  }
}

export async function readWorkspaceCurrent(absPath: string): Promise<{ content: string | null; binary: boolean }> {
  let bytes: Buffer
  try {
    bytes = await readFile(absPath)
  } catch {
    return { content: null, binary: false }
  }
  const sample = bytes.subarray(0, BINARY_SAMPLE)
  if (sample.includes(0)) return { content: null, binary: true }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample)
  } catch {
    return { content: null, binary: true }
  }
  return { content: bytes.toString('utf8'), binary: false }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function sessionWatchKey(sessionId: string, cwd: string): string {
  return `${sessionId}\n${cwd}`
}

/**
 * Gateway `validateBinding` requires a live `typertRemote` on the original
 * Cordis service. Profile loads resolve `@deepseek-ai/dsh-typert-protocol`
 * from the harness; unit tests do not. Mirror `bindTypertRemote` here so
 * both paths export the same visible binding.
 */
function attachTypertRemote<T extends object>(service: T, serviceKey: string): void {
  const binding = Object.freeze({ service, serviceKey, namespace: serviceKey })
  Object.defineProperty(service, 'typertRemote', {
    value: binding,
    enumerable: true,
    configurable: false,
    writable: false,
  })
}

/** Host runtime backing the localHistory Remote. */
export class LocalHistoryRuntime {
  private readonly watchers = new Map<string, WatchHandle>()
  private readonly lastHits = new Map<string, AgentCardHit[]>()
  private readonly knownSessions = new Map<string, { sessionId: string; cwd: string }>()
  private readonly stores = new Map<string, HistoryStore>()

  constructor(
    _ctx: Context,
    private readonly settings: LocalHistorySettingsScope,
  ) {
    attachTypertRemote(this, 'localHistory')
  }

  getSettings(): LocalHistorySettings {
    return this.settings.get()
  }

  async updateSettings(update: LocalHistorySettingsUpdate): Promise<LocalHistorySettings> {
    const next = await this.settings.update(update)
    if (!next.watchEnabled) this.stopAllWatchers()
    else this.startKnownWatchers()
    return next
  }

  async listReview(sessionId: string, cwd?: string): Promise<{ records: HistoryRecord[]; pending: number }> {
    const records = (await this.storeFor(sessionId, cwd).load()).records.filter((record) => record.source === 'agent')
    return { records, pending: pendingCount(records) }
  }

  async listTimeline(sessionId: string, cwd: string | undefined, path: string): Promise<{ records: HistoryRecord[] }> {
    const root = defaultSessionsRoot()
    const wanted = normalizePath(path)
    if (cwd === undefined || cwd === '') {
      const records = (await this.storeFor(sessionId, cwd).load()).records
        .filter((record) => normalizePath(record.path) === wanted)
        .slice()
        .sort((a, b) => b.mtime - a.mtime)
      return { records }
    }
    const project = join(root, projectKey(cwd))
    let names: string[]
    try {
      names = await readdir(project)
    } catch {
      return { records: [] }
    }
    const collected: HistoryRecord[] = []
    for (const name of names) {
      const dir = join(project, name)
      const store = new HistoryStore(historyDir(dir))
      const index = await store.load()
      for (const record of index.records) {
        if (normalizePath(record.path) === wanted) collected.push(record)
      }
    }
    collected.sort((a, b) => b.mtime - a.mtime)
    return { records: collected }
  }

  async readBlob(sessionId: string, cwd: string | undefined, hash: string): Promise<{ content: string }> {
    return { content: await this.storeFor(sessionId, cwd).readBlob(hash) }
  }

  async readCurrent(_sessionId: string, _cwd: string | undefined, path: string): Promise<{ content: string | null; binary: boolean }> {
    return await readWorkspaceCurrent(path)
  }

  async acceptFile(sessionId: string, cwd: string | undefined, recordId: string): Promise<{ records: HistoryRecord[] }> {
    const next = await acceptFile(this.actionIo(sessionId, cwd), recordId)
    return { records: next.records }
  }

  async rejectFile(sessionId: string, cwd: string | undefined, recordId: string): Promise<{ records: HistoryRecord[] }> {
    const next = await rejectFile(this.actionIo(sessionId, cwd), recordId)
    return { records: next.records }
  }

  async acceptHunk(sessionId: string, cwd: string | undefined, recordId: string, hunkKey: string): Promise<{ records: HistoryRecord[] }> {
    const next = await acceptHunk(this.actionIo(sessionId, cwd), recordId, hunkKey)
    return { records: next.records }
  }

  async rejectHunk(sessionId: string, cwd: string | undefined, recordId: string, hunk: ReviewHunk): Promise<{ records: HistoryRecord[] }> {
    const next = await rejectHunk(this.actionIo(sessionId, cwd), recordId, hunk)
    return { records: next.records }
  }

  async restore(sessionId: string, cwd: string | undefined, recordId: string): Promise<{ records: HistoryRecord[] }> {
    const next = await restoreSnapshot(this.actionIo(sessionId, cwd), recordId)
    return { records: next.records }
  }

  async reopenRecord(sessionId: string, cwd: string | undefined, recordId: string, payload: ReopenPayload): Promise<{ records: HistoryRecord[] }> {
    const next = await reopenRecord(this.actionIo(sessionId, cwd), recordId, payload)
    return { records: next.records }
  }

  async syncSession(sessionId: string, cwd: string | undefined, hits: AgentCardHit[]): Promise<{ pending: number }> {
    if (cwd !== undefined && cwd !== '') {
      const key = sessionWatchKey(sessionId, cwd)
      this.knownSessions.set(key, { sessionId, cwd })
      this.lastHits.set(key, [...hits])
    } else {
      this.lastHits.set(sessionId, [...hits])
    }
    const store = this.storeFor(sessionId, cwd)
    const settings = this.settings.get()
    await claimAgentCards({
      store,
      sessionId,
      cwd,
      hits,
      limits: limitsFromSettings(settings),
      readCurrent: readWorkspaceCurrent,
    })
    if (settings.watchEnabled && cwd !== undefined && cwd !== '') this.ensureWatcher(sessionId, cwd)
    const records = (await store.load()).records
    return { pending: pendingCount(records) }
  }

  dispose(): void {
    this.stopAllWatchers()
  }

  private storeFor(sessionId: string, cwd: string | undefined): HistoryStore {
    const root = historyDir(sessionDir(defaultSessionsRoot(), cwd, sessionId))
    const cached = this.stores.get(root)
    if (cached !== undefined) return cached
    const store = new HistoryStore(root)
    this.stores.set(root, store)
    return store
  }

  private actionIo(sessionId: string, cwd: string | undefined): ActionIo {
    const store = this.storeFor(sessionId, cwd)
    return {
      store,
      sessionId,
      limits: limitsFromSettings(this.settings.get()),
      writeFile: (path, content) => writeFile(path, content),
      unlink: (path) => unlink(path),
      readFile: async (path) => (await readWorkspaceCurrent(path)).content,
    }
  }

  private ensureWatcher(sessionId: string, cwd: string): void {
    const key = sessionWatchKey(sessionId, cwd)
    if (this.watchers.has(key)) return
    const handle = startWatcher(cwd, (absPath) => {
      void handleWatchWrite({
        store: this.storeFor(sessionId, cwd),
        sessionId,
        cwd,
        absPath,
        limits: limitsFromSettings(this.settings.get()),
        hits: this.lastHits.get(key) ?? this.lastHits.get(sessionId) ?? [],
        readCurrent: readWorkspaceCurrent,
      })
    })
    this.watchers.set(key, handle)
  }

  private startKnownWatchers(): void {
    for (const { sessionId, cwd } of this.knownSessions.values()) this.ensureWatcher(sessionId, cwd)
  }

  private stopAllWatchers(): void {
    for (const handle of this.watchers.values()) handle.close()
    this.watchers.clear()
  }
}
