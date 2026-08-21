/**
 * Per-path timeline across remaining sessions in the same project.
 * View-only: click a snapshot to inspect it.
 */
import { type ReactNode } from 'react';
import type { HistoryRecord } from '../types.ts';
import type { LocalHistoryFace } from './remote.ts';
import type { Translate } from './locales.ts';
export interface TimelineViewProps {
    path: string;
    sessionId: string;
    cwd?: string;
    remote: LocalHistoryFace;
    t?: Translate;
    selectedId?: string;
    onSelect?: (record: HistoryRecord, records: readonly HistoryRecord[]) => void;
}
export declare function TimelineView(props: TimelineViewProps): ReactNode;
