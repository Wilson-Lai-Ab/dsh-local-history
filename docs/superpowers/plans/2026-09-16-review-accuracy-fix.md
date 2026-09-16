# 改动审查准确性修复 Implementation Plan

> **For agentic workers:** Pick the execution skill from using-superpowers
> Execution Routing (S = this session, no SDD; M = executing-plans;
> L = subagent-driven-development). Do not default to SDD. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Class:** M — 一个特性（改动审查准确性）穿过 host 记录层与 client 展示层，共 6 个源文件、3 个切片。

**Goal:** 让「改动审查」的 diff 与轮次都反映真实情况：覆盖写不再被当成整文件新增，轮次按用户输入计数，每条改动都能显示对应的用户消息。

**Architecture:** host 侧修 `write` 命中的 `beforeHash`/`kind` 推导（改为回退到同路径上一版快照），并加一次幂等的历史记录回填；client 侧把「轮次/用户消息」收集改成事件形状感知（`eventSource` entries），并按用户输入轮次分组展示。

**Tech Stack:** TypeScript + React 18 + Cordis 插件、vitest（`npx vitest run <file>`）。

**Spec:** `docs/superpowers/specs/2026-08-19-local-history-design.md`；本次缺陷证据见会话 `session-7c3b7bbe`（轮次）与 `session-549adf8f`（覆盖写）。

## Global Constraints

- 只在 `dsh-local-history/` 内改动；不要碰其它插件目录。
- 单测命令统一为 `npx vitest run tests/<file>`（不要跑全量）。
- 中文产品文案：`第 {n} 轮`、`(无用户消息)` 已存在于 `src/client/locales.ts`，不要新增同义 key。
- 记录里 `turn` 语义保持不变 = DSH 引擎轮次；新增的用户输入序号只在 client 侧计算，**不写入 index.json**。
- 用户消息只能按 `event.data.source.kind === 'user'` 识别（`plugin` / `skill-catalog` / `agent-instructions` / `at-file-mention` / `subagent-*` 都是注入消息，必须排除）。
- 不要把 `binding.session.getSnapshot().nodes` 当作数据源：真实 `SessionSnapshot` 没有 `nodes` 字段（见 `@deepseek-ai/dsh-api-session-controller/lib/types/client/contract/snapshot.d.ts`）。

---

### Task 1: 覆盖写（write）不再被判成整文件新增

**Files:**
- Modify: `src/agent/cards.ts:135`
- Modify: `tests/agent-cards.spec.ts:75-106`
- Test: `tests/agent-cards.spec.ts`

**Interfaces:**
- Consumes: `hitFromMutationTool(name, argsRaw, cwd, turn)`；`beforeHashOf`（`src/agent/tag.ts:57`）里 `hit.oldText === undefined` 分支已实现「回退到 `latestHashForPath`」。
- Produces: `write` 命中不再返回 `oldText: null`，而是**不返回 `oldText` 字段**（`undefined`），复用现有回退分支。

**背景（为什么要改）**：DSH 的 `write` 是整文件覆盖，不是仅新建。现在 `name === 'write'` 无条件 `kind: 'add', oldText: null`，导致 `beforeHashOf` 命中 `if (hit.oldText === null) return { beforeHash: null, kind: 'add' }` 直接返回，从不回退到同路径上一版快照 → `DiffView` 里 `before = ''` → 整文件标新增。实测 `AsyncSyncEngine.java`（turn 13）真实改动仅 +13/-19 行（180 行文件），却整篇标新增。

- [ ] **Step 1: 写失败测试（覆盖写 → edit + 真实 beforeHash）**

`tests/agent-cards.spec.ts` 已有的 import（`mkdtemp` / `rm` / `tmpdir` / `join` / `afterEach` / `root` / `limits` / `HistoryStore` / `claimAgentCards` / `collectSessionEdits`）足够，无需新增 import；新增用例：

