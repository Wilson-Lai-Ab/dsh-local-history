/**
  * The `local-history` settings namespace. Client reads/writes only through
  * getSettings / updateSettings — WEB_SETTINGS_NAMESPACES may not list us.
  * When ctx.settings is missing or register throws, keep clamped in-memory defaults.
  */
import type { Context } from '@deepseek-ai/cordis'
import {
  clampMaxBytes,
  clampMaxPerFile,
  clampRetentionDays,
  DEFAULT_WATCH_ENABLED,
  MAX_BYTES,
  MAX_PER_FILE,
  RETENTION_DAYS,
} from './defaults.ts'
import type { LocalHistorySettings, LocalHistorySettingsScope, LocalHistorySettingsUpdate } from './contract.ts'
import { localHistorySettingsSchema } from './contract.ts'

export const LOCAL_HISTORY_NAMESPACE = 'local-history'

const MB = 1024 * 1024

export const DEFAULT_LOCAL_HISTORY_SETTINGS: LocalHistorySettings = {
  watchEnabled: DEFAULT_WATCH_ENABLED,
  maxPerFile: MAX_PER_FILE,
  maxBytesMb: MAX_BYTES / MB,
  retentionDays: RETENTION_DAYS,
}

export function clampLocalHistorySettings(raw: LocalHistorySettingsUpdate): LocalHistorySettings {
  const watchEnabled = typeof raw.watchEnabled === 'boolean'
    ? raw.watchEnabled
    : DEFAULT_LOCAL_HISTORY_SETTINGS.watchEnabled
  const maxPerFile = clampMaxPerFile(
    typeof raw.maxPerFile === 'number' ? raw.maxPerFile : DEFAULT_LOCAL_HISTORY_SETTINGS.maxPerFile,
  )
  const maxBytesMbRaw = typeof raw.maxBytesMb === 'number'
    ? raw.maxBytesMb
    : DEFAULT_LOCAL_HISTORY_SETTINGS.maxBytesMb
  const maxBytesMb = clampMaxBytes(maxBytesMbRaw * MB) / MB
  const retentionDays = clampRetentionDays(
    typeof raw.retentionDays === 'number' ? raw.retentionDays : DEFAULT_LOCAL_HISTORY_SETTINGS.retentionDays,
  )
  return { watchEnabled, maxPerFile, maxBytesMb, retentionDays }
}

function memoryScope(initial: LocalHistorySettings = DEFAULT_LOCAL_HISTORY_SETTINGS): LocalHistorySettingsScope {
  let current = clampLocalHistorySettings(initial)
  return {
    get: () => current,
    update: async (update) => {
      current = clampLocalHistorySettings({ ...current, ...update })
      return current
    },
  }
}

interface RegisteredScope {
  get?: () => LocalHistorySettings
  update?: (update: LocalHistorySettings) => Promise<unknown>
}

/**
  * Register the namespace when a settings provider exists; otherwise (or if
  * register throws) return an in-memory clamped default scope.
  */
export function registerLocalHistorySettings(ctx: Context): LocalHistorySettingsScope {
  const register = ctx.settings?.register
  if (typeof register !== 'function') return memoryScope()
  try {
    const registered = register(LOCAL_HISTORY_NAMESPACE, localHistorySettingsSchema, { applies: 'live' }) as RegisteredScope | undefined
    if (registered === undefined || typeof registered.get !== 'function') return memoryScope()
    return {
      get: () => clampLocalHistorySettings(registered.get?.() ?? DEFAULT_LOCAL_HISTORY_SETTINGS),
      update: async (update) => {
        const next = clampLocalHistorySettings({ ...(registered.get?.() ?? DEFAULT_LOCAL_HISTORY_SETTINGS), ...update })
        if (typeof registered.update === 'function') await registered.update(next)
        return clampLocalHistorySettings(registered.get?.() ?? next)
      },
    }
  } catch {
    return memoryScope()
  }
}
