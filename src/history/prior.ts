/**
 * Resolving the version a change should be compared against.
 *
 * The newest record for a path is often NOT a usable "before": the watcher
 * writes its own save record for the very same bytes the agent just wrote, so
 * comparing against it yields an EMPTY diff — the panel shows the file with
 * nothing highlighted even though the agent really did change it.
 *
 * Newness follows the index's append order rather than mtime/id: several
 * records can share a millisecond, and ids are random UUIDs.
 */
import type { HistoryStore } from './store.ts'
import type { HistoryRecord } from '../types.ts'

function samePath(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
}

/**
 * Newest version of `path` before `beforeIndex` (exclusive; default: the whole
 * index) whose content differs from `exceptHash` and whose blob still exists.
 *
 * A null result means the path has no earlier differing content, i.e. this
 * change created it.
 */
export async function newestDifferentPrior(
  store: HistoryStore,
  records: readonly HistoryRecord[],
  path: string,
  exceptHash: string | null,
  beforeIndex: number = records.length,
): Promise<string | null> {
  const start = Math.min(beforeIndex, records.length) - 1
  for (let index = start; index >= 0; index -= 1) {
    const record = records[index]
    if (record === undefined) continue
    if (!samePath(record.path, path)) continue
    if (record.hash === null || record.hash === exceptHash) continue
    if (await store.hasBlob(record.hash)) return record.hash
  }
  return null
}