```ts
it('reuses the previous snapshot when write overwrites an existing file', async () => {
  root = await mkdtemp(join(tmpdir(), 'lh-write-'))
  const store = new HistoryStore(root)
  const before = await store.putBlob('line1\nline2\nline3\n')
  await store.append({
    id: 'prior', path: '/proj/a.ts', hash: before.hash, beforeHash: null,
    bytes: before.bytes, mtime: 1, source: 'agent', kind: 'add', sessionId: 's',
  }, limits, 1)

  const hits = collectSessionEdits([
    {
      type: 'event',
      event: {
        type: 'tool/call',
        data: { turn: 2, callId: 'c1', name: 'write', arguments: JSON.stringify({ file_path: '/proj/a.ts', content: 'line1\nCHANGED\nline3\n' }) },
      },
    },
    {
      type: 'event',
      event: { type: 'tool/result', data: { turn: 2, message: { source: { callId: 'c1' }, content: [{ type: 'tool-result', isError: false }] } } },
    },
  ], '/proj')

  const claimed = await claimAgentCards({
    store, sessionId: 's', limits, hits,
    readCurrent: async () => ({ content: 'line1\nCHANGED\nline3\n', binary: false }),
  })
  expect(claimed[0]?.kind).toBe('edit')
  expect(claimed[0]?.beforeHash).toBe(before.hash)
})
```

- [ ] **Step 2: 跑测试确认 RED**

Run: `npx vitest run tests/agent-cards.spec.ts`
Expected: FAIL —— `expected 'add' to be 'edit'`，且 `beforeHash` 为 `null`。

- [ ] **Step 3: 改 `hitFromMutationTool` 的 write 分支**

把 `src/agent/cards.ts:135` 由

```ts
  if (name === 'write') return { path, kind: 'add', oldText: null, turn }
```

改为

```ts
  // `write` 覆盖整文件：是否算新增由调用方按上一版快照判定，这里不下结论。
  if (name === 'write') return { path, kind: 'add', turn }
```

- [ ] **Step 4: 同步更新既有用例的期望**

`tests/agent-cards.spec.ts:103-105` 的期望从 `{ path: '/proj/a.ts', kind: 'add', oldText: null, turn: 1 }` 改为 `{ path: '/proj/a.ts', kind: 'add', turn: 1 }`，并把用例名从 `yields an add hit from a write tool call …` 改为 `yields a create hit from a write tool call with no prior snapshot`。

- [ ] **Step 5: 跑测试确认 GREEN**

Run: `npx vitest run tests/agent-cards.spec.ts`
Expected: PASS（全部用例）。

- [ ] **Step 6: Commit**

```bash
git add src/agent/cards.ts tests/agent-cards.spec.ts
git commit -m "fix(local-history): keep write hits relative to the previous snapshot"
```

---

### Task 2: 轮次按用户输入计数，并显示对应用户消息

**Files:**
- Modify: `src/client/present.ts:59-87`（`promptOfNode` / `collectTurnPrompts`）
- Modify: `src/client/session-tree.ts:84-102`（`collectTreePrompts` → `collectTreeRounds`）
- Modify: `src/client/ReviewView.tsx:59-86,160-164,271-288`
- Test: `tests/present.spec.ts`、`tests/session-tree.spec.ts`、`tests/review-view.spec.tsx`

**Interfaces:**
- Consumes: `sessionEventOf(node)`（`src/agent/cards.ts:99`，导出）用于解开 `{type:'event', event}` 包层；`eventSource.getSnapshot().entries`。
- Produces:
  - `export interface TurnRound { round: number; prompt: string }`
  - `export function collectTurnRounds(nodes: readonly unknown[]): Map<number | 'x', TurnRound>`
  - `export function roundAt(rounds: ReadonlyMap<number | 'x', TurnRound>, turn: number | undefined): TurnRound | undefined`
  - `export function collectTreeRounds(sessions: SessionsFace | undefined, sessionId: string): Map<number | 'x', TurnRound>`（`session-tree.ts`，替换 `collectTreePrompts`）
  - `ReviewView` 内 `groupByRound(records, rounds, newestFirst)`

**背景（为什么要改）**：`collectTurnPrompts` 只认 `node.kind === 'user'` + 顶层 `node.turn`（旧节点形状）。真实数据只有 `eventSource` entries，形状是 `{type:'event', event:{type:'user/message', data:{content:[{type:'text',text}], source:{kind:'user'}}}}`，且 `user/message` 不带 `turn`。实测把真实 entries 喂给它 → 空 Map → 每个分组都显示 `(无用户消息)`。同时 `turn` 是引擎轮次：实测 26 个 engine turn 只有 25 次用户输入，turn 6 完全没有用户消息，导致从第 6 轮起标签整体偏大 1。

