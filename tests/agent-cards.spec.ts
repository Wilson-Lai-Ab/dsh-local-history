import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { claimAgentCards, collectSessionEdits } from '../src/agent/tag.ts'
import { HistoryStore } from '../src/history/store.ts'

const limits = { maxPerFile: 50, maxBytes: 1_000_000, retentionDays: 30 }
let root = ''
afterEach(async () => {
  if (root !== '') await rm(root, { recursive: true, force: true })
  root = ''
})

function diffNode(over: Record<string, unknown> = {}) {
  return {
    kind: 'tool-result',
    resultView: { card: 'diff', diffs: [{ path: 'a.ts', oldText: 'old' }] },
    ...over,
  }
}

describe('collectSessionEdits', () => {
  it('yields an edit hit from a diff tool-result card', () => {
    const hits = collectSessionEdits([diffNode()], '/proj')
    expect(hits).toEqual([
      { path: '/proj/a.ts', kind: 'edit', oldText: 'old', turn: undefined },
    ])
  })

  it('yields an add hit when oldText is null', () => {
    const hits = collectSessionEdits([
      {
        kind: 'tool-result',
        resultView: { card: 'diff', diffs: [{ path: 'a.ts', oldText: null }] },
      },
    ], '/proj')
    expect(hits).toEqual([
      { path: '/proj/a.ts', kind: 'add', oldText: null, turn: undefined },
    ])
  })

  it('ignores failed tool-result cards', () => {
    const hits = collectSessionEdits([diffNode({ isError: true })], '/proj')
    expect(hits).toEqual([])
  })
})

