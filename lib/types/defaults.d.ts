/** Directory basenames skipped by the workspace watcher (sidebar-aligned). */
export declare const DEFAULT_IGNORE_DIRS: readonly ["node_modules", ".git", "dist", "lib", "coverage", ".pnpm-store", "target", "build", ".next", ".turbo", "out"];
export declare const MAX_PER_FILE = 50;
export declare const MAX_BYTES: number;
export declare const RETENTION_DAYS = 30;
export declare const DEFAULT_WATCH_ENABLED = true;
export declare function shouldSkipDir(name: string): boolean;
export declare function clampMaxPerFile(n: number): number;
export declare function clampMaxBytes(n: number): number;
export declare function clampRetentionDays(n: number): number;