- [ ] **Step 1: 写失败测试（轮次与用户消息）**

`tests/present.spec.ts` —— 用真实事件形状替换旧的假形状用例：

```ts
describe('collectTurnRounds', () => {
  const ev = (type: string, data: unknown) => ({ type: 'event', event: { type, data } })
  const user = (text: string, kind = 'user') => ev('user/message', { content: [{ type: 'text', text }], source: { kind } })

  it('numbers rounds by user input and ignores auto-continued turns', () => {
    const rounds = collectTurnRounds([
      ev('turn/start', { turn: 1 }), user('第一问'),
      ev('turn/start', { turn: 2 }), user('第二问'),
      ev('turn/start', { turn: 3 }),                       // 无用户消息：自动续跑
      ev('turn/start', { turn: 4 }), user('第三问'),
    ])
    expect(rounds.get(1)).toEqual({ round: 1, prompt: '第一问' })
    expect(rounds.get(2)).toEqual({ round: 2, prompt: '第二问' })
    expect(rounds.has(3)).toBe(false)
    expect(rounds.get(4)).toEqual({ round: 3, prompt: '第三问' })
  })

  it('ignores injected user/message sources', () => {
    const rounds = collectTurnRounds([
      ev('turn/start', { turn: 1 }), user('skill catalog', 'skill-catalog'), user('插件注入', 'plugin'),
    ])
    expect(rounds.size).toBe(0)
  })

  it('lets the first message of a turn name its round', () => {
    const rounds = collectTurnRounds([ev('turn/start', { turn: 1 }), user('主问题'), user('补一句')])
    expect(rounds.get(1)).toEqual({ round: 1, prompt: '主问题' })
  })
})

describe('roundAt', () => {
  it('merges a turn with no user input into the previous round', () => {
    const rounds = new Map([[1, { round: 1, prompt: 'A' }], [4, { round: 2, prompt: 'B' }]])
    expect(roundAt(rounds, 3)).toEqual({ round: 1, prompt: 'A' })
    expect(roundAt(rounds, 4)).toEqual({ round: 2, prompt: 'B' })
    expect(roundAt(rounds, undefined)).toBeUndefined()
  })
})
```

`tests/session-tree.spec.ts`：import 由 `collectTreeHits` 扩为 `{ collectTreeHits, collectTreeRounds }`，新增用例：

```ts
it('reads user rounds from eventSource entries when the session snapshot has no nodes', () => {
  const rounds = collectTreeRounds({
    list: {
      getSnapshot: () => ({ current: 'sess-1', byId: { 'sess-1': { id: 'sess-1', cwd: '/proj' } } }),
    },
    binding: () => ({
      session: { getSnapshot: () => ({}) },
      eventSource: {
        getSnapshot: () => ({
          entries: [
            { type: 'event', event: { type: 'turn/start', data: { turn: 2 } } },
            { type: 'event', event: { type: 'user/message', data: { content: [{ type: 'text', text: '改一下 README' }], source: { kind: 'user' } } } },
          ],
        }),
      },
    }),
  }, 'sess-1')
  expect(rounds.get(2)).toEqual({ round: 1, prompt: '改一下 README' })
})
```

- [ ] **Step 2: 跑测试确认 RED**

Run: `npx vitest run tests/present.spec.ts tests/session-tree.spec.ts`
Expected: FAIL —— `collectTurnRounds is not a function` / `roundAt is not a function`（未实现的 API 即为 RED，不要再跑别的）。

- [ ] **Step 3: 实现 `collectTurnRounds` / `roundAt`**

`src/client/present.ts`：删掉 `promptOfNode` 的旧字段猜测与 `collectTurnPrompts`，改为（保留 `promptPreview`、`relativeTo`、`presentReviewHit`、高亮相关不动）：

