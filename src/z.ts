/**
  * Minimal zod-compatible codecs. The harness checkout is not linked, so
  * this plugin cannot depend on the real `zod` package in this worktree.
  */
export interface ZodLike<T> {
  parse(value: unknown): T
  optional(): ZodLike<T | undefined>
  nullable(): ZodLike<T | null>
  readonly(): ZodLike<T>
  readonly _optional?: boolean
}

function issue(message: string): never {
  throw new Error(message)
}

function wrap<T>(parse: (value: unknown) => T, optional = false): ZodLike<T> {
  const schema: ZodLike<T> = {
    parse,
    optional: () => wrap((value) => {
      if (value === undefined) return undefined as T | undefined
      return parse(value)
    }, true) as ZodLike<T | undefined>,
    nullable: () => wrap((value) => {
      if (value === null) return null as T | null
      return parse(value)
    }) as ZodLike<T | null>,
    readonly: () => schema,
    _optional: optional,
  }
  return schema
}

export const z = {
  string(opts: { min?: number } = {}): ZodLike<string> {
    return wrap((value) => {
      if (typeof value !== 'string') issue('expected string')
      if (opts.min !== undefined && value.length < opts.min) issue('string too short')
      return value
    })
  },
  number(): ZodLike<number> {
    return wrap((value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) issue('expected number')
      return value
    })
  },
  boolean(): ZodLike<boolean> {
    return wrap((value) => {
      if (typeof value !== 'boolean') issue('expected boolean')
      return value
    })
  },
  null(): ZodLike<null> {
    return wrap((value) => {
      if (value !== null) issue('expected null')
      return null
    })
  },
  enum<const T extends readonly string[]>(values: T): ZodLike<T[number]> {
    const allowed = new Set<string>(values)
    return wrap((value) => {
      if (typeof value !== 'string' || !allowed.has(value)) issue('expected enum')
      return value as T[number]
    })
  },
  array<T>(inner: ZodLike<T>): ZodLike<T[]> {
    return wrap((value) => {
      if (!Array.isArray(value)) issue('expected array')
      return value.map((item) => inner.parse(item))
    })
  },
  object<S extends Record<string, ZodLike<unknown>>>(shape: S): ZodLike<{
    [K in keyof S]: S[K] extends ZodLike<infer U> ? U : never
  }> {
    return wrap((value) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) issue('expected object')
      const input = value as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const [key, schema] of Object.entries(shape)) {
        const parsed = schema.parse(input[key])
        if (parsed !== undefined) out[key] = parsed
        else if (!schema._optional && !(key in input)) issue(`missing ${key}`)
      }
      return out as { [K in keyof S]: S[K] extends ZodLike<infer U> ? U : never }
    })
  },
  union<T extends readonly ZodLike<unknown>[]>(schemas: T): ZodLike<T[number] extends ZodLike<infer U> ? U : never> {
    return wrap((value) => {
      const errors: string[] = []
      for (const schema of schemas) {
        try {
          return schema.parse(value) as T[number] extends ZodLike<infer U> ? U : never
        } catch (error) {
          errors.push(error instanceof Error ? error.message : 'invalid')
        }
      }
      issue(errors.join('; ') || 'invalid union')
    })
  },
  record<T>(inner: ZodLike<T>): ZodLike<Record<string, T>> {
    return wrap((value) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) issue('expected object')
      const out: Record<string, T> = {}
      for (const [key, item] of Object.entries(value)) out[key] = inner.parse(item)
      return out
    })
  },
}
