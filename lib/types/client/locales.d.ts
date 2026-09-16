/**
 * `localHistory` locale namespace: review tab, diff, timeline, and settings.
 * Chinese is the product copy; English mirrors it.
 */
/** Locale namespace id registered under ctx.locale. */
export declare const NS = "localHistory";
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    reviewTitle: string;
    noSession: string;
    loadFailed: string;
    snapshotGone: string;
    hunkDrifted: string;
    agentEdited: string;
    undoFile: string;
    keepFile: string;
    filterPending: string;
    filterAll: string;
    filterDone: string;
    acceptFile: string;
    rejectFile: string;
    acceptHunk: string;
    rejectHunk: string;
    undoHunk: string;
    keepHunk: string;
    timeline: string;
    backToList: string;
    compareTitle: string;
    compareLeft: string;
    compareRight: string;
    restore: string;
    binaryFile: string;
    badgeAI: string;
    badgeSave: string;
    statusPending: string;
    statusAccepted: string;
    statusRejected: string;
    watchEnabled: string;
    maxPerFile: string;
    maxBytesMb: string;
    retentionDays: string;
    emptyList: string;
    pendingCount: string;
    keepAll: string;
    undoAll: string;
    fileCount: string;
    ofLocation: string;
    noPrompt: string;
    tooLargeFile: string;
    turn: string;
    turnUnknown: string;
    justNow: string;
    minutesAgo: string;
    hoursAgo: string;
    daysAgo: string;
    unitMb: string;
    unitDays: string;
    preview: string;
    edit: string;
    copy: string;
    copied: string;
    markdownFootnotes: string;
};
export type LocalHistoryKey = keyof typeof zh;
/** English dictionary, checked complete against the zh key set. */
export declare const en: {
    [K in LocalHistoryKey]: string;
};
export type Translate = (key: string, params?: Record<string, string>) => string;
export declare function fmt(template: string, params?: Record<string, string>): string;
export declare function lookup(key: string, params?: Record<string, string>): string;
