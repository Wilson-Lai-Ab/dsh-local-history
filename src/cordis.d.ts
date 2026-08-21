/**
 * Local stand-ins for `@deepseek-ai/*`. This worktree does not link the
 * harness packages; apply() must tolerate missing typert/settings at runtime.
 */
declare module '@deepseek-ai/cordis' {
  export interface Context {
    reflect: { provide(name: string, value: unknown): void }
    typert: { register(manifest: unknown): () => void }
    settings: { register(namespace: string, schema: unknown, options?: unknown): unknown }
    effect(fn: () => unknown, label?: string): void
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  export interface InvocationParameter {
    name: string
    wire: string
    source: 'json' | 'lookup'
    lookup?: string
    codec: {
      mode: 'strict'
      typeSymbol: string
      schema: { parse(value: unknown): unknown }
    }
  }
  export interface InvocationDescriptor {
    id: string
    service: string
    namespace: string
    method: string
    invocation: { kind: 'direct' }
    parameters: InvocationParameter[]
    cancellation?: { parameter: string }
    result: {
      mode: 'strict'
      typeSymbol: string
      schema: { parse(value: unknown): unknown }
    }
  }
  export type RemoteResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: { code: string; message: string; details: object } }
  export interface TypertRemoteContribution {
    package: string
    descriptors: readonly InvocationDescriptor[]
  }
}

declare module '@deepseek-ai/dsh-typert-registry/types' {
  export interface TypertContribution {
    package: string
    face: 'host' | 'client'
    schemas: unknown[]
    model: {
      services: Array<{
        key: string
        exportName: string
        description: string
        tags: string[]
        members: Array<{ kind: 'method'; name: string; signature: string }>
        types: unknown[]
      }>
      events: unknown[]
      objects: unknown[]
    }
    invocations: readonly import('@deepseek-ai/dsh-typert-protocol').InvocationDescriptor[]
  }
}
