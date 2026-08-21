/**
 * Gear panel for host local-history settings. Seeds from getSettings and
 * writes only through updateSettings (not sidebar pluginSettings).
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { LocalHistorySettings } from '../contract.ts'
import type { LocalHistoryFace } from './remote.ts'
import { unwrapResult } from './remote.ts'
import type { Translate } from './locales.ts'
import { lookup } from './locales.ts'

export interface SettingsPanelProps {
  remote: LocalHistoryFace
  t?: Translate
}

export function SettingsPanel(props: SettingsPanelProps): ReactNode {
  const t = props.t ?? lookup
  const [value, setValue] = useState<LocalHistorySettings | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    void props.remote.getSettings()
      .then((result) => {
        if (cancelled) return
        setValue(unwrapResult(result))
        setError(false)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => { cancelled = true }
  }, [props.remote])

  const commit = async (update: Partial<LocalHistorySettings>): Promise<void> => {
    try {
      const next = unwrapResult(await props.remote.updateSettings(update))
      setValue(next)
      setError(false)
    } catch {
      setError(true)
    }
  }

  if (error && value === null) return <div className="dsh_lh_error">{t('loadFailed')}</div>
  if (value === null) return <div className="dsh_lh_empty" />

  return (
    <div className="dsh_lh_settings" data-lh-settings="">
      {error && <div className="dsh_lh_error">{t('loadFailed')}</div>}
      <label className="dsh_lh_settingRow">
        <span>{t('watchEnabled')}</span>
        <input
          type="checkbox"
          checked={value.watchEnabled}
          onChange={(event) => { void commit({ watchEnabled: event.target.checked }) }}
        />
      </label>
      <label className="dsh_lh_settingRow">
        <span>{t('maxPerFile')}</span>
        <input
          type="number"
          min={1}
          max={200}
          value={value.maxPerFile}
          onChange={(event) => { void commit({ maxPerFile: Number(event.target.value) }) }}
        />
      </label>
      <label className="dsh_lh_settingRow">
        <span>{t('maxBytesMb')}</span>
        <input
          type="number"
          min={16}
          max={2048}
          value={value.maxBytesMb}
          onChange={(event) => { void commit({ maxBytesMb: Number(event.target.value) }) }}
        />
      </label>
      <label className="dsh_lh_settingRow">
        <span>{t('retentionDays')}</span>
        <input
          type="number"
          min={1}
          max={365}
          value={value.retentionDays}
          onChange={(event) => { void commit({ retentionDays: Number(event.target.value) }) }}
        />
      </label>
    </div>
  )
}
