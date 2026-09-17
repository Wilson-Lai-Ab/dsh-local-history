/**
  * Historical repair for records written before the "version to compare against"
  * rule was right. Two flavours of the same defect, both rendering as an
  * honest-looking but useless pane:
  *
  * 1. `write` (whole-file replacement) landed as `kind: 'add'` with no
  *    `beforeHash`, so the ENTIRE file painted as newly added.
  * 2. `beforeHash` pointed at a snapshot holding the SAME bytes as the new
  *    content (the watcher saves the very bytes the agent wrote), so the diff
  *    compared the file against itself and highlighted nothing at all.
  *
  * The real previous version is usually still in the same index; this pass
  * points the record back at it. Idempotent, and it never touches a record whose
  * before/after pair already differs.
  */
import { newestDifferentPrior } from './prior.ts'
import { sha256Hex, type HistoryStore } from './store.ts'

/** @returns how many records were repaired. */
export async function backfillAgentBefore(store: HistoryStore): Promise<number> {
  return store.withLock(async () => {
    const index = await store.load()
    const emptyHash = sha256Hex('')
    let repaired = 0
    for (const [position, record] of index.records.entries()) {
      if (record.source !== 'agent') continue
      if (record.hash === null) continue
      const missingBefore = record.kind === 'add'
        && (record.beforeHash === null || record.beforeHash === emptyHash)
      // A "before" identical to the content is the same defect as a missing one:
      // nothing gets highlighted, and no later sync repairs it either.
      const emptyDiff = record.beforeHash !== null && record.beforeHash === record.hash
      if (!missingBefore && !emptyDiff) continue

      const prior = await newestDifferentPrior(store, index.records, record.path, record.hash, position)
      if (prior !== null) {
        if (record.beforeHash !== prior || record.kind !== 'edit') {
          record.beforeHash = prior
          record.kind = 'edit'
          repaired += 1
        }
        continue
      }
      // No earlier differing content at all: this change created the file.
      if (record.kind !== 'add' || record.beforeHash !== null) {
        record.kind = 'add'
        record.beforeHash = null
        repaired += 1
      }
    }
    if (repaired > 0) await store.save(index)
    return repaired
  })
}
