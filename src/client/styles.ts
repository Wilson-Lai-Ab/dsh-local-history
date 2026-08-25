/**
 * Review-tab stylesheet, injected once. Tokens come only from `--dsw-alias-*`.
 */

export const STYLE_ID = 'dsh-local-history-style'

export const cssText = `
.dsh_lh_root {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  font: inherit;
}
.dsh_lh_filters {
  display: flex;
  flex: none;
  gap: 6px;
  padding: 6px 10px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dsh_lh_filter {
  flex: none;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dsh_lh_filter:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh_lh_filter[aria-selected='true'] {
  background: var(--dsw-alias-button-ghost-active-fill);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
.dsh_lh_pendingCount {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}
.dsh_lh_toolbarGrow {
  flex: 1 1 auto;
  min-width: 0;
}
.dsh_lh_body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}
.dsh_lh_list {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.dsh_lh_list[data-lh-full=''] {
  width: 100%;
  max-width: none;
  border-right: 0;
}
.dsh_lh_pane {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.dsh_lh_group {
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.dsh_lh_group:first-child {
  border-top: 0;
}
.dsh_lh_groupHeader {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px 4px;
}
.dsh_lh_groupMeta {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.dsh_lh_groupTurn {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}
.dsh_lh_groupTime,
.dsh_lh_groupCount {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}
.dsh_lh_groupPrompt {
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_lh_row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 6px;
  padding: 4px 8px;
  border-radius: 8px;
  min-width: 0;
}
.dsh_lh_row:hover,
.dsh_lh_row[data-selected='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh_lh_rowMain {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh_lh_kind {
  flex: none;
  width: 20px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 700;
}
.dsh_lh_kind[data-kind='add'],
.dsh_lh_name[data-kind='add'] { color: var(--dsw-alias-state-success-primary); }
.dsh_lh_kind[data-kind='delete'],
.dsh_lh_name[data-kind='delete'] { color: var(--dsw-alias-state-error-primary); }
.dsh_lh_kind[data-kind='edit'],
.dsh_lh_name[data-kind='edit'] { color: var(--dsw-alias-brand-primary); }
.dsh_lh_name {
  flex: none;
  max-width: 55%;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_lh_location {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_lh_module {
  flex: none;
  max-width: 28%;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_lh_rowActions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dsh_lh_chevron {
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 22px;
  cursor: pointer;
}
.dsh_lh_chevron:hover,
.dsh_lh_chevron[aria-expanded='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh_lh_status {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}
.dsh_lh_empty,
.dsh_lh_error {
  padding: 16px 12px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}
.dsh_lh_error {
  color: var(--dsw-alias-state-error-primary);
}
.dsh_lh_toolbar {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dsh_lh_button {
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dsh_lh_button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh_lh_button:disabled {
  opacity: 0.45;
  cursor: default;
}
.dsh_lh_button[data-kind='danger']:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
}
.dsh_lh_button[data-kind='keep'] {
  border: 0;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-inverted);
}
.dsh_lh_button[data-kind='keep']:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-inverted);
  filter: brightness(1.05);
}
.dsh_lh_reviewBar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dsh_lh_reviewHint {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.dsh_lh_reviewActions {
  display: flex;
  flex: none;
  gap: 6px;
}
.dsh_lh_fileWrap {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  --dsh-lh-minimap: min(120px, calc(100% / 6));
}
.dsh_lh_file {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 20px;
}
.dsh_lh_block {
  position: relative;
}
.dsh_lh_inlineBar {
  position: absolute;
  top: 2px;
  right: calc(8px + var(--dsh-lh-minimap, 0px));
  z-index: 1;
  display: none;
  gap: 4px;
}
.dsh_lh_block:hover .dsh_lh_inlineBar {
  display: flex;
}
.dsh_lh_inlineBar .dsh_lh_button {
  height: 24px;
  padding: 0 10px;
  font-size: 11px;
}
.dsh_lh_rowLine {
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  min-width: 0;
  width: 100%;
  white-space: pre;
}
.dsh_lh_gutter {
  flex: none;
  box-sizing: border-box;
  width: 40px;
  padding: 0 8px 0 0;
  border-right: 3px solid transparent;
  color: var(--dsw-alias-label-tertiary);
  text-align: right;
  user-select: none;
}
.dsh_lh_code {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 12px 0 8px;
}
.dsh_lh_code [data-tok='kw'],
.dsh_lh_rowLine[data-mark] .dsh_lh_code [data-tok='kw'] {
  color: var(--dsw-alias-brand-primary);
}
.dsh_lh_code [data-tok='str'],
.dsh_lh_rowLine[data-mark] .dsh_lh_code [data-tok='str'] {
  color: var(--dsw-alias-state-success-primary);
}
.dsh_lh_code [data-tok='cmt'],
.dsh_lh_rowLine[data-mark] .dsh_lh_code [data-tok='cmt'] {
  color: var(--dsw-alias-label-tertiary);
}
.dsh_lh_code [data-tok='fn'],
.dsh_lh_rowLine[data-mark] .dsh_lh_code [data-tok='fn'] {
  color: var(--dsw-alias-label-primary);
}
.dsh_lh_rowLine[data-mark='del'] {
  background: var(--dsw-alias-state-error-bg);
}
.dsh_lh_rowLine[data-mark='del'] .dsh_lh_gutter {
  border-right-color: var(--dsw-alias-state-error-primary);
}
.dsh_lh_rowLine[data-mark='del'] .dsh_lh_code {
  text-decoration: line-through;
}
.dsh_lh_rowLine[data-mark='add'] {
  background: color-mix(in srgb, var(--dsw-alias-state-success-bg) 55%, transparent);
}
.dsh_lh_rowLine[data-mark='add'] .dsh_lh_gutter {
  border-right-color: var(--dsw-alias-state-success-primary);
}
.dsh_lh_rowLine[data-mark='empty'] {
  background: var(--dsw-alias-bg-layer-2, transparent);
}
.dsh_lh_drift {
  padding: 4px 12px;
  color: var(--dsw-alias-state-warning-primary);
  font-size: 12px;
}
.dsh_lh_timeline {
  flex: none;
  min-height: 0;
  margin: 0 12px 8px 36px;
  overflow: auto;
  border-left: 1px solid var(--dsw-alias-border-l1);
}
.dsh_lh_timeRow {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh_lh_timeRow:hover,
.dsh_lh_timeRow[data-selected='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh_lh_timeWhen {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
.dsh_lh_timeSession {
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_lh_snapshot {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.dsh_lh_snapBody {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 18px;
}
.dsh_lh_snapGutter {
  flex: none;
  margin: 0;
  padding: 8px 8px 8px 12px;
  border-right: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-tertiary);
  text-align: right;
  user-select: none;
}
.dsh_lh_snapCode {
  flex: 1 1 auto;
  margin: 0;
  padding: 8px 12px;
  min-width: 0;
  white-space: pre;
}
.dsh_lh_snapCode [data-tok='kw'] { color: var(--dsw-alias-brand-primary); }
.dsh_lh_snapCode [data-tok='str'],
.dsh_lh_snapCode [data-tok='cmt'] { color: var(--dsw-alias-state-success-primary); }
.dsh_lh_snapCode [data-tok='fn'] { color: var(--dsw-alias-label-primary); }
.dsh_lh_split {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.dsh_lh_splitHeads {
  display: grid;
  flex: none;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dsh_lh_splitHead {
  overflow: hidden;
  padding: 6px 12px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_lh_splitHead + .dsh_lh_splitHead {
  border-left: 1px solid var(--dsw-alias-border-l2);
}
.dsh_lh_splitBody {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 20px;
}
.dsh_lh_splitPanes {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}
.dsh_lh_minimap {
  position: relative;
  flex: none;
  width: min(120px, calc(100% / 6));
  min-height: 0;
  overflow: hidden;
  cursor: pointer;
  border-left: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
}
.dsh_lh_minimapCanvas {
  display: block;
  width: 100%;
  height: 100%;
}
.dsh_lh_minimapOverlay {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
}
/* Each side is its own scrollable pane: own vertical + horizontal scrollbar,
   vertical scrolling synced from the component. */
.dsh_lh_splitPane {
  flex: 1 1 50%;
  min-width: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--dsw-alias-border-l2) transparent;
}
.dsh_lh_splitPane + .dsh_lh_splitPane {
  border-left: 1px solid var(--dsw-alias-border-l2);
}
/* Rows size to their content (at least the pane width) so long lines widen
   the pane's scroll area instead of bleeding into the neighbor column. */
.dsh_lh_splitPane .dsh_lh_rowLine {
  width: max-content;
  min-width: 100%;
}
/* Line numbers stay pinned to the pane edge while the code scrolls
   horizontally (sticky-left); they still scroll vertically with the rows.
   Opaque per-mark backgrounds hide the code sliding underneath. */
.dsh_lh_splitPane .dsh_lh_gutter {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--dsw-alias-bg-layer-1);
}
.dsh_lh_splitPane .dsh_lh_rowLine[data-mark='del'] .dsh_lh_gutter {
  background: var(--dsw-alias-state-error-bg);
}
.dsh_lh_splitPane .dsh_lh_rowLine[data-mark='add'] .dsh_lh_gutter {
  background: color-mix(in srgb, var(--dsw-alias-state-success-bg) 55%, transparent);
}
.dsh_lh_splitPane .dsh_lh_rowLine[data-mark='empty'] .dsh_lh_gutter {
  background: var(--dsw-alias-bg-layer-2, transparent);
}
.dsh_lh_splitPane::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.dsh_lh_splitPane::-webkit-scrollbar-track {
  background: transparent;
}
.dsh_lh_splitPane::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-border-l2);
  border: 2px solid transparent;
  border-radius: 6px;
  background-clip: padding-box;
}
.dsh_lh_splitPane::-webkit-scrollbar-thumb:hover {
  background: var(--dsw-alias-label-tertiary);
  border: 2px solid transparent;
  border-radius: 6px;
  background-clip: padding-box;
}
.dsh_lh_badge {
  flex: none;
  padding: 1px 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.dsh_lh_badge[data-source='agent'] {
  color: var(--dsw-alias-brand-primary);
}
.dsh_lh_settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 4px 0;
}
.dsh_lh_settingRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.dsh_lh_settingRow input[type='number'] {
  box-sizing: border-box;
  width: 88px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
.dsh_lh_settingRow input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--dsw-alias-brand-primary);
}
`

export function adoptStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.dataset.plugin = 'dsh-local-history'
  style.dataset.pluginCss = STYLE_ID
  style.textContent = cssText
  document.head.appendChild(style)
}
