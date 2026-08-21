/**
 * Fast snapshot pane: one <pre> for code, one for line numbers.
 * No per-token React nodes — opening a snapshot must stay cheap.
 */
import { type ReactNode } from 'react';
import type { HistoryRecord } from '../types.ts';
import type { LocalHistoryFace } from './remote.ts';
import type { Translate } from './locales.ts';
export interface SnapshotViewProps {
    record: HistoryRecord;
    cwd?: string;
    remote: LocalHistoryFace;
    t?: Translate;
    onClose?: () => void;
}
export declare function SnapshotView(props: SnapshotViewProps): ReactNode;
