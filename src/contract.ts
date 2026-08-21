/**
  * The localHistory wire contract: shared invocation descriptors + codecs.
  * Host manifest (`src/typert.ts`) and the Task 5 client contribution both
  * import this file. Codecs stay in sync with LocalHistoryRuntime methods.
  */
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import type { AgentCardHit } from './agent/cards.ts'
import type { ReviewHunk } from './history/hunks.ts'
import type { HistoryRecord } from './types.ts'
import { z } from './z.ts'

export type { AgentCardHit, HistoryRecord, ReviewHunk }

export interface LocalHistorySettings {
  readonly watchEnabled: boolean
  readonly maxPerFile: number
  readonly maxBytesMb: number
  readonly retentionDays: number
}

export type LocalHistorySettingsUpdate = Partial<LocalHistorySettings>

export interface LocalHistorySettingsScope {
  get(): LocalHistorySettings
  update(update: LocalHistorySettingsUpdate): Promise<LocalHistorySettings>
}

export const sessionIdSchema = z.string({ min: 1 })
export const cwdSchema = z.string().optional()
export const pathSchema = z.string({ min: 1 })
export const hashSchema = z.string({ min: 1 })
export const recordIdSchema = z.string({ min: 1 })

export const fileDiffHunkSchema = z.object({
  oldText: z.union([z.string(), z.null()]).optional(),
  newText: z.string(),
})

export const agentCardHitSchema = z.object({
  path: pathSchema,
  kind: z.enum(['add', 'edit', 'delete'] as const),
  oldText: z.union([z.string(), z.null()]).optional(),
  turn: z.number().optional(),
  diffs: z.array(fileDiffHunkSchema).optional(),
})

export const reviewHunkSchema = z.object({
  key: z.string({ min: 1 }),
  start: z.number(),
  end: z.number(),
  paintStart: z.number(),
  paintEnd: z.number(),
  oldBlock: z.string(),
  newBlock: z.string(),
})

export const historyRecordSchema = z.object({
  id: z.string({ min: 1 }),
  path: z.string({ min: 1 }),
  hash: z.union([z.string(), z.null()]),
  beforeHash: z.union([z.string(), z.null()]),
  bytes: z.number(),
  mtime: z.number(),
  source: z.enum(['agent', 'save'] as const),
  kind: z.enum(['add', 'edit', 'delete'] as const),
  sessionId: z.string({ min: 1 }),
  turn: z.number().optional(),
  agentSessionId: z.string().optional(),
  decision: z.enum(['pending', 'accepted', 'rejected'] as const).optional(),
  hunks: z.record(z.enum(['accepted', 'rejected'] as const)).optional(),
})

export const localHistorySettingsSchema = z.object({
  watchEnabled: z.boolean(),
  maxPerFile: z.number(),
  maxBytesMb: z.number(),
  retentionDays: z.number(),
})

export const localHistorySettingsUpdateSchema = z.object({
  watchEnabled: z.boolean().optional(),
  maxPerFile: z.number().optional(),
  maxBytesMb: z.number().optional(),
  retentionDays: z.number().optional(),
})

export const recordsResultSchema = z.object({
  records: z.array(historyRecordSchema),
})

export const reviewResultSchema = z.object({
  records: z.array(historyRecordSchema),
  pending: z.number(),
})

export const pendingResultSchema = z.object({
  pending: z.number(),
})

export const blobResultSchema = z.object({
  content: z.string(),
})

export const currentResultSchema = z.object({
  content: z.union([z.string(), z.null()]),
  binary: z.boolean(),
})

export const reopenPayloadSchema = z.object({
  content: z.union([z.string(), z.null()]).optional(),
  hunkKey: z.string().optional(),
})

function jsonParam(name: string, typeSymbol: string, schema: { parse(value: unknown): unknown }): InvocationDescriptor['parameters'][number] {
  return {
    name,
    wire: name,
    source: 'json',
    codec: { mode: 'strict', typeSymbol, schema },
  }
}

const sessionIdParam = jsonParam('sessionId', 'dsh-local-history#SessionId', sessionIdSchema)
const cwdParam = jsonParam('cwd', 'dsh-local-history#Cwd', cwdSchema)
const pathParam = jsonParam('path', 'dsh-local-history#Path', pathSchema)
const hashParam = jsonParam('hash', 'dsh-local-history#Hash', hashSchema)
const recordIdParam = jsonParam('recordId', 'dsh-local-history#RecordId', recordIdSchema)

function method(
  name: string,
  parameters: InvocationDescriptor['parameters'],
  result: InvocationDescriptor['result'],
): InvocationDescriptor {
  return {
    id: `dsh-local-history#localHistory/${name}`,
    service: 'localHistory',
    namespace: 'localHistory',
    method: name,
    invocation: { kind: 'direct' },
    parameters,
    result,
  }
}

const recordsResult = {
  mode: 'strict' as const,
  typeSymbol: 'dsh-local-history#HistoryRecord[]',
  schema: recordsResultSchema,
}

const settingsResult = {
  mode: 'strict' as const,
  typeSymbol: 'dsh-local-history#LocalHistorySettings',
  schema: localHistorySettingsSchema,
}

/** The localHistory Remote namespace's strict invocation descriptors. */
export const LOCAL_HISTORY_INVOCATIONS: readonly InvocationDescriptor[] = [
  method('listReview', [sessionIdParam, cwdParam], {
    mode: 'strict',
    typeSymbol: 'dsh-local-history#ReviewResult',
    schema: reviewResultSchema,
  }),
  method('listTimeline', [sessionIdParam, cwdParam, pathParam], recordsResult),
  method('readBlob', [sessionIdParam, cwdParam, hashParam], {
    mode: 'strict',
    typeSymbol: 'dsh-local-history#BlobResult',
    schema: blobResultSchema,
  }),
  method('readCurrent', [sessionIdParam, cwdParam, pathParam], {
    mode: 'strict',
    typeSymbol: 'dsh-local-history#CurrentResult',
    schema: currentResultSchema,
  }),
  method('acceptFile', [sessionIdParam, cwdParam, recordIdParam], recordsResult),
  method('rejectFile', [sessionIdParam, cwdParam, recordIdParam], recordsResult),
  method('acceptHunk', [
    sessionIdParam,
    cwdParam,
    recordIdParam,
    jsonParam('hunkKey', 'dsh-local-history#HunkKey', z.string({ min: 1 })),
  ], recordsResult),
  method('rejectHunk', [
    sessionIdParam,
    cwdParam,
    recordIdParam,
    jsonParam('hunk', 'dsh-local-history#ReviewHunk', reviewHunkSchema),
  ], recordsResult),
  method('restore', [sessionIdParam, cwdParam, recordIdParam], recordsResult),
  method('reopenRecord', [
    sessionIdParam,
    cwdParam,
    recordIdParam,
    jsonParam('payload', 'dsh-local-history#ReopenPayload', reopenPayloadSchema),
  ], recordsResult),
  method('getSettings', [], settingsResult),
  method('updateSettings', [
    jsonParam('update', 'dsh-local-history#LocalHistorySettingsUpdate', localHistorySettingsUpdateSchema),
  ], settingsResult),
  method('syncSession', [
    sessionIdParam,
    cwdParam,
    jsonParam('hits', 'dsh-local-history#AgentCardHit[]', z.array(agentCardHitSchema)),
  ], {
    mode: 'strict',
    typeSymbol: 'dsh-local-history#PendingResult',
    schema: pendingResultSchema,
  }),
]

