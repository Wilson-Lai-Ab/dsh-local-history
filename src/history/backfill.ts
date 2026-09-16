/**
  * Historical repair for records written before `write` was understood as a
  * whole-file replacement: those landed as `kind: 'add'` with no `beforeHash`,
  * so the review pane painted the ENTIRE file as newly added even though only
  * a few lines had changed. The real previous snapshot is usually still in the
  * same index; this pass points the record back at it.
  *
  * Idempotent, and it never touches a record that already carries a
  * `beforeHash` (including the empty-blob hash of a genuine empty file).
  */
import { sha256Hex, type HistoryStore } from './store.ts'
import type { HistoryRecord } from '../types.ts'

function samePath(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
}

/**
  * Newest earlier snapshot of the same path whose content differs from this
  * record's and whose blob is still on disk. Same-content records (the watcher
  * saving the very bytes the agent just wrote) are skipped: they are not a
  * usable "before".
  */
async function newestDifferentPrior(
  store: HistoryStore,
  records: readonly HistoryRecord[],
  record: HistoryRecord,
): Promise<string | null> {
  const candidates = records
    .filter((item) => item.id !== record.id && samePath(item.path, record.path))
    .filter((item) => item.mtime < record.mtime || (item.mtime === record.mtime && item.id < record.id))
    .filter((item) => item.hash !== null && item.hash !== record.hash)
    .sort((a, b) => b.mtime - a.mtime || b.id.localeCompare(a.id))
  for (const candidate of candidates) {
    if (candidate.hash !== null && (await store.hasBlob(candidate.hash))) return candidate.hash
  }
  return null
}

/** @returns how many records were repaired. */
export async function backfillAgentBefore(store: HistoryStore): Promise<number> {
  return store.withLock(async () => {
    const index = await store.load()
    const emptyHash = sha256Hex('')
    let repaired = 0
    for (const record of index.records) {
      if (record.source !== 'agent') continue
      if (record.kind !== 'add') continue
      if (record.beforeHash !== null && record.beforeHash !== emptyHash) continue
      if (record.hash === null) continue
      const before = await newestDifferentPrior(store, index.records, record)
      if (before === null) continue
      record.beforeHash = before
      record.kind = 'edit'
      repaired += 1
    }
    if (repaired > 0) await store.save(index)
    return repaired
  })
}
