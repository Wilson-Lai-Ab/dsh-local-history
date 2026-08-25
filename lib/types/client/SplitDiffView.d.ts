/**
 * Side-by-side snapshot compare: previous on the left, this version on the right.
 *
 * VSCode-style split: each side is its own scrollable pane with its own
 * vertical and horizontal scrollbars. Both scroll axes are synced (dragging
 * either pane moves the other proportionally) so aligned diff rows stay
 * aligned and the long-line view stays in step. The line-number gutter is
 * sticky-left, so it stays pinned while the code scrolls horizontally. Long
 * lines size the row to its content (`width: max-content` in the CSS) so they
 * grow the pane's scroll width instead of bleeding into the neighbor column.
 */
import { type ReactNode } from 'react';
import type { LocalHistoryFace } from './remote.ts';
import type { Translate } from './locales.ts';
import { type CompareSeed } from './compare.ts';
import { type MinimapPrefsSource } from './review-minimap.ts';
export interface SplitDiffViewProps {
    seed: CompareSeed;
    remote: LocalHistoryFace;
    t?: Translate;
    prefs?: MinimapPrefsSource;
}
export declare function SplitDiffView(props: SplitDiffViewProps): ReactNode;
