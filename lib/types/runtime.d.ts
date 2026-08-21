import type { Context } from '@deepseek-ai/cordis';
import type { AgentCardHit } from './agent/cards.ts';
import type { LocalHistorySettings, LocalHistorySettingsScope, LocalHistorySettingsUpdate } from './contract.ts';
import { type ReopenPayload } from './history/actions.ts';
import type { ReviewHunk } from './history/hunks.ts';
import type { HistoryLimits, HistoryRecord } from './types.ts';
export declare function limitsFromSettings(settings: LocalHistorySettings): HistoryLimits;
export declare function readWorkspaceCurrent(absPath: string): Promise<{
    content: string | null;
    binary: boolean;
}>;
/** Host runtime backing the localHistory Remote. */
export declare class LocalHistoryRuntime {
    private readonly settings;
    private readonly watchers;
    private readonly lastHits;
    private readonly knownSessions;
    private readonly stores;
    constructor(_ctx: Context, settings: LocalHistorySettingsScope);
    getSettings(): LocalHistorySettings;
    updateSettings(update: LocalHistorySettingsUpdate): Promise<LocalHistorySettings>;
    listReview(sessionId: string, cwd?: string): Promise<{
        records: HistoryRecord[];
        pending: number;
    }>;
    listTimeline(sessionId: string, cwd: string | undefined, path: string): Promise<{
        records: HistoryRecord[];
    }>;
    readBlob(sessionId: string, cwd: string | undefined, hash: string): Promise<{
        content: string;
    }>;
    readCurrent(_sessionId: string, _cwd: string | undefined, path: string): Promise<{
        content: string | null;
        binary: boolean;
    }>;
    acceptFile(sessionId: string, cwd: string | undefined, recordId: string): Promise<{
        records: HistoryRecord[];
    }>;
    rejectFile(sessionId: string, cwd: string | undefined, recordId: string): Promise<{
        records: HistoryRecord[];
    }>;
    acceptHunk(sessionId: string, cwd: string | undefined, recordId: string, hunkKey: string): Promise<{
        records: HistoryRecord[];
    }>;
    rejectHunk(sessionId: string, cwd: string | undefined, recordId: string, hunk: ReviewHunk): Promise<{
        records: HistoryRecord[];
    }>;
    restore(sessionId: string, cwd: string | undefined, recordId: string): Promise<{
        records: HistoryRecord[];
    }>;
    reopenRecord(sessionId: string, cwd: string | undefined, recordId: string, payload: ReopenPayload): Promise<{
        records: HistoryRecord[];
    }>;
    syncSession(sessionId: string, cwd: string | undefined, hits: AgentCardHit[]): Promise<{
        pending: number;
    }>;
    dispose(): void;
    private storeFor;
    private actionIo;
    private ensureWatcher;
    private startKnownWatchers;
    private stopAllWatchers;
}
