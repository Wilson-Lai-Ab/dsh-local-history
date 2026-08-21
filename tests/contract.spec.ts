import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apply, inject } from '../src/index.ts'
import {
  LOCAL_HISTORY_INVOCATIONS,
  agentCardHitSchema,
  historyRecordSchema,
  localHistorySettingsSchema,
  localHistorySettingsUpdateSchema,
  reopenPayloadSchema,
  reviewHunkSchema,
} from '../src/contract.ts'
import { TYPERT_MANIFEST } from '../src/typert.ts'
import { registerLocalHistorySettings } from '../src/settings.ts'
import type { Context } from '@deepseek-ai/cordis'

const METHODS = [
  'listReview',
  'listTimeline',
  'readBlob',
  'readCurrent',
  'acceptFile',
  'rejectFile',
  'acceptHunk',
  'rejectHunk',
  'restore',
  'reopenRecord',
  'getSettings',
  'updateSettings',
  'syncSession',
] as const

function invocation(method: string) {
  const found = LOCAL_HISTORY_INVOCATIONS.find((item) => item.method === method)
  if (found === undefined) throw new Error(`missing invocation ${method}`)
  return found
}

describe('LOCAL_HISTORY_INVOCATIONS', () => {
  it('declares every localHistory remote method', () => {
    expect(LOCAL_HISTORY_INVOCATIONS.map((item) => item.method).sort()).toEqual([...METHODS].sort())
    for (const item of LOCAL_HISTORY_INVOCATIONS) {
      expect(item.service).toBe('localHistory')
      expect(item.namespace).toBe('localHistory')
      expect(item.id).toBe(`dsh-local-history#localHistory/${item.method}`)
    }
  })

  it('wires syncSession as hits: AgentCardHit[] not raw nodes', () => {
    const sync = invocation('syncSession')
    const names = sync.parameters.map((parameter) => parameter.name)
    expect(names).toEqual(['sessionId', 'cwd', 'hits'])
    expect(names).not.toContain('nodes')
    const hits = sync.parameters.find((parameter) => parameter.name === 'hits')
    expect(hits?.codec.schema.parse([{ path: '/p/a.ts', kind: 'edit' }])).toEqual([
      { path: '/p/a.ts', kind: 'edit' },
    ])
    expect(() => hits?.codec.schema.parse([{ path: '/p/a.ts' }])).toThrow()
  })

  it('requires readCurrent returning content + binary', () => {
    const read = invocation('readCurrent')
    expect(read.parameters.map((parameter) => parameter.name)).toEqual(['sessionId', 'cwd', 'path'])
    expect(read.result.schema.parse({ content: 'hi', binary: false })).toEqual({ content: 'hi', binary: false })
    expect(read.result.schema.parse({ content: null, binary: true })).toEqual({ content: null, binary: true })
    expect(() => read.result.schema.parse({ content: 'hi' })).toThrow()
  })
})

describe('codecs', () => {
  it('parses settings, hits, hunks, and records', () => {
    expect(localHistorySettingsSchema.parse({
      watchEnabled: true,
      maxPerFile: 50,
      maxBytesMb: 200,
      retentionDays: 30,
    })).toEqual({
      watchEnabled: true,
      maxPerFile: 50,
      maxBytesMb: 200,
      retentionDays: 30,
    })
    expect(localHistorySettingsUpdateSchema.parse({ watchEnabled: false })).toEqual({ watchEnabled: false })
    expect(agentCardHitSchema.parse({ path: '/a.ts', kind: 'add', oldText: null, turn: 1 })).toEqual({
      path: '/a.ts',
      kind: 'add',
      oldText: null,
      turn: 1,
    })
    expect(reviewHunkSchema.parse({
      key: '1:1:0:0:1',
      start: 1,
      end: 1,
      paintStart: 1,
      paintEnd: 1,
      oldBlock: '',
      newBlock: 'x',
    }).key).toBe('1:1:0:0:1')
    expect(historyRecordSchema.parse({
      id: 'r1',
      path: '/a.ts',
      hash: 'h',
      beforeHash: null,
      bytes: 1,
      mtime: 2,
      source: 'save',
      kind: 'edit',
      sessionId: 's',
    }).id).toBe('r1')
  })

  it('rejects malformed payloads', () => {
    expect(() => localHistorySettingsSchema.parse({ watchEnabled: true })).toThrow()
    expect(() => agentCardHitSchema.parse({ path: '', kind: 'edit' })).toThrow()
    expect(() => reviewHunkSchema.parse({ key: 'k' })).toThrow()
  })

  it('parses reopen payloads with optional disk restore', () => {
    expect(reopenPayloadSchema.parse({})).toEqual({})
    expect(reopenPayloadSchema.parse({ content: 'new\n', hunkKey: 'h1' })).toEqual({
      content: 'new\n',
      hunkKey: 'h1',
    })
    expect(reopenPayloadSchema.parse({ content: null })).toEqual({ content: null })
  })
})

describe('TYPERT_MANIFEST', () => {
  it('registers the strict localHistory host contribution', () => {
    expect(TYPERT_MANIFEST.package).toBe('dsh-local-history')
    expect(TYPERT_MANIFEST.face).toBe('host')
    expect(TYPERT_MANIFEST.invocations).toBe(LOCAL_HISTORY_INVOCATIONS)
    expect(TYPERT_MANIFEST.model.services[0]?.key).toBe('localHistory')
    expect(TYPERT_MANIFEST.model.services[0]?.exportName).toBe('LocalHistoryRuntime')
    expect(TYPERT_MANIFEST.model.services[0]?.members.map((member) => member.name).sort()).toEqual([...METHODS].sort())
  })
})

describe('apply', () => {
  it('declares settings and typert on the loader inject list', () => {
    expect(inject).toEqual(['settings', 'typert'])
    const plugin = JSON.parse(readFileSync(new URL('../dsh.plugin.json', import.meta.url), 'utf8')) as {
      entry: { inject?: string[] }
    }
    expect(plugin.entry.inject ?? []).toEqual(['settings', 'typert'])
  })

  it('registers localHistory as a typertRemote-bound Cordis service', () => {
    const manifests: unknown[] = []
    const services: { name: string; value: object }[] = []
    const ctx = {
      typert: { register: (manifest: unknown) => { manifests.push(manifest); return () => {} } },
      settings: {
        register: () => ({
          get: () => ({ watchEnabled: true, maxPerFile: 50, maxBytesMb: 200, retentionDays: 30 }),
          update: async () => ({ watchEnabled: true, maxPerFile: 50, maxBytesMb: 200, retentionDays: 30 }),
        }),
      },
      reflect: { provide: (name: string, value: object) => { services.push({ name, value }) } },
      effect: (fn: () => unknown) => fn(),
    }
    apply(ctx as Context)
    expect(manifests).toHaveLength(1)
    expect(services).toHaveLength(1)
    expect(services[0]?.name).toBe('localHistory')
    const runtime = services[0]?.value as {
      typertRemote?: { service: unknown; serviceKey: string; namespace: string }
    }
    expect(runtime.typertRemote?.service).toBe(runtime)
    expect(runtime.typertRemote?.serviceKey).toBe('localHistory')
    expect(runtime.typertRemote?.namespace).toBe('localHistory')
  })

  it('keeps in-memory defaults when settings.register throws', () => {
    const scope = registerLocalHistorySettings({
      settings: { register: () => { throw new Error('no settings') } },
    } as Context)
    expect(scope.get()).toEqual({
      watchEnabled: true,
      maxPerFile: 50,
      maxBytesMb: 200,
      retentionDays: 30,
    })
  })
})