describe('claimAgentCards', () => {
  it('claims unclaimed cards with beforeHash from oldText, never from current disk', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-cards-'))
    const store = new HistoryStore(root)
    const abs = '/proj/a.ts'
    const claimed = await claimAgentCards({
      store,
      sessionId: 'sess-1',
      cwd: '/proj',
      nodes: [diffNode({ turn: 2 })],
      limits,
      readCurrent: async () => ({ content: 'new-from-disk', binary: false }),
    })
    expect(claimed).toHaveLength(1)
    const record = claimed[0]!
    expect(record.source).toBe('agent')
    expect(record.decision).toBe('pending')
    expect(record.kind).toBe('edit')
    expect(record.path).toBe(abs)
    expect(record.sessionId).toBe('sess-1')
    expect(record.turn).toBe(2)
    expect(record.hash).not.toBeNull()
    expect(record.beforeHash).not.toBeNull()
    expect(await store.readBlob(record.beforeHash!)).toBe('old')
    expect(await store.readBlob(record.hash!)).toBe('new-from-disk')
    expect(await store.readBlob(record.beforeHash!)).not.toBe('new-from-disk')
  })

  it('does not re-claim the same session path and turn', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-cards-'))
    const store = new HistoryStore(root)
    const input = {
      store,
      sessionId: 'sess-1',
      cwd: '/proj',
      nodes: [diffNode({ turn: 1 })],
      limits,
      readCurrent: async () => ({ content: 'new', binary: false }),
    }
    await claimAgentCards(input)
    const second = await claimAgentCards(input)
    expect(second).toEqual([])
    expect((await store.load()).records.filter((r) => r.source === 'agent')).toHaveLength(1)
  })

  it('marks missing current content as a delete', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-cards-'))
    const store = new HistoryStore(root)
    const [record] = await claimAgentCards({
      store,
      sessionId: 'sess-1',
      cwd: '/proj',
      nodes: [diffNode()],
      limits,
      readCurrent: async () => ({ content: null, binary: false }),
    })
    expect(record?.kind).toBe('delete')
    expect(record?.hash).toBeNull()
    expect(record?.beforeHash).not.toBeNull()
  })

  it('auto-accepts an earlier pending edit when the same path is claimed again', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-cards-supersede-'))
    const store = new HistoryStore(root)
    const input = {
      store,
      sessionId: 'sess-1',
      cwd: '/proj',
      limits,
      readCurrent: async () => ({ content: 'new', binary: false }),
    }
    await claimAgentCards({ ...input, hits: [{ path: '/proj/a.ts', kind: 'edit', oldText: 'one', turn: 1 }] })
    await claimAgentCards({ ...input, hits: [{ path: '/proj/a.ts', kind: 'edit', oldText: 'two', turn: 2 }] })
    const records = (await store.load()).records.filter((record) => record.source === 'agent')
    expect(records).toHaveLength(2)
    const first = records.find((record) => record.turn === 1)
    const second = records.find((record) => record.turn === 2)
    expect(first?.decision).toBe('accepted')
    expect(second?.decision).toBe('pending')
  })

  it('collects every hunk snippet for a path, not only the last oldText', () => {
    const hits = collectSessionEdits([
      {
        kind: 'tool-result',
        resultView: {
          card: 'diff',
          diffs: [
            { path: 'a.ts', oldText: 'ctx\nold-one', newText: 'ctx\nnew-one' },
            { path: 'a.ts', oldText: 'tail\nold-two', newText: 'tail\nnew-two' },
          ],
        },
      },
    ], '/proj')
    expect(hits).toEqual([
      {
        path: '/proj/a.ts',
        kind: 'edit',
        oldText: 'ctx\nold-one',
        turn: undefined,
        diffs: [
          { oldText: 'ctx\nold-one', newText: 'ctx\nnew-one' },
          { oldText: 'tail\nold-two', newText: 'tail\nnew-two' },
        ],
      },
    ])
  })

  it('repairs an already-claimed snippet beforeHash on the next sync', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-cards-repair-'))
    const store = new HistoryStore(root)
    const header = [
      'package com.hexin.masterdata.mapper;',
      '',
      'public interface MdLogisticsGroupMapper {',
      '    int physicalDeleteByIds();',
      '',
    ].join('\n')
    const oldTail = [
      '    /**',
      '     * old javadoc',
      '     */',
      '    List<String> selectB2dGroupTypeIdStrList();',
      '}',
    ].join('\n')
    const newTail = [
      '    /**',
      '     * new javadoc',
      '     */',
      '    List<Long> selectB2dTypeIds();',
      '}',
    ].join('\n')
    const before = `${header}${oldTail}`
    const after = `${header}${newTail}`
    const input = {
      store,
      sessionId: 'sess-1',
      cwd: '/proj',
      limits,
      readCurrent: async () => ({ content: after, binary: false }),
    }
    const first = await claimAgentCards({
      ...input,
      hits: [{ path: '/proj/Mapper.java', kind: 'edit', oldText: oldTail, turn: 3 }],
    })
    expect(await store.readBlob(first[0]!.beforeHash!)).toBe(oldTail)
    await claimAgentCards({
      ...input,
      hits: [{
        path: '/proj/Mapper.java',
        kind: 'edit',
        oldText: oldTail,
        turn: 3,
        diffs: [{ oldText: oldTail, newText: newTail }],
      }],
    })
    const records = (await store.load()).records.filter((record) => record.source === 'agent')
    expect(records).toHaveLength(1)
    expect(await store.readBlob(records[0]!.beforeHash!)).toBe(before)
  })

  it('stores reconstructed full-file before, not the 3-line hunk snippet', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-cards-snippet-'))
    const store = new HistoryStore(root)
    const header = [
      'package com.hexin.masterdata.mapper;',
      '',
      'public interface MdLogisticsGroupMapper {',
      '    int physicalDeleteByIds();',
      '',
    ].join('\n')
    const oldTail = [
      '    /**',
      '     * old javadoc',
      '     */',
      '    List<String> selectB2dGroupTypeIdStrList();',
      '}',
    ].join('\n')
    const newTail = [
      '    /**',
      '     * new javadoc',
      '     */',
      '    List<Long> selectB2dTypeIds();',
      '}',
    ].join('\n')
    const before = `${header}${oldTail}`
    const after = `${header}${newTail}`
    const [record] = await claimAgentCards({
      store,
      sessionId: 'sess-1',
      cwd: '/proj',
      hits: [{
        path: '/proj/Mapper.java',
        kind: 'edit',
        oldText: oldTail,
        diffs: [{ oldText: oldTail, newText: newTail }],
      }],
      limits,
      readCurrent: async () => ({ content: after, binary: false }),
    })
    expect(await store.readBlob(record!.beforeHash!)).toBe(before)
    expect(await store.readBlob(record!.beforeHash!)).not.toBe(oldTail)
  })

  it('does not claim an existing binary as a delete', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-cards-bin-'))
    const store = new HistoryStore(root)
    const [record] = await claimAgentCards({
      store,
      sessionId: 'sess-1',
      cwd: '/proj',
      hits: [{ path: '/proj/a.bin', kind: 'edit' }],
      limits,
      readCurrent: async () => ({ content: null, binary: true }),
    })
    expect(record?.kind).not.toBe('delete')
    expect(record?.hash).toBeNull()
    expect(record?.bytes).toBe(0)
  })

  it('re-sync tolerates an already-claimed record whose beforeHash blob was gc-dropped', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-cards-dangling-'))
    const store = new HistoryStore(root)
    const header = [
      'package com.hexin.masterdata.mapper;',
      '',
      'public interface MdLogisticsGroupMapper {',
      '    int physicalDeleteByIds();',
      '',
    ].join('\n')
    const oldTail = [
      '    /**',
      '     * old javadoc',
      '     */',
      '    List<String> selectB2dGroupTypeIdStrList();',
      '}',
    ].join('\n')
    const newTail = [
      '    /**',
      '     * new javadoc',
      '     */',
      '    List<Long> selectB2dTypeIds();',
      '}',
    ].join('\n')
    const before = `${header}${oldTail}`
    const after = `${header}${newTail}`
    const input = {
      store,
      sessionId: 'sess-1',
      cwd: '/proj',
      limits,
      readCurrent: async () => ({ content: after, binary: false }),
    }
    const [claimed] = await claimAgentCards({
      ...input,
      hits: [{ path: '/proj/Mapper.java', kind: 'edit', oldText: oldTail, turn: 3 }],
    })
    expect(claimed?.beforeHash).not.toBeNull()
    // Simulate the lost-update/gc race: the before-blob is gone while the record survives.
    await rm(join(root, 'blobs', claimed!.beforeHash!), { force: true })
    await expect(claimAgentCards({
      ...input,
      hits: [{
        path: '/proj/Mapper.java',
        kind: 'edit',
        oldText: oldTail,
        turn: 3,
        diffs: [{ oldText: oldTail, newText: newTail }],
      }],
    })).resolves.toBeInstanceOf(Array)
    // The dangling reference is healed: the surviving record no longer points
    // at the gc-dropped blob, so later syncs and diff reads stop failing.
    const records = (await store.load()).records.filter((record) => record.source === 'agent')
    expect(records).toHaveLength(1)
    expect(records[0]!.beforeHash).toBeNull()
  })

  it('never writes a new record whose beforeHash points at a gc-dropped blob', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-cards-nodangling-'))
    const store = new HistoryStore(root)
    const [first] = await claimAgentCards({
      store,
      sessionId: 'sess-1',
      cwd: '/proj',
      hits: [{ path: '/proj/a.ts', kind: 'edit', oldText: 'one', turn: 1 }],
      limits,
      readCurrent: async () => ({ content: 'one-plus', binary: false }),
    })
    // Simulate gc dropping the blob while the record survives (lost-update race).
    await rm(join(root, 'blobs', first!.hash!), { force: true })
    // A NEW hit (different turn) must not reference the missing blob.
    const [second] = await claimAgentCards({
      store,
      sessionId: 'sess-1',
      cwd: '/proj',
      hits: [{ path: '/proj/a.ts', kind: 'edit', turn: 2 }],
      limits,
      readCurrent: async () => ({ content: 'two', binary: false }),
    })
    expect(second).toBeDefined()
    expect(second!.beforeHash).not.toBe(first!.hash)
    if (second!.beforeHash !== null) {
      // whatever it references must actually exist on disk
      await expect(store.readBlob(second!.beforeHash!)).resolves.toBeDefined()
    }
  })
})