```ts
export interface TurnRound {
  /** 1-based 用户输入序号。 */
  round: number
  /** 该轮的第一条用户消息文本。 */
  prompt: string
}

function textOfContentBlocks(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  const texts: string[] = []
  for (const block of blocks) {
    if (typeof block === 'string') { texts.push(block); continue }
    if (block === null || typeof block !== 'object') continue
    const record = block as { type?: unknown; kind?: unknown; text?: unknown }
    if (typeof record.text === 'string' && (record.type === 'text' || record.kind === 'text')) texts.push(record.text)
  }
  return texts.join('\n')
}

/** 真正由用户提交的消息（注入内容带 plugin / skill-catalog 等 kind）。 */
function userPromptText(data: unknown): string {
  if (data === null || typeof data !== 'object') return ''
  const record = data as { content?: unknown; source?: { kind?: unknown } }
  if (record.source?.kind !== 'user') return ''
  return textOfContentBlocks(record.content).trim()
}

function turnOf(data: unknown): number | undefined {
  if (data === null || typeof data !== 'object') return undefined
  const turn = (data as { turn?: unknown }).turn
  return typeof turn === 'number' ? turn : undefined
}

/**
  * 引擎 turn → 该轮的用户输入。一轮 = 一个包含用户消息的引擎 turn；
  * 不含用户消息的 turn（自动续跑）不进表，由 {@link roundAt} 并入上一轮。
  */
export function collectTurnRounds(nodes: readonly unknown[]): Map<number | 'x', TurnRound> {
  const rounds = new Map<number | 'x', TurnRound>()
  let current: number | undefined
  let pending: string | undefined
  let count = 0
  const open = (turn: number | undefined, prompt: string): void => {
    if (prompt === '') return
    count += 1
    rounds.set(turn ?? 'x', { round: count, prompt })
  }
  for (const node of nodes) {
    const event = sessionEventOf(node)
    if (event === undefined) continue
    const data = event.data
    if (event.type === 'user/message') {
      const text = userPromptText(data)
      if (text === '') continue
      if (current === undefined) { if (pending === undefined) pending = text; continue }
      if (rounds.has(current)) continue
      open(current, text)
      continue
    }
    const turn = turnOf(data)
    if (turn === undefined) continue
    current = turn
    if (pending !== undefined && !rounds.has(turn)) { open(turn, pending); pending = undefined }
  }
  return rounds
}

/** 某个引擎 turn 所属的用户轮次；无用户消息的 turn 归入它之前最近的一轮。 */
export function roundAt(
  rounds: ReadonlyMap<number | 'x', TurnRound>,
  turn: number | undefined,
): TurnRound | undefined {
  if (turn === undefined) return rounds.get('x')
  for (let candidate = turn; candidate >= 1; candidate -= 1) {
    const found = rounds.get(candidate)
    if (found !== undefined) return found
  }
  return undefined
}
```

并在文件顶部 `import { sessionEventOf } from '../agent/cards.ts'`。

- [ ] **Step 4: 改 `session-tree.ts`**

`collectTreePrompts` → `collectTreeRounds`；去掉恒为空的 `session.getSnapshot().nodes` 读取，只读 `eventSource`：

```ts
import { collectTurnRounds, type TurnRound } from './present.ts'

/** 当前会话树（根 + 子代理）的 引擎 turn → 用户轮次 映射。 */
export function collectTreeRounds(
  sessions: SessionsFace | undefined,
  sessionId: string,
): Map<number | 'x', TurnRound> {
  const snapshot = sessions?.list?.getSnapshot?.() ?? {}
  const byId = snapshot.byId ?? {}
  const ids = treeSessionIds(byId, sessionId)
  const rounds = new Map<number | 'x', TurnRound>()
  for (const id of ids) {
    const entries = sessions?.binding?.(id)?.eventSource?.getSnapshot?.()?.entries ?? []
    for (const [turn, value] of collectTurnRounds(entries)) {
      if (!rounds.has(turn)) rounds.set(turn, value)
    }
  }
  return rounds
}
```

同时 `collectTreeHits` 也去掉 `binding.session.getSnapshot().nodes`（恒空），只保留 entries。

- [ ] **Step 5: 改 `ReviewView.tsx` 按用户轮次分组**

`groupByTurn` → `groupByRound`（键与标签都用轮次，缺映射时回退引擎 turn）：

