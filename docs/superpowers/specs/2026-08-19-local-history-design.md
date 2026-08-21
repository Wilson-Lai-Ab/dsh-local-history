# dsh-local-history 设计

**日期**：2026-08-19  
**状态**：已批准，待用户审阅本文件后进入实施计划  
**包名**：`dsh-local-history`  
**范围**：独立插件——按会话的 Local History 快照 + 会话内改动审查（整文件与 hunk 接受/拒绝）  
**非目标**：不改 `DSH-better-sidebar` 源码；不删除其内置审查；不做文件搜索（另包、另会话）

---

## 1. 背景与决定

`DSH-better-sidebar` 里的「改动审查」是：从会话工具卡收集本会话 AI 写过的文件，Keep / Undo（含 hunk），账本是会话目录下的 `review.json`。它**不是** VS Code Local History（保存即全文快照 + Timeline）。

本插件用 Local History 承载审查：

- 落盘即拍全文快照（用户保存、其它程序写盘、AI 工具写盘）。
- 能对上本会话工具卡的标为 `agent`，对不上的标为 `save`。
- 审查列表只看当前会话的 AI 改动，接受 / 拒绝。
- 文件 Timeline 跨同一项目下仍存在的会话，拼完整时间线。
- 删除会话目录即丢掉该会话的历史。

曾考虑拆「引擎包 + 审查子插件」。否决：审查离开快照引擎不能工作，等于多一次安装。审查是**同一包内的功能模块**（`src/history/` + `src/client/review/`），不是第二个 npm 包。

曾考虑 hunk 画进 sidebar 的 `TextEditor`。否决：必须先改 better-sidebar，与「旧代码先不动」冲突。hunk 只画在本插件自有 Diff 页。

---

## 2. 产品行为

### 2.1 谁会进历史

| 事件 | 是否拍快照 | `source` |
|---|---|---|
| 侧栏编辑器保存、系统编辑器保存、其它进程写盘 | 是 | `save` |
| 本会话（含子代理）工具写 / 改 / 删文件 | 是 | `agent` |
| 忽略目录内的变化 | 否 | — |
| 二进制变化 | 只记账，不存全文 blob | 同左列规则 |

判定 `agent`（两条任一命中即可，否则 `save`）：

1. **工具卡优先**：当前会话树（含子代理）里，该路径已有成功的写 / 改 / 删工具卡，且尚未被一条 `source: agent` 快照认领。不靠毫秒级时间窗。
2. **监视器补拍**：cwd 监视到该路径变化时，若第 1 条已成立但还没有对应快照，补一条 `agent`；否则拍 `save`。

`beforeHash` 来源，按顺序：工具卡 `oldText`（写成 blob）→ 该路径上一条快照的 `hash` → 视为 `add`（无 before）。监视器是「写后」事件，不能再读到写前磁盘，因此**禁止**在 watch 回调里把「当前磁盘」当成 before。

### 2.2 审查（不跨会话）

- 只列出**当前会话 + 其子代理**、且 `source: agent` 的路径。
- 按轮次分组，一行一个文件：文件名、目录、A/M/D、相对时间、处理状态。
- 筛选：待处理（默认）/ 全部 / 已处理。
- 整文件 **接受**：磁盘已是新内容，只把该条标 `accepted`。
- 整文件 **拒绝**：把磁盘恢复为 `beforeHash` 对应内容；新建（无 before）则删除该文件；标 `rejected`。
- 子代理改的文件出现在父会话列表；写回时用那条子代理的 cwd。

### 2.3 自有 Diff 与 hunk

- 打开列表中的文件 → 本插件 Diff（`beforeHash` blob vs 磁盘当前文本），不打开 sidebar `TextEditor` 当审查画布。点「在编辑器打开」可另走 `openFile`，那是阅读/手改，不是审查画布。
- unified diff。每个 hunk 悬停：接受 / 拒绝。
- 接受 hunk：只记该块已接受，磁盘不变。
- 拒绝 hunk：从当前文本剥掉该块，写回磁盘，并追加一条 `source: save` 快照。
- 全部 hunk 处理完后，文件级状态自动变为 `accepted` 或 `rejected`。
- 二进制、删除类没有 hunk，只走整文件。
- 当前文本已漂移、hunk 对不上：该块禁用，提示先整文件处理或刷新。

### 2.4 文件 Timeline（跨会话、同项目）

- 按绝对路径聚合**同一 cwd（同一项目）下、磁盘上还在的会话**里的快照。
- 不跨项目。
- 每条显示时间、`AI` / `保存` 徽章、来源会话、体积。
- 可与磁盘当前比，或与另一条比。
- **恢复**某条：把该 blob 写回磁盘，并再拍一条 `save`（避免丢掉恢复前的当前版）。
- 审查里的「拒绝」= 恢复到该条的 `beforeHash`。
- 删掉某个会话目录后，时间线少那一段。

### 2.5 Tab 与角标

- 经 `ctx.betterSidebar.registerTab` 注册单实例 tab，id：`dsh-local-history:review`，标题「改动审查」。
- 不与内置 `review` 撞 id；两套审查暂时都出现在 `+` 菜单。
- 角标：当前会话待处理 agent 文件数，99+ 封顶。
- 未安装 better-sidebar：插件可加载，不注册 tab，host 监视仍可工作。

---

## 3. 架构

独立包，形态对齐 `dsh-at-file`：host + 单文件 client，`cordis.patch.yml` 挂载。

```
dsh-local-history/
  src/index.ts              host 入口：监视、回收、自有 API
  src/history/              快照引擎（index / blob / 分源 / 回收）
  src/watch/                有界目录监视 + 忽略名单
  src/agent-tag.ts          会话工具卡 → agent 标记与 oldText
  src/client/index.ts       注册 tab / 文案 / 设置
  src/client/review/        列表、Diff、hunk、Timeline UI
```

