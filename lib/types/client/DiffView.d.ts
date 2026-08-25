/**
 * File-style review pane: current disk with line numbers, deletions
 * struck through in place, additions highlighted. Hunk accept/reject
 * appear on hover at the top-right of the painted block, with a line range.
 */
import { type ReactNode } from 'react';
import type { HistoryRecord } from '../types.ts';
import type { LocalHistoryFace } from './remote.ts';
import type { Translate } from './locales.ts';
import { type MinimapPrefsSource } from './review-minimap.ts';
export interface DiffViewProps {
    record: HistoryRecord;
    sessionId: string;
    cwd?: string;
    remote: LocalHistoryFace;
    t?: Translate;
    compareHash?: string | null;
    afterHash?: string | null;
    blobSessionId?: string;
    onChanged?: () => void;
    onFileDone?: () => void;
    onRecord?: (record: HistoryRecord) => void;
    visible?: boolean;
    prefs?: MinimapPrefsSource;
}
export declare function DiffView(props: DiffViewProps): ReactNode;