```ts
import { collectTreeRounds, type SessionsFace } from './session-tree.ts'
import { presentReviewHit, promptPreview, roundAt, type TurnRound } from './present.ts'

function groupByRound(
  records: readonly HistoryRecord[],
  rounds: ReadonlyMap<number | 'x', TurnRound>,
  newestFirst: boolean,
): { key: string; round?: number; turn?: number; time?: number; records: HistoryRecord[] }[] {
  const map = new Map<string, { key: string; round?: number; turn?: number; time?: number; records: HistoryRecord[] }>()
  for (const record of records) {
    const owned = roundAt(rounds, record.turn)
    const key = owned !== undefined ? `r${owned.round}` : record.turn === undefined ? 'x' : `t${record.turn}`
    let group = map.get(key)
    if (group === undefined) {
      group = { key, round: owned?.round, turn: record.turn, time: record.mtime, records: [] }
      map.set(key, group)
    }
    group.records.push(record)
    if (group.turn === undefined) group.turn = record.turn
    if (record.mtime > (group.time ?? 0)) group.time = record.mtime
  }
  const groups = [...map.values()]
  groups.sort((a, b) => {
    const rank = (g: typeof a): number => g.round ?? g.turn ?? -1
    if (rank(a) !== rank(b)) return newestFirst ? rank(b) - rank(a) : rank(a) - rank(b)
    const aTime = a.time ?? 0
    const bTime = b.time ?? 0
    return newestFirst ? bTime - aTime : aTime - bTime
  })
  return groups
}
```

调用处：`const rounds = useMemo(() => collectTreeRounds(sessions, scope.sessionId), [sessions, scope.sessionId, records])`；`const groups = useMemo(() => groupByRound(filtered, rounds, filter !== 'done'), [filter, filtered, rounds])`。

分组头改为（`ReviewView.tsx:271-288`）：

```tsx
{groups.map((group) => {
  const owned = roundAt(rounds, group.turn)
  const label = group.round ?? group.turn
  return (
    <div key={group.key} className="dsh_lh_group">
      <div className="dsh_lh_groupHeader">
        <div className="dsh_lh_groupMeta">
          <span className="dsh_lh_groupTurn">
            {label === undefined ? t('turnUnknown') : t('turn', { n: String(label) })}
          </span>
          {group.time !== undefined && (
            <span className="dsh_lh_groupTime">{relativeTimeLong(group.time, t)}</span>
          )}
          <span className="dsh_lh_groupCount">{t('fileCount', { n: String(group.records.length) })}</span>
        </div>
        <div className="dsh_lh_groupPrompt">
          {owned === undefined || owned.prompt === '' ? t('noPrompt') : promptPreview(owned.prompt)}
        </div>
      </div>
      {/* records 渲染保持不变 */}
```

- [ ] **Step 6: 跑测试确认 GREEN**

Run: `npx vitest run tests/present.spec.ts tests/session-tree.spec.ts tests/review-view.spec.tsx`
Expected: PASS。`tests/review-view.spec.tsx` 新增一条（把 turn 6 —— 无用户消息的自动续跑 —— 并入开启它的第 5 轮）：

