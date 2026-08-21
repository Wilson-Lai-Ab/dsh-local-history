/**
  * The localHistory wire contract: shared invocation descriptors + codecs.
  * Host manifest (`src/typert.ts`) and the Task 5 client contribution both
  * import this file. Codecs stay in sync with LocalHistoryRuntime methods.
  */
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol';
import type { AgentCardHit } from './agent/cards.ts';
import type { ReviewHunk } from './history/hunks.ts';
import type { HistoryRecord } from './types.ts';
export type { AgentCardHit, HistoryRecord, ReviewHunk };
export interface LocalHistorySettings {
    readonly watchEnabled: boolean;
    readonly maxPerFile: number;
    readonly maxBytesMb: number;
    readonly retentionDays: number;
}
export type LocalHistorySettingsUpdate = Partial<LocalHistorySettings>;
export interface LocalHistorySettingsScope {
    get(): LocalHistorySettings;
    update(update: LocalHistorySettingsUpdate): Promise<LocalHistorySettings>;
}
export declare const sessionIdSchema: import("./z.ts").ZodLike<string>;
export declare const cwdSchema: import("./z.ts").ZodLike<string | undefined>;
export declare const pathSchema: import("./z.ts").ZodLike<string>;
export declare const hashSchema: import("./z.ts").ZodLike<string>;
export declare const recordIdSchema: import("./z.ts").ZodLike<string>;
export declare const fileDiffHunkSchema: import("./z.ts").ZodLike<{
    oldText: string | null | undefined;
    newText: string;
}>;
export declare const agentCardHitSchema: import("./z.ts").ZodLike<{
    path: string;
    kind: "add" | "edit" | "delete";
    oldText: string | null | undefined;
    turn: number | undefined;
    diffs: {
        oldText: string | null | undefined;
        newText: string;
    }[] | undefined;
}>;
export declare const reviewHunkSchema: import("./z.ts").ZodLike<{
    key: string;
    start: number;
    end: number;
    paintStart: number;
    paintEnd: number;
    oldBlock: string;
    newBlock: string;
}>;
export declare const historyRecordSchema: import("./z.ts").ZodLike<{
    id: string;
    path: string;
    hash: string | null;
    beforeHash: string | null;
    bytes: number;
    mtime: number;
    source: "agent" | "save";
    kind: "add" | "edit" | "delete";
    sessionId: string;
    turn: number | undefined;
    agentSessionId: string | undefined;
    decision: "pending" | "accepted" | "rejected" | undefined;
    hunks: Record<string, "accepted" | "rejected"> | undefined;
}>;
export declare const localHistorySettingsSchema: import("./z.ts").ZodLike<{
    watchEnabled: boolean;
    maxPerFile: number;
    maxBytesMb: number;
    retentionDays: number;
}>;
export declare const localHistorySettingsUpdateSchema: import("./z.ts").ZodLike<{
    watchEnabled: boolean | undefined;
    maxPerFile: number | undefined;
    maxBytesMb: number | undefined;
    retentionDays: number | undefined;
}>;
export declare const recordsResultSchema: import("./z.ts").ZodLike<{
    records: {
        id: string;
        path: string;
        hash: string | null;
        beforeHash: string | null;
        bytes: number;
        mtime: number;
        source: "agent" | "save";
        kind: "add" | "edit" | "delete";
        sessionId: string;
        turn: number | undefined;
        agentSessionId: string | undefined;
        decision: "pending" | "accepted" | "rejected" | undefined;
        hunks: Record<string, "accepted" | "rejected"> | undefined;
    }[];
}>;
export declare const reviewResultSchema: import("./z.ts").ZodLike<{
    records: {
        id: string;
        path: string;
        hash: string | null;
        beforeHash: string | null;
        bytes: number;
        mtime: number;
        source: "agent" | "save";
        kind: "add" | "edit" | "delete";
        sessionId: string;
        turn: number | undefined;
        agentSessionId: string | undefined;
        decision: "pending" | "accepted" | "rejected" | undefined;
        hunks: Record<string, "accepted" | "rejected"> | undefined;
    }[];
    pending: number;
}>;
export declare const pendingResultSchema: import("./z.ts").ZodLike<{
    pending: number;
}>;
export declare const blobResultSchema: import("./z.ts").ZodLike<{
    content: string;
}>;
export declare const currentResultSchema: import("./z.ts").ZodLike<{
    content: string | null;
    binary: boolean;
}>;
export declare const reopenPayloadSchema: import("./z.ts").ZodLike<{
    content: string | null | undefined;
    hunkKey: string | undefined;
}>;
/** The localHistory Remote namespace's strict invocation descriptors. */
export declare const LOCAL_HISTORY_INVOCATIONS: readonly InvocationDescriptor[];