**依赖**：`dsh-better-sidebar` 为 optional peer。所有运行时交互走 `ctx.betterSidebar.*`，client **禁止** value-import sidebar 源码。

**API**：本插件自有 host 路由（例如 `/local-history/api/*` 或 Typert remote），**不**挂到 sidebar 的 `/sidebar/api`。读写磁盘、列索引、接受/拒绝、恢复、读 blob 都走这条线。

**数据流**

```
用户保存 / 其它写盘 ──┐
                     ├─► host 监视 ─► 会话目录快照（blobs + index）
AI 工具写文件 ───────┤         ▲
       │                      │
       └──► 会话工具卡 ─► 标记 agent + beforeHash
快照 ─► 审查 Tab ─► 列表（本会话 agent）
                 ├─► 自有 Diff + hunk
                 └─► Timeline（同项目跨会话）
```

---

## 4. 存储

路径与现有 sidebar `review.json` 同层，互不读写：

```
~/.dsh/sessions/<projectKey>/<sessionId>/
  session.jsonl.zstd          （DSH，只读）
  review.json                 （better-sidebar 旧账本，本插件不碰）
  local-history/
    index.json                本会话快照元数据
    blobs/<sha256>            全文，按内容寻址
```

`projectKey` / `sessionId` 编码与 `DSH-better-sidebar` 的 `review-disk.ts` 相同（`DSH_SESSIONS_ROOT` 或 `~/.dsh/sessions`），以便「删会话目录 = 清历史」，且跨会话 Timeline 能扫到同一项目下的兄弟会话。

**`index.json` 一条记录至少包含：**

- `id`：稳定条目 id  
- `path`：绝对路径  
- `hash`：内容 sha256；删除则为空  
- `beforeHash`：拒绝时恢复的版本；新建为空  
- `bytes`、`mtime`  
- `source`：`agent` | `save`  
- `kind`：`add` | `edit` | `delete`  
- `sessionId`、可选 `turn`、可选 `agentSessionId`（子代理）  
- `decision`：仅 agent 使用，`pending` | `accepted` | `rejected`  
- `hunks`：可选，hunk key → `accepted` | `rejected`

相同内容只存一份 blob。二进制不写 blob，审查里只能整文件恢复/放弃。

**忽略目录**与 sidebar `shouldSkipFindDir` 对齐：`node_modules`、`.git`、常见缓存与构建产物。监视根是会话 cwd。

**删除会话**：不监听 DSH「会话已删除」事件。目录没了，账本和 blob 一起没了；跨会话 Timeline 扫盘时自然少那段。

---

## 5. 保留策略

设置（tab 齿轮 `pluginToggles`），默认：

| 项 | 默认 | 钳制 |
|---|---|---|
| 每文件快照数 | 50 | 1–200 |
| 每会话体积 | 200 MB | 16–2048 MB |
| 保留天数 | 30 | 1–365 |
| 监视开关 | 开 | 布尔 |

回收顺序：最旧的 `save` → 最旧的**已处理** `agent`。**`decision === pending` 的 agent 及其 `beforeHash` / `hash` blob 不自动删。** 引用计数为 0 的 blob 才删。

---

## 6. 错误处理

- 单次监视 / 读盘 / 写回失败：列表或 Diff 内联错误，tab 不崩。
- 无 cwd 或目录不可读：空态说明。
- hunk 对不上当前文本：该块禁用 + 提示。
- 监视器对重复 fs 错误退避，不把整个会话打挂。
- 无 better-sidebar：不注册 tab，不抛未捕获异常。

---

## 7. 测试

v1 必须覆盖：

- 同内容只存一份 blob。  
- 工具卡命中 → `agent` + `beforeHash`；未命中 → `save`。  
- 拒绝整文件：恢复 `beforeHash` 或删除新建文件。  
- 拒绝一个 hunk：磁盘正确，并多一条 `save`。  
- 文本漂移：hunk 禁用。  
- 触顶回收：不删 pending agent；0 引用 blob 被删。  
- 删会话目录后，跨会话 Timeline 不再出现该会话条目。  
- 忽略目录不拍。  
- 无 sidebar 时 client apply 不炸；有 sidebar 时 tab id 不是 `review`。

---

## 8. 明确不做

- 改 `DSH-better-sidebar` 源码（含保存钩子、gutter、删除内置审查）。  
- 文件搜索插件（Quick Open / ripgrep）——另包、另会话。  
- 审查列表跨会话。  
- Timeline 跨项目。  
- 二进制 hunk。  
- 把审查做成第二个可独立安装的 npm 包。  
- 编辑器内绿条 / Keep 条。

---

## 9. 验收

- 用户在侧栏保存或 AI 写盘后，该文件在本会话 Timeline 有对应快照，来源徽章正确。  
- 审查列表只出现本会话 AI 改动；接受留下磁盘；拒绝回到写前（或删新建）。  
- Diff 页可按 hunk 接受/拒绝。  
- 打开文件 Timeline 能看到同项目其它未删会话的历史。  
- 删会话目录后，该会话快照与审查条目消失。  
- 设置能限制数量 / 体积 / 天数；pending 不被回收误删。  
- better-sidebar 内置审查行为不变。

---

## 10. 后续（不在本 spec）

1. 另会话设计 `dsh-file-search`（快捷键 Quick Open + 侧栏 ripgrep）。  
2. 本插件能用且稳定后，再考虑删 better-sidebar 内置审查。  
3. 若需要主编辑器里的 hunk 条，再给 sidebar 开 gutter 扩展点（单独 spec）。
