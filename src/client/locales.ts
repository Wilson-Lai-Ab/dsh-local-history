/**
 * `localHistory` locale namespace: review tab, diff, timeline, and settings.
 * Chinese is the product copy; English mirrors it.
 */

/** Locale namespace id registered under ctx.locale. */
export const NS = 'localHistory'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  reviewTitle: '改动审查',
  noSession: '没有工作区',
  loadFailed: '加载失败',
  snapshotGone: '该版本快照已被清理，无法读取',
  hunkDrifted: '这段改动已与磁盘不一致',
  agentEdited: '智能体改过这个文件',
  undoFile: '撤销',
  keepFile: '接受',
  filterPending: '待处理',
  filterAll: '全部',
  filterDone: '已处理',
  acceptFile: '接受文件',
  rejectFile: '拒绝文件',
  acceptHunk: '接受',
  rejectHunk: '拒绝',
  undoHunk: '撤销 L{range}',
  keepHunk: '接受 L{range}',
  timeline: '时间线',
  backToList: '返回列表',
  compareTitle: '对比',
  compareLeft: '上一版 {hash}',
  compareRight: '这一版 {hash}',
  restore: '恢复',
  binaryFile: '二进制文件，仅支持整文件接受或拒绝',
  badgeAI: 'AI',
  badgeSave: '保存',
  statusPending: '待处理',
  statusAccepted: '已接受',
  statusRejected: '已拒绝',
  watchEnabled: '监视工作区写入',
  maxPerFile: '每文件快照数',
  maxBytesMb: '每会话体积',
  retentionDays: '保留天数',
  emptyList: '没有改动',
  pendingCount: '{n} 处待处理',
  keepAll: '全部接受',
  undoAll: '全部撤销',
  fileCount: '{n} 个文件',
  ofLocation: 'of {path}',
  noPrompt: '(无用户消息)',
  turn: '第 {n} 轮',
  turnUnknown: '未编号',
  justNow: '刚刚',
  minutesAgo: '{n} 分钟前',
  hoursAgo: '{n} 小时前',
  daysAgo: '{n} 天前',
  unitMb: 'MB',
  unitDays: '天',
} satisfies Record<string, string>

export type LocalHistoryKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en: { [K in LocalHistoryKey]: string } = {
  reviewTitle: 'Change review',
  noSession: 'No workspace',
  loadFailed: 'Failed to load',
  snapshotGone: 'This snapshot was cleaned up and can no longer be read',
  hunkDrifted: 'This hunk no longer matches disk',
  agentEdited: 'The agent edited this file',
  undoFile: 'Undo',
  keepFile: 'Keep',
  filterPending: 'Pending',
  filterAll: 'All',
  filterDone: 'Reviewed',
  acceptFile: 'Accept file',
  rejectFile: 'Reject file',
  acceptHunk: 'Accept',
  rejectHunk: 'Reject',
  undoHunk: 'Undo L{range}',
  keepHunk: 'Keep L{range}',
  timeline: 'Timeline',
  backToList: 'Back',
  compareTitle: 'Compare',
  compareLeft: 'Previous {hash}',
  compareRight: 'This {hash}',
  restore: 'Restore',
  binaryFile: 'Binary file; accept or reject the whole file',
  badgeAI: 'AI',
  badgeSave: 'Save',
  statusPending: 'Pending',
  statusAccepted: 'Accepted',
  statusRejected: 'Rejected',
  watchEnabled: 'Watch workspace writes',
  maxPerFile: 'Snapshots per file',
  maxBytesMb: 'Session size',
  retentionDays: 'Retention days',
  emptyList: 'No changes',
  pendingCount: '{n} pending',
  keepAll: 'Keep all',
  undoAll: 'Undo all',
  fileCount: '{n} files',
  ofLocation: 'of {path}',
  noPrompt: '(no user message)',
  turn: 'Turn {n}',
  turnUnknown: 'Unturned',
  justNow: 'just now',
  minutesAgo: '{n} minutes ago',
  hoursAgo: '{n} hours ago',
  daysAgo: '{n} days ago',
  unitMb: 'MB',
  unitDays: 'days',
}

export type Translate = (key: string, params?: Record<string, string>) => string

export function fmt(template: string, params?: Record<string, string>): string {
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => params[key] ?? whole)
}

export function lookup(key: string, params?: Record<string, string>): string {
  const template = (zh as Record<string, string>)[key] ?? key
  return fmt(template, params)
}
