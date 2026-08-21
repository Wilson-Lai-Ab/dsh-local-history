/**
 * Full-width review list. Clicking a file opens the sidebar editor;
 * timeline sits next to file-level undo.
 */
import { type ReactNode } from 'react';
import type { HistoryRecord } from '../types.ts';
import { type CompareSeed } from './compare.ts';
import type { LocalHistoryFace } from './remote.ts';
import type { Translate } from './locales.ts';
import { type SessionsFace } from './session-tree.ts';
export interface SessionScope {
    sessionId: string;
    cwd?: string;
}
export interface ReviewAppProps {
    scope: SessionScope;
    remote: LocalHistoryFace;
    sessions?: SessionsFace;
    t?: Translate;
    visible?: boolean;
    onOpenCompare?: (seed: CompareSeed) => void;
    onOpenReview?: (record: HistoryRecord) => void;
}
export declare function ReviewApp(props: ReviewAppProps): ReactNode;
export { ReviewApp as ReviewView };
