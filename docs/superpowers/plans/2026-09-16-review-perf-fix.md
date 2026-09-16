# 改动审查性能修复 Implementation Plan

> **For agentic workers:** Class M → execute with superpowers:executing-plans in this session. No implementer subagents, no per-slice reviewer (M = 1 whole-feature review). Steps use checkbox syntax.

**Class:** M — 一个目标（把一次 syncSession 从 ~1.1s 压到几十毫秒、且不再丢/重建记录）穿过 store/gc、watcher、tagger、client 同步四处。

**Goal:** 打开「改动审查」不再卡顿：宿主不再被同步 RPC 长时间占住，存储不再被超大文件撑爆，审查渲染在大文件/缺失内容时仍然诚实。

**Architecture:** 三条线：①不该收的不收（忽略目录 + blob 体积上限 + 超限时的渲染降级）；②gc 单遍化并能在超限时真正腾空间；③`claimAgentCards` 批量化为「一次 load、一次 append」。

**Tech Stack:** TypeScript、vitest（`npx vitest run tests/<file>`）、node fs。

**Spec/证据:** 本轮回测数据（真实会话 `session-549adf8f`）：
- 宿主 `store.load()` 1.7ms；`listReview` 3.4ms；客户端 `collectSessionEdits`(15284 事件) 5.1ms；渲染 217KB/4466 行 ~21–31ms。
- **一次 `syncSession` = 1089ms**；把 `maxBytes` 提到 10GB 后稳态降到 **220ms** 且从「每次重建 132 条」变成「重建 0 条」。
- 单会话 blob 达 **233MB**，其中 `hexincloud/logs/*.log` 单文件 61.8MB（`DEFAULT_IGNORE_DIRS` 没有 `logs`）。

## Global Constraints

- 不改变 `HistoryRecord`/wire 契约字段；`turn` 语义不变。
- **渲染正确性优先**：任何「内容缺失/过大」的情况必须显式提示，绝不渲染成空的或伪造的 diff。
- 不得丢弃 `pending` 的 agent 记录（那是用户还没处理的审查项）。
- 每个切片先写失败测试，再实现；单测命令只跑相关文件，全量在收尾跑一次。

---

### Slice 1: 不该收的不收（忽略目录 + blob 体积上限 + 渲染降级）

**Files:**
- Modify: `src/defaults.ts`（`DEFAULT_IGNORE_DIRS` 加 `logs`）
- Modify: `src/history/store.ts`（导出 `MAX_SNAPSHOT_BYTES`）
- Modify: `src/watch/watcher.ts`（超限不落盘、不建记录）
- Modify: `src/runtime.ts`（`readBlob` 超限拒绝）
- Modify: `src/client/DiffView.tsx`（超限提示，复用 `binaryFile` 那类文案）
- Test: `tests/watcher.spec.ts`、`tests/runtime.spec.ts`、`tests/diff-view.spec.tsx`

**Interfaces:**
- Produces: `export const MAX_SNAPSHOT_BYTES: number`（2MB）; `readBlob` → `{ content }` 或抛错（超限）。

- [ ] 跳过目录加 `logs`，并加一条 `shouldSkipDir('logs')` 为 true 的断言。
- [ ] watcher：`readCurrent` 得到的内容超过 `MAX_SNAPSHOT_BYTES` 时**不建任何记录**（二进制已有先例），测试断言 store 里没有该路径的记录。
- [ ] `readBlob`：blob 超过上限时抛 `too-large`（不把 61MB 读进内存/发到浏览器）。
- [ ] `DiffView`：捕获该错误并显示「文件过大，未保留内容」类提示（新增 locale key），断言不显示空 diff。

### Slice 2: `claimAgentCards` 批量化

**Files:**
- Modify: `src/history/store.ts`（新增 `appendMany(records, limits, now)`：锁内一次 load、一次 gc、一次 save）
- Modify: `src/agent/tag.ts`（`claimAgentCards` 改为一次 load → 循环判定 → 一次 appendMany）
- Test: `tests/agent-cards.spec.ts`

**Interfaces:**
- Consumes: 现有 `claimedBy` / `beforeHashOf` / `repairSnippetBefore` / `acceptEarlierPending` 语义。
- Produces: `HistoryStore.appendMany(records: HistoryRecord[], limits: HistoryLimits, now?: number): Promise<HistoryIndex>`

- [ ] 保持语义的测试先行：同一 (session, path, turn) 只建一条；更早的 pending 同路径被置 accepted；新记录 beforeHash 回退到上一版。
- [ ] 实现批量：批内去重、末尾一次写盘；断言「一次同步只写一次 index」（可用 spy 计 save 次数）。

### Slice 3: gc 单遍化 + 超限可腾空间

**Files:**
- Modify: `src/history/store.ts`（`gc`）
- Test: `tests/history-store.spec.ts`

- [ ] 失败测试：当前实现下，字节超限且只有大体积 `save` 记录时，`gc` 无法把体积降到限额以下，且**每次 append 都重复 statSync**（用计数 spy 断言 stat 次数上界）。
- [ ] 重写：一次遍历算 live bytes；淘汰顺序 = 过期 save → 超 maxPerFile 的 save → 超限时最老的 save → 超限时最老的已裁决 agent；**永不淘汰 pending agent**。
- [ ] 断言：超限场景下 gc 后体积下降且 pending agent 保留。

## 收尾

- [ ] `npm run typecheck` / `npx vitest run`（全量一次）/ `npm run build`
- [ ] 用同一套基准复测（真实会话副本，234 hits）：稳态 sync 应从 1089ms 降到 ≤100ms 量级，且「重建 132 条」变 0。
- [ ] 1 次整特性 review（M 级）。
