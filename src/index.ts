import type { Context } from '@deepseek-ai/cordis'
import { LocalHistoryRuntime } from './runtime.ts'
import { registerLocalHistorySettings } from './settings.ts'
import { TYPERT_MANIFEST } from './typert.ts'

export const name = 'dsh-local-history'
export const inject = ['settings', 'typert'] as const

export function apply(ctx: Context): void {
  const settings = registerLocalHistorySettings(ctx)
  const runtime = new LocalHistoryRuntime(ctx, settings)
  ctx.reflect.provide('localHistory', runtime)
  ctx.effect(() => {
    const dispose = ctx.typert.register(TYPERT_MANIFEST)
    return () => { void dispose() }
  }, 'dsh-local-history: typert manifest')
  ctx.effect(() => () => runtime.dispose(), 'dsh-local-history: runtime cleanup')
}
