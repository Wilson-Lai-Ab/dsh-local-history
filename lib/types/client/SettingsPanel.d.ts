/**
 * Gear panel for host local-history settings. Seeds from getSettings and
 * writes only through updateSettings (not sidebar pluginSettings).
 */
import { type ReactNode } from 'react';
import type { LocalHistoryFace } from './remote.ts';
import type { Translate } from './locales.ts';
export interface SettingsPanelProps {
    remote: LocalHistoryFace;
    t?: Translate;
}
export declare function SettingsPanel(props: SettingsPanelProps): ReactNode;
