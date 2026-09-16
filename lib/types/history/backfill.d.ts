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
import { type HistoryStore } from './store.ts';
/** @returns how many records were repaired. */
export declare function backfillAgentBefore(store: HistoryStore): Promise<number>;
