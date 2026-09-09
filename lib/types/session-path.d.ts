/** Encode one path segment the same way DSH's jsonl backend does. */
export declare function encodeSessionSegment(raw: string): string;
/** Drop trailing slashes so `/proj` and `/proj/` share one session folder. */
export declare function normalizeCwd(cwd: string | undefined): string | undefined;
/** Human-navigable project folder under `~/.dsh/sessions`. */
export declare function projectKey(cwd: string): string;
export declare function defaultSessionsRoot(): string;
export declare function sessionDir(root: string, cwd: string | undefined, sessionId: string): string;
export declare function historyDir(sessionDirPath: string): string;
