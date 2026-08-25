/**
 * Character-mode density thumbnail for local-history review panes.
 * Matches the file-preview Replit minimap look (fillText glyphs + overlay)
 * without pulling CodeMirror into this plugin.
 */
import { type ReactNode } from 'react';
export interface MinimapRow {
    kind: 'ctx' | 'add' | 'del' | 'empty';
    text: string;
}
export interface MinimapGlyph {
    text: string;
    color: string;
}
export interface MinimapLine {
    glyphs: MinimapGlyph[];
    wash?: string;
}
export declare function minimapWidthPx(hostWidth: number): number;
export declare function minimapLayout(input: {
    rowCount: number;
    gutterHeight: number;
    scrollHeight: number;
    clientHeight: number;
    scrollTop: number;
    editorLinePx?: number;
}): {
    lineHeight: number;
    paintHeight: number;
    overlayHeight: number;
    overlayTop: number;
};
export declare function minimapLines(rows: readonly MinimapRow[]): MinimapLine[];
export declare function minimapClickRatio(offsetY: number, height: number): number;
export interface MinimapPrefsSource {
    getSnapshot?: () => {
        prefs?: {
            editorMinimap?: boolean;
        };
    };
    subscribeState?: (listener: () => void) => () => void;
}
export declare function readEditorMinimap(source?: MinimapPrefsSource): boolean;
export declare function useEditorMinimap(source?: MinimapPrefsSource): boolean;
export declare function ReviewMinimap(props: {
    rows: readonly MinimapRow[];
    scrollEl: HTMLElement | null;
    enabled?: boolean;
}): ReactNode;
