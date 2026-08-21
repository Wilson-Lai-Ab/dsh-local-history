/**
  * Minimal zod-compatible codecs. The harness checkout is not linked, so
  * this plugin cannot depend on the real `zod` package in this worktree.
  */
export interface ZodLike<T> {
    parse(value: unknown): T;
    optional(): ZodLike<T | undefined>;
    nullable(): ZodLike<T | null>;
    readonly(): ZodLike<T>;
    readonly _optional?: boolean;
}
export declare const z: {
    string(opts?: {
        min?: number;
    }): ZodLike<string>;
    number(): ZodLike<number>;
    boolean(): ZodLike<boolean>;
    null(): ZodLike<null>;
    enum<const T extends readonly string[]>(values: T): ZodLike<T[number]>;
    array<T>(inner: ZodLike<T>): ZodLike<T[]>;
    object<S extends Record<string, ZodLike<unknown>>>(shape: S): ZodLike<{ [K in keyof S]: S[K] extends ZodLike<infer U> ? U : never; }>;
    union<T extends readonly ZodLike<unknown>[]>(schemas: T): ZodLike<T[number] extends ZodLike<infer U> ? U : never>;
    record<T>(inner: ZodLike<T>): ZodLike<Record<string, T>>;
};