```tsx
it('merges an auto-continued turn into the user round that opened it', async () => {
  const records: HistoryRecord[] = [
    { ...pending, id: 'rec-5', turn: 5, path: '/proj/src/five.ts', hash: 'h5', beforeHash: 'b5' },
    { ...pending, id: 'rec-6', turn: 6, path: '/proj/src/six.ts', hash: 'h6', beforeHash: 'b6' },
    { ...pending, id: 'rec-7', turn: 7, path: '/proj/src/seven.ts', hash: 'h7', beforeHash: 'b7' },
  ]
  const event = (type: string, data: unknown) => ({ type: 'event', event: { type, data } })
  const sessions = {
    list: { getSnapshot: () => ({ current: 'sess-1', byId: { 'sess-1': { id: 'sess-1', cwd: '/proj' } } }) },
    binding: () => ({
      eventSource: {
        getSnapshot: () => ({
          entries: [
            event('turn/start', { turn: 5 }),
            event('user/message', { content: [{ type: 'text', text: '第五轮的问题' }], source: { kind: 'user' } }),
            event('turn/start', { turn: 6 }),
            event('turn/start', { turn: 7 }),
            event('user/message', { content: [{ type: 'text', text: '第六轮的问题' }], source: { kind: 'user' } }),
          ],
        }),
      },
    }),
  }
  const { root, container } = mount(createElement(ReviewApp, {
    scope: { sessionId: 'sess-1', cwd: '/proj' },
    remote: fakeRemote({ listReview: async () => ok({ records, pending: 3 }) }),
    sessions,
    t: lookup,
  }))
  await flush()
  const groups = [...container.querySelectorAll('.dsh_lh_group')]
  expect(groups.length).toBe(2)
  expect(groups.map((group) => group.querySelector('.dsh_lh_groupTurn')?.textContent))
    .toEqual([zh.turn.replace('{n}', '6'), zh.turn.replace('{n}', '5')])
  expect(groups.map((group) => group.querySelector('.dsh_lh_groupPrompt')?.textContent))
    .toEqual(['第六轮的问题', '第五轮的问题'])
  expect(container.textContent).not.toContain(zh.noPrompt)
  root.unmount()
})
```

- [ ] **Step 7: Commit**

```bash
git add src/client/present.ts src/client/session-tree.ts src/client/ReviewView.tsx tests/present.spec.ts tests/session-tree.spec.ts tests/review-view.spec.tsx
git commit -m "fix(local-history): count review rounds by user input"
```

---

### Task 3: 回填历史脏记录（add + 空 beforeHash）

**Files:**
- Create: `src/history/backfill.ts`
- Modify: `src/runtime.ts:170-192`（`syncSession`）
- Test: `tests/backfill.spec.ts`（新建）

**Interfaces:**
- Consumes: `HistoryStore`（`load` / `save` / `hasBlob` / `withLock`）、`sha256Hex`。
- Produces: `export async function backfillAgentBefore(store: HistoryStore): Promise<number>`（返回修正条数）。

**背景（为什么要改）**：`repairSnippetBefore` 在 `beforeHash === null` 时直接 return，所以误判成 `add` 的历史记录永远不会自愈；线上 `index.json` 里已经有这类脏记录（例如 `AsyncSyncEngine.java` turn 13：`kind=add, beforeHash=null`，而真实旧版本是同一 index 里的 `51579137…`）。

- [ ] **Step 1: 写失败测试**

`tests/backfill.spec.ts`：

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { backfillAgentBefore } from '../src/history/backfill.ts'
import { HistoryStore } from '../src/history/store.ts'

let root = ''
afterEach(async () => { if (root !== '') await rm(root, { recursive: true, force: true }); root = '' })

const limits = { maxPerFile: 50, maxBytes: 1_000_000, retentionDays: 30 }
const PATH_ = '/proj/a.ts'

async function seed() {
  root = await mkdtemp(join(tmpdir(), 'lh-backfill-'))
  const store = new HistoryStore(root)
  const v1 = await store.putBlob('line1\nline2\nline3\n')
  await store.append({ id: 'v1', path: PATH_, hash: v1.hash, beforeHash: null, bytes: v1.bytes, mtime: 1, source: 'agent', kind: 'add', sessionId: 's', turn: 1 }, limits, 1)
  const v2 = await store.putBlob('line1\nCHANGED\nline3\n')
  // watcher 对同一次写入也落了一条 save 记录，内容与 agent 记录相同
  await store.append({ id: 's2', path: PATH_, hash: v2.hash, beforeHash: v1.hash, bytes: v2.bytes, mtime: 2, source: 'save', kind: 'edit', sessionId: 's' }, limits, 2)
  await store.append({ id: 'v3', path: PATH_, hash: v2.hash, beforeHash: null, bytes: v2.bytes, mtime: 3, source: 'agent', kind: 'add', sessionId: 's', turn: 9 }, limits, 3)
  return store
}

