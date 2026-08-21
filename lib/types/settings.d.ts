/**
  * The `local-history` settings namespace. Client reads/writes only through
  * getSettings / updateSettings — WEB_SETTINGS_NAMESPACES may not list us.
  * When ctx.settings is missing or register throws, keep clamped in-memory defaults.
  */
import type { Context } from '@deepseek-ai/cordis';
import type { LocalHistorySettings, LocalHistorySettingsScope, LocalHistorySettingsUpdate } from './contract.ts';
export declare const LOCAL_HISTORY_NAMESPACE = "local-history";
export declare const DEFAULT_LOCAL_HISTORY_SETTINGS: LocalHistorySettings;
export declare function clampLocalHistorySettings(raw: LocalHistorySettingsUpdate): LocalHistorySettings;
/**
  * Register the namespace when a settings provider exists; otherwise (or if
  * register throws) return an in-memory clamped default scope.
  */
export declare function registerLocalHistorySettings(ctx: Context): LocalHistorySettingsScope;