describe('backfillAgentBefore', () => {
  it('points a mislabelled add at the newest different prior version', async () => {
    const store = await seed()
    expect(await backfillAgentBefore(store)).toBe(1)
    const record = (await store.load()).records.find((item) => item.id === 'v3')
    expect(record?.kind).toBe('edit')
    const expected = (await store.load()).records.find((item) => item.id === 's2')?.hash
    expect(record?.beforeHash).toBe(expected)
  })

  it('leaves a genuine creation alone and is idempotent', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-backfill-'))
    const store = new HistoryStore(root)
    const blob = await store.putBlob('brand new\n')
    await store.append({ id: 'n1', path: '/proj/new.ts', hash: blob.hash, beforeHash: null, bytes: blob.bytes, mtime: 1, source: 'agent', kind: 'add', sessionId: 's' }, limits, 1)
    expect(await backfillAgentBefore(store)).toBe(0)
    expect((await store.load()).records[0]?.kind).toBe('add')
    expect(await backfillAgentBefore(store)).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认 RED**

Run: `npx vitest run tests/backfill.spec.ts`
Expected: FAIL —— 无法解析 `../src/history/backfill.ts`。

- [ ] **Step 3: 实现 `src/history/backfill.ts`**

```ts
/**
  * 历史记录回填：早期版本把 `write`（整文件覆盖）一律记成 `add` + 空 beforeHash，
  * 界面上就会把整个文件显示成新增。同路径上一版快照其实还在同一个 index 里，
  * 这里一次性把它们改回 `edit` + 真实 beforeHash；幂等，无改动不落盘。
  */
import { sha256Hex, type HistoryStore } from './store.ts'
import type { HistoryRecord } from '../types.ts'

function samePath(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
}

/** 该记录之前、内容与它不同、且 blob 仍在的最新一版快照。 */
async function newestDifferentPrior(store: HistoryStore, records: readonly HistoryRecord[], record: HistoryRecord): Promise<string | null> {
  const candidates = records
    .filter((item) => item.id !== record.id && samePath(item.path, record.path))
    .filter((item) => item.mtime < record.mtime || (item.mtime === record.mtime && item.id < record.id))
    .filter((item) => item.hash !== null && item.hash !== record.hash)
    .sort((a, b) => b.mtime - a.mtime || b.id.localeCompare(a.id))
  for (const candidate of candidates) {
    if (candidate.hash !== null && (await store.hasBlob(candidate.hash))) return candidate.hash
  }
  return null
}

export async function backfillAgentBefore(store: HistoryStore): Promise<number> {
  return store.withLock(async () => {
    const index = await store.load()
    const emptyHash = sha256Hex('')
    let repaired = 0
    for (const record of index.records) {
      if (record.source !== 'agent') continue
      if (record.kind !== 'add') continue
      if (record.beforeHash !== null && record.beforeHash !== emptyHash) continue
      if (record.hash === null) continue
      const before = await newestDifferentPrior(store, index.records, record)
      if (before === null) continue
      record.beforeHash = before
      record.kind = 'edit'
      repaired += 1
    }
    if (repaired > 0) await store.save(index)
    return repaired
  })
}
```

- [ ] **Step 4: 跑测试确认 GREEN**

Run: `npx vitest run tests/backfill.spec.ts`
Expected: PASS。

- [ ] **Step 5: 在 `syncSession` 里调用**

`src/runtime.ts` 的 `syncSession`，在 `claimAgentCards` 之前加一行（同一把 store 锁内幂等）：

```ts
    const store = this.storeFor(sessionId, normalized)
    const settings = this.settings.get()
    await backfillAgentBefore(store)
    await claimAgentCards({
```

并在文件顶部补 `import { backfillAgentBefore } from './history/backfill.ts'`。

- [ ] **Step 6: 跑本轮相关测试**

Run: `npx vitest run tests/backfill.spec.ts tests/runtime.spec.ts tests/agent-cards.spec.ts`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/history/backfill.ts src/runtime.ts tests/backfill.spec.ts
git commit -m "fix(local-history): backfill beforeHash for mislabelled agent adds"
```

---

## 收尾（不属于任何单任务）

- [ ] `npm run typecheck`
- [ ] `npx vitest run`（全量一次，确认 3 个切片互相没打破）
- [ ] `npm run build`（重新产出 `lib/`，否则运行中的插件仍是旧代码）
- [ ] 真机验证：重启 `dsh web`，打开「改动审查」，确认①覆盖写的文件显示为行级 diff；②轮次标签按用户输入、且每条都能看到用户消息。
