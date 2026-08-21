# Local History Implementation Plan

> **For agentic workers:** Pick the execution skill from using-superpowers
> Execution Routing (S = this session, no SDD; M = executing-plans;
> L = subagent-driven-development). Do not default to SDD. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone `dsh-local-history` plugin that snapshots workspace writes into the DSH session directory, reviews this session’s AI file edits with file- and hunk-level accept/reject, and shows a per-file Timeline across remaining sessions in the same project.

**Architecture:** Host owns a content-addressed snapshot store under `~/.dsh/sessions/<project>/<sessionId>/local-history/`, tags records `agent` vs `save` from conversation tool cards, and exposes a Typert remote `localHistory`. The client optionally registers `dsh-local-history:review` on `ctx.betterSidebar` and renders list / Diff / Timeline against that remote. `DSH-better-sidebar` source is not modified.

**Tech Stack:** TypeScript, Cordis, Typert remote (same recipe as `dsh-at-file`), optional peer `dsh-better-sidebar`, React 18 client bundle, vitest, esbuild.

**Spec:** `docs/superpowers/specs/2026-08-19-local-history-design.md`

## Global Constraints

- Do not modify `DSH-better-sidebar` source. Do not delete or replace its built-in `review` tab.
- Package name is `dsh-local-history`. Tab id is `dsh-local-history:review` (never `review`).
- `dsh-better-sidebar` is an **optional** peer. Client must `import type {}` only; runtime talks through `ctx.betterSidebar`.
- Session directory encoding must match `DSH-better-sidebar/src/review/review-disk.ts` (`projectKey`, `encodeSessionSegment`, `DSH_SESSIONS_ROOT` or `~/.dsh/sessions`).
- Storage lives at `<sessionDir>/local-history/{index.json,blobs/<sha256>}`. Never read or write sidebar `review.json`.
- `beforeHash` comes from tool-card `oldText` or the previous snapshot hash. Never treat “current disk after a watch event” as before.
- Agent claim rule: an unclaimed successful write/edit/delete tool card for that path in the current session tree (including subagents). No millisecond time window.
- Recycle oldest `save`, then oldest decided `agent`. Never auto-delete `decision === 'pending'` agent records or blobs they still reference.
- Review list is this session + its subagents only. Timeline is same `cwd` / project, remaining session dirs only.
- Product copy in `src/client/locales.ts` is Chinese + English. Code comments and README are English.
- `pnpm run check` (typecheck + tests + build) must be green before every commit. `lib/` is committed.
- Client bundle is a single file `/plugins/dsh-local-history/client.js` (ModuleLoader banner/footer like `dsh-at-file`).

---

## File map

```
dsh-local-history/
  package.json
  dsh.plugin.json
  cordis.patch.yml
  build.mjs
  tsconfig.json
  vitest.config.ts
  README.md
  README.zh.md
  src/index.ts                 host apply: settings, typert, watch, runtime
  src/types.ts                 shared TS-only types
  src/defaults.ts              ignore dirs + settings clamps/defaults
  src/session-path.ts          projectKey / encodeSessionSegment / sessionDir
  src/history/document.ts      parse/serialize index.json
  src/history/store.ts         read/write blobs, append snapshot, gc
  src/history/hunks.ts         hunksFromTexts + applyHunkUndo (no sidebar import)
  src/history/actions.ts       accept/reject file and hunk; restore snapshot
  src/agent/cards.ts           tool-card locations + oldText (ported, standalone)
  src/agent/tag.ts             claim unclaimed cards → agent snapshots
  src/watch/ignore.ts          shouldSkipDir
  src/watch/watcher.ts         bounded cwd watch → snapshot
  src/settings.ts              host settings namespace
  src/contract.ts              wire types + zod + LOCAL_HISTORY_INVOCATIONS
  src/typert.ts                host Typert manifest
  src/runtime.ts               LocalHistoryRuntime methods
  src/client/index.ts          apply: remote mount, optional registerTab
  src/client/remote.ts         Typert remote contribution
  src/client/locales.ts
  src/client/styles.ts
  src/client/ReviewView.tsx    list + filters
  src/client/DiffView.tsx      unified diff + hunk buttons
  src/client/TimelineView.tsx  per-file cross-session timeline
  tests/*.spec.ts
```

---

### Task 1: Package scaffold, session paths, ignore list

**Files:**
- Create: `package.json`, `dsh.plugin.json`, `cordis.patch.yml`, `build.mjs`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `README.md`, `README.zh.md`
- Create: `src/defaults.ts`, `src/session-path.ts`, `src/types.ts`, `src/index.ts` (stub `apply` that no-ops until later tasks)
- Test: `tests/session-path.spec.ts`, `tests/defaults.spec.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `encodeSessionSegment(raw: string): string`
  - `projectKey(cwd: string): string`
  - `defaultSessionsRoot(): string` — `process.env.DSH_SESSIONS_ROOT` or `join(homedir(), '.dsh', 'sessions')`
  - `sessionDir(root: string, cwd: string | undefined, sessionId: string): string`
  - `historyDir(sessionDir: string): string` — `join(sessionDir, 'local-history')`
  - `DEFAULT_IGNORE_DIRS: readonly string[]`
  - `shouldSkipDir(name: string): boolean` — `name.startsWith('.')` or name in `DEFAULT_IGNORE_DIRS` plus sidebar-aligned `node_modules`, `.git`, `dist`, `lib`, `coverage`, `.pnpm-store`, `target`, `build`, `.next`, `.turbo`, `out`
  - `clampMaxPerFile(n: number): number` (1–200, default 50)
  - `clampMaxBytes(n: number): number` (16MB–2048MB, default 200MB)
  - `clampRetentionDays(n: number): number` (1–365, default 30)
  - `export const name = 'dsh-local-history'`
  - `export const inject = ['typert', 'settings']` (host; later tasks may add nothing else)

- [ ] **Step 1: Write failing session-path tests**

Create `tests/session-path.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { encodeSessionSegment, historyDir, projectKey, sessionDir } from '../src/session-path.ts'

describe('encodeSessionSegment', () => {
  it('passes through safe chars', () => {
    expect(encodeSessionSegment('abc-123_X')).toBe('abc-123_X')
  })
  it('encodes empty as throw', () => {
    expect(() => encodeSessionSegment('')).toThrow(/empty/)
  })
  it('encodes . and ..', () => {
    expect(encodeSessionSegment('.')).toBe('~002E')
    expect(encodeSessionSegment('..')).toBe('~002E~002E')
  })
  it('encodes slash and tilde', () => {
    expect(encodeSessionSegment('a/b')).toBe('a~002Fb')
    expect(encodeSessionSegment('a~b')).toBe('a~007Eb')
  })
})

describe('projectKey', () => {
  it('wraps a readable cwd', () => {
    expect(projectKey('/Users/me/work')).toBe('--Users-me-work--')
  })
  it('collapses consecutive separators', () => {
    expect(projectKey('C:\\foo\\bar')).toBe('--C-foo-bar--')
  })
  it('throws on empty cwd', () => {
    expect(() => projectKey('')).toThrow(/empty/)
  })
})

describe('sessionDir', () => {
  it('nests project then session and history', () => {
    const dir = sessionDir('/tmp/sessions', '/proj', 'sid/1')
    expect(dir.replace(/\\/g, '/')).toBe('/tmp/sessions/--proj--/sid~002F1')
    expect(historyDir(dir).replace(/\\/g, '/')).toBe('/tmp/sessions/--proj--/sid~002F1/local-history')
  })
  it('uses _no-cwd when cwd is missing', () => {
    expect(sessionDir('/tmp/sessions', undefined, 's').replace(/\\/g, '/'))
      .toBe('/tmp/sessions/_no-cwd/s')
  })
})
```

Copy `encodeSessionSegment` / `projectKey` **verbatim** from `DSH-better-sidebar/src/review/review-disk.ts` (do not “simplify”).

- [ ] **Step 2: Run tests — expect FAIL** (`session-path` not found)

Run: `pnpm exec vitest run tests/session-path.spec.ts`

- [ ] **Step 3: Scaffold package + implement session-path and defaults**

`package.json` name `dsh-local-history`, version `0.1.0`, `"type": "module"`, scripts `build` / `typecheck` / `test` / `check` matching `dsh-at-file`. Peer `dsh-better-sidebar` optional. DevDeps: typescript, vitest, esbuild, react types. Host peers: cordis, dsh-typert-*, dsh-settings (optional where at-file does).

`dsh.plugin.json`:

```json
{
  "name": "dsh-local-history",
  "description": "Session-scoped local history and AI change review",
  "version": "0.1.0",
  "entry": { "name": "dsh-local-history", "inject": ["typert", "settings"] },
  "client": { "platform": "web" }
}
```

`cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-local-history
      name: dsh-local-history
```

`build.mjs`: copy `dsh-at-file/build.mjs` and replace ids/`dsh-at-file` with `dsh-local-history`. Host entry `src/index.ts` → `lib/index.js`. Client `src/client/index.ts` → `lib/client.js` with ModuleLoader banner `id: 'dsh-local-history'`. Skip `invariant` extra entry unless you add that file.

`src/session-path.ts`: port the two encoders; implement `defaultSessionsRoot`, `sessionDir`, `historyDir`.

`src/defaults.ts`: ignore list + three clamp helpers. Defaults: `MAX_PER_FILE = 50`, `MAX_BYTES = 200 * 1024 * 1024`, `RETENTION_DAYS = 30`, `watchEnabled = true`.

`src/index.ts` stub:

```ts
import type { Context } from '@deepseek-ai/cordis'
export const name = 'dsh-local-history'
export const inject = ['typert', 'settings']
export function apply(_ctx: Context): void {}
```

`src/client/index.ts` stub `export function apply(): void {}` so the client build has an entry.

- [ ] **Step 4: Run session-path + defaults tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add package.json dsh.plugin.json cordis.patch.yml build.mjs tsconfig.json vitest.config.ts .gitignore README.md README.zh.md src tests
git commit -m "chore: scaffold dsh-local-history with session path encoding"
```

---

### Task 2: Snapshot store (blobs, index, recycle)

**Files:**
- Create: `src/history/document.ts`, `src/history/store.ts`
- Test: `tests/history-store.spec.ts`

**Interfaces:**
- Consumes: `historyDir`, clamps from Task 1
- Produces:
  - Types in `src/types.ts` (or `document.ts`):

```ts
export type HistorySource = 'agent' | 'save'
export type HistoryKind = 'add' | 'edit' | 'delete'
export type HistoryDecision = 'pending' | 'accepted' | 'rejected'

export interface HistoryRecord {
  id: string
  path: string
  hash: string | null
  beforeHash: string | null
  bytes: number
  mtime: number
  source: HistorySource
  kind: HistoryKind
  sessionId: string
  turn?: number
  agentSessionId?: string
  decision?: HistoryDecision
  hunks?: Record<string, 'accepted' | 'rejected'>
}

export interface HistoryIndex {
  version: 1
  records: HistoryRecord[]
}

export interface HistoryLimits {
  maxPerFile: number
  maxBytes: number
  retentionDays: number
}

export function emptyIndex(): HistoryIndex
export function parseIndex(raw: unknown): HistoryIndex
export function sha256Hex(bytes: Uint8Array | string): string
export function blobPath(historyRoot: string, hash: string): string

export class HistoryStore {
  constructor(readonly historyRoot: string)
  load(): Promise<HistoryIndex>
  save(index: HistoryIndex): Promise<void>
  putBlob(content: string): Promise<{ hash: string; bytes: number }>
  readBlob(hash: string): Promise<string>
  append(record: HistoryRecord, limits: HistoryLimits, now?: number): Promise<HistoryIndex>
  /** Recycle per spec; returns next index. Never drops pending agent or live hashes. */
  gc(index: HistoryIndex, limits: HistoryLimits, now?: number): HistoryIndex
}
```

- [ ] **Step 1: Write failing store tests**

`tests/history-store.spec.ts` (use `mkdtemp` under `os.tmpdir()`):

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HistoryStore, sha256Hex } from '../src/history/store.ts'
import type { HistoryRecord } from '../src/types.ts'

const limits = { maxPerFile: 2, maxBytes: 1024, retentionDays: 30 }
let root = ''
afterEach(async () => { if (root !== '') await rm(root, { recursive: true, force: true }) })

function rec(over: Partial<HistoryRecord>): HistoryRecord {
  return {
    id: over.id ?? 'r1',
    path: over.path ?? '/proj/a.ts',
    hash: over.hash ?? 'h',
    beforeHash: over.beforeHash ?? null,
    bytes: over.bytes ?? 10,
    mtime: over.mtime ?? 1,
    source: over.source ?? 'save',
    kind: over.kind ?? 'edit',
    sessionId: over.sessionId ?? 's',
    ...over,
  }
}

describe('HistoryStore', () => {
  it('stores identical content once', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    const store = new HistoryStore(root)
    const a = await store.putBlob('hello')
    const b = await store.putBlob('hello')
    expect(a.hash).toBe(b.hash)
    expect(a.hash).toBe(sha256Hex('hello'))
    expect(await store.readBlob(a.hash)).toBe('hello')
  })

  it('does not recycle pending agent when over maxPerFile', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    const store = new HistoryStore(root)
    const { hash } = await store.putBlob('new')
    let index = await store.load()
    index.records.push(rec({
      id: 'old-save', source: 'save', hash, mtime: 1, path: '/p/a.ts',
    }))
    index.records.push(rec({
      id: 'pending', source: 'agent', decision: 'pending', hash, mtime: 2, path: '/p/a.ts',
    }))
    index.records.push(rec({
      id: 'newer-save', source: 'save', hash, mtime: 3, path: '/p/a.ts',
    }))
    index = store.gc(index, limits, 10)
    const ids = index.records.map(r => r.id)
    expect(ids).toContain('pending')
    expect(ids).not.toContain('old-save')
  })

  it('drops unreferenced blobs after gc', async () => {
    root = await mkdtemp(join(tmpdir(), 'lh-'))
    const store = new HistoryStore(root)
    const gone = await store.putBlob('gone')
    const keep = await store.putBlob('keep')
    let index = await store.load()
    index.records.push(rec({ id: 'k', hash: keep.hash, bytes: keep.bytes, mtime: 1 }))
    index = store.gc(index, { maxPerFile: 50, maxBytes: 1024, retentionDays: 30 }, 10)
    await store.save(index)
    await expect(store.readBlob(gone.hash)).rejects.toThrow()
    expect(await store.readBlob(keep.hash)).toBe('keep')
  })
})
```

Also test `parseIndex` ignores unknown version by returning `emptyIndex()`, and a malformed file becomes empty.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement document + store**

`putBlob`: `createHash('sha256')`, write `blobs/<hex>` if missing (atomic tmp+rename).

`append`: push record, then `gc`, then `save`.

`gc` algorithm (must match spec §5):

1. Collect live hashes: every remaining record’s `hash` and `beforeHash` that are non-null.
2. Drop `save` records older than `now - retentionDays` **or** excess per-path beyond `maxPerFile` (sort that path’s records by `mtime` asc, drop oldest `save` first).
3. If still over `maxBytes` (sum of unique live blob sizes) or per-file count, drop oldest `agent` with `decision` in `accepted|rejected`.
4. Never drop `decision === 'pending'` or `decision === undefined` agent rows.
5. Delete blob files whose hash is not in the live set after drops.

`save`: write `index.json` via tmp+rename. `load`: missing file → empty.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/history tests/history-store.spec.ts
git commit -m "feat: content-addressed local-history store with pending-safe gc"
```

---

### Task 3: Agent cards, tagging, file/hunk accept-reject

**Files:**
- Create: `src/agent/cards.ts`, `src/agent/tag.ts`, `src/history/hunks.ts`, `src/history/actions.ts`
- Test: `tests/agent-cards.spec.ts`, `tests/hunks.spec.ts`, `tests/actions.spec.ts`

**Interfaces:**
- Consumes: `HistoryStore`, `HistoryRecord`
- Produces:

```ts
export type AgentEditKind = 'add' | 'edit' | 'delete'

export interface AgentCardHit {
  path: string          // unresolved path from the card
  kind: AgentEditKind
  oldText?: string | null
  turn?: number
}

export function reviewLocations(view: unknown): { path: string; kind: AgentEditKind }[]
export function oldTextOf(view: unknown, path: string): string | null | undefined
export function collectSessionEdits(nodes: readonly unknown[], cwd?: string): AgentCardHit[]
export function resolveProjectPath(cwd: string | undefined, path: string): string
export function sameCardPath(a: string, b: string): boolean

export interface ClaimInput {
  store: HistoryStore
  sessionId: string
  cwd?: string
  nodes: readonly unknown[]
  limits: HistoryLimits
  /** Disk reader used ONLY to persist the *new* blob after a card, never as before. */
  readCurrent(absPath: string): Promise<string | null>
}

export function claimAgentCards(input: ClaimInput): Promise<HistoryRecord[]>

export interface ReviewHunk {
  key: string
  start: number
  end: number
  paintStart: number
  paintEnd: number
  oldBlock: string
  newBlock: string
}
export function hunksFromTexts(oldText: string, newText: string): ReviewHunk[]
export function applyHunkUndo(text: string, hunk: ReviewHunk): string
export function hunkMatches(text: string, hunk: ReviewHunk): boolean

export interface ActionIo {
  store: HistoryStore
  sessionId: string
  writeFile(path: string, content: string): Promise<void>
  unlink(path: string): Promise<void>
  readFile(path: string): Promise<string | null>
  limits: HistoryLimits
}

export function acceptFile(io: ActionIo, recordId: string): Promise<HistoryIndex>
export function rejectFile(io: ActionIo, recordId: string): Promise<HistoryIndex>
export function acceptHunk(io: ActionIo, recordId: string, hunkKey: string): Promise<HistoryIndex>
export function rejectHunk(io: ActionIo, recordId: string, hunk: ReviewHunk): Promise<HistoryIndex>
export function restoreSnapshot(io: ActionIo, recordId: string): Promise<HistoryIndex>
```

Port `reviewLocations` / `oldTextOf` / path compare from `DSH-better-sidebar/src/client/review/review-model.ts` **without importing that package**. Port `hunksFromTexts` + `applyHunkUndo` from `review-hunks.ts` the same way (copy the functions; do not import `DiffView.tsx`).

`claimAgentCards`:

1. `collectSessionEdits(nodes, cwd)` → hits with absolute paths.
2. Load index. A card is **unclaimed** when no `source: 'agent'` record exists with same `sessionId` (or `agentSessionId`), same absolute `path`, and same `turn` (treat both missing turn as equal).
3. For each unclaimed hit: `beforeHash` = hash of `oldText` if string (putBlob) / `null` if `oldText === null` (add) / else latest existing record hash for that path / else `null` (add).
4. `hash` = `putBlob(current)` when `readCurrent` returns text; `hash = null` and `kind = 'delete'` when current is missing.
5. Append `source: 'agent'`, `decision: 'pending'`.

`rejectFile`: if `beforeHash` set, `writeFile(path, await readBlob(beforeHash))`; else `unlink(path)`. Set `decision: 'rejected'`.

`acceptFile`: set `decision: 'accepted'` only.

`rejectHunk`: `current = readFile(path)`; if `!hunkMatches(current, hunk)` throw `hunk-mismatch`; `next = applyHunkUndo(current, hunk)`; write; `putBlob(next)` as a new `source: 'save'` record; set `record.hunks[hunk.key] = 'rejected'`; if every hunk from `hunksFromTexts(before, next)` is decided, set file `decision` accordingly (`rejected` if any hunk rejected, else `accepted`).

`hunkMatches`: the slice `splitLines(text)[hunk.start-1 .. hunk.end)` equals `splitLines(hunk.newBlock)` when `newBlock !== ''`; if both blocks empty, treat as whole-file add (must match full text length span).

`restoreSnapshot`: write `record.hash` blob (or unlink if hash null); append a new `save` of the **previous** disk content first (so restore does not lose current).

- [ ] **Step 1: Write failing tests**

`tests/agent-cards.spec.ts`: a `tool-result` node with `resultView: { card: 'diff', diffs: [{ path: 'a.ts', oldText: 'old' }] }` yields an edit hit; `oldText: null` yields add; failed `isError: true` is ignored.

`tests/hunks.spec.ts`:

```ts
it('undoes one inserted island', () => {
  const oldT = 'a\nb\nc\n'
  const newT = 'a\nX\nb\nc\n'
  const hunks = hunksFromTexts(oldT, newT)
  expect(hunks.length).toBe(1)
  expect(applyHunkUndo(newT, hunks[0]!)).toBe(oldT)
})

it('reports mismatch when the file drifted', () => {
  const hunks = hunksFromTexts('a\n', 'a\nB\n')
  expect(hunkMatches('a\nC\n', hunks[0]!)).toBe(false)
})
```

`tests/actions.spec.ts`: temp dir; append an agent pending record with `beforeHash` of `'old\n'` and disk `'new\n'`; `rejectFile` restores `'old\n'` and decision `rejected`; `acceptFile` leaves disk; `rejectHunk` on a one-island file writes undone text and adds a `save` record; drifted text throws.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement the four modules**

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/agent src/history/hunks.ts src/history/actions.ts tests
git commit -m "feat: claim agent cards and accept or reject files and hunks"
```

---

### Task 4: Host watch, settings, Typert remote

**Files:**
- Create: `src/watch/ignore.ts` (re-export `shouldSkipDir` if not already in defaults), `src/watch/watcher.ts`, `src/settings.ts`, `src/contract.ts`, `src/typert.ts`, `src/runtime.ts`
- Modify: `src/index.ts` — real `apply`
- Test: `tests/watcher.spec.ts`, `tests/runtime.spec.ts`, `tests/contract.spec.ts`

**Interfaces:**
- Consumes: store, claim, actions
- Produces wire namespace `localHistory` with methods:

```ts
// contract.ts — keep codecs in sync with these shapes
listReview(sessionId: string, cwd?: string): Promise<{ records: HistoryRecord[]; pending: number }>
listTimeline(sessionId: string, cwd: string | undefined, path: string): Promise<{ records: HistoryRecord[] }>
readBlob(sessionId: string, cwd: string | undefined, hash: string): Promise<{ content: string }>
readCurrent(sessionId: string, cwd: string | undefined, path: string): Promise<{ content: string | null; binary: boolean }>
acceptFile(sessionId: string, cwd: string | undefined, recordId: string): Promise<{ records: HistoryRecord[] }>
rejectFile(...)
acceptHunk(sessionId, cwd, recordId, hunkKey)
rejectHunk(sessionId, cwd, recordId, hunk: ReviewHunk)
restore(sessionId, cwd, recordId)
getSettings(): LocalHistorySettings
updateSettings(update: LocalHistorySettingsUpdate): Promise<LocalHistorySettings>
syncSession(sessionId: string, cwd: string | undefined, nodes: unknown[]): Promise<{ pending: number }>
```

`LocalHistorySettings`: `{ watchEnabled: boolean; maxPerFile: number; maxBytesMb: number; retentionDays: number }`

Settings namespace key: `local-history`. Host `src/settings.ts` registers via `ctx.settings.register` like `dsh-at-file/src/settings.ts`. Client reads/writes **only** through `getSettings` / `updateSettings` (do not assume `WEB_SETTINGS_NAMESPACES` includes this plugin).

`LocalHistoryRuntime` constructs `HistoryStore` from `sessionDir(defaultSessionsRoot(), cwd, sessionId)`.

`listTimeline`: scan `join(sessionsRoot, projectKey(cwd))` for sibling session directories that still exist, load each `local-history/index.json`, keep records whose `path` equals the requested path (normalize `\\` → `/`), sort by `mtime` desc.

`syncSession`: `claimAgentCards` with live `nodes` from the client (client sends a compact card list if nodes are huge — v1 may send the already-collected `AgentCardHit[]` instead of raw nodes to keep the payload small). Prefer this v1 shape:

```ts
syncSession(sessionId, cwd, hits: AgentCardHit[]): Promise<{ pending: number }>
```

and collect hits **on the client** with the same `collectSessionEdits` (move `cards.ts` to `src/agent/cards.ts` imported by both host tagger and client; it must stay Node-free / browser-safe — no `node:fs`).

`startWatcher(cwd, onWrite: (absPath: string) => void)`: `fs.watch` recursive when available; on event, if any path segment `shouldSkipDir`, ignore; debounce 100ms per path; then:

- if an unclaimed agent hit exists for that path → `claimAgentCards` for that path only
- else `putBlob(current)` + append `source: 'save'` (skip if content hash equals the latest record hash for that path — no duplicate consecutive snapshots)

If `watchEnabled` is false, do not start watchers.

`apply(ctx)`:

```ts
export function apply(ctx: Context): void {
  const settings = registerLocalHistorySettings(ctx)
  const runtime = new LocalHistoryRuntime(ctx, settings)
  ctx.typert.register(TYPERT_MANIFEST)
  ctx.effect(() => ctx.service('localHistory', runtime), 'dsh-local-history: runtime')
}
```

Follow `dsh-at-file` exactly for `@Remote` vs **strict manifest** (`src/typert.ts` + `LOCAL_HISTORY_INVOCATIONS` in `contract.ts`). Do not rely on decorator marker tables.

Watcher tests: write a file in a temp cwd after `startWatcher`, assert a `save` record appears; writing under `node_modules/` does not.

Runtime tests: two sibling session dirs, same path, `listTimeline` returns both; deleting one dir removes those rows on the next list.

- [ ] **Step 1: Write failing contract / watcher / runtime tests**

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement settings, contract, typert, runtime, watcher, wire `apply`**

- [ ] **Step 4: `pnpm test` PASS**

- [ ] **Step 5: Commit**

```bash
git add src/watch src/settings.ts src/contract.ts src/typert.ts src/runtime.ts src/index.ts tests
git commit -m "feat: watch workspace writes and expose localHistory remote"
```

---

### Task 5: Client review tab (list, Diff, Timeline)

**Files:**
- Create: `src/client/remote.ts`, `src/client/locales.ts`, `src/client/styles.ts`, `src/client/ReviewView.tsx`, `src/client/DiffView.tsx`, `src/client/TimelineView.tsx`
- Modify: `src/client/index.ts`
- Test: `tests/client-apply.spec.tsx`, `tests/review-view.spec.tsx`, `tests/diff-view.spec.tsx`

**Interfaces:**
- Consumes: `localHistory` remote via `ctx.reflect.get('remote.localHistory')` (same warning as at-file: do **not** read `ctx.remote.localHistory`)
- Produces: registered tab when `ctx.betterSidebar` exists

```ts
export const inject = ['remote', 'slots', 'locale', 'sessions']
// betterSidebar is NOT in inject — it is optional. Probe:
// const sidebar = (ctx as { betterSidebar?: BetterSidebarService }).betterSidebar
```

`apply`:

1. `adoptStyles()`
2. `ctx.locale.register('localHistory', { zh, en })`
3. `ctx.remote.$mount(LOCAL_HISTORY_REMOTE)`
4. If `ctx.betterSidebar` is undefined, return.
5. `ctx.effect(() => ctx.betterSidebar.registerTab({...}))`

Tab descriptor:

- `id: 'dsh-local-history:review'`
- `title: () => t('reviewTitle')` → 中文「改动审查」/ English `Change review`
- `order: 26` (after built-in review at 25)
- `single: true`
- `badge`: pending count from last `listReview` snapshot (keep a tiny module-level store updated by ReviewView / a 2s poll while visible). Swallow errors → no badge.
- `settings.pluginToggles`:
  - `watchEnabled` switch
  - `maxPerFile` number 1–200
  - `maxBytesMb` number 16–2048
  - `retentionDays` number 1–365
- `component`: `<ReviewApp scope={scope} />`

**ReviewApp layout**

- Left (default): filters 待处理 / 全部 / 已处理. Groups by `turn`. Row: basename, parent dir, A/M/D, relative time, status. Click row → select record, show Diff pane.
- Diff pane: `readBlob(beforeHash)` + Task 4 `readCurrent` (do not add another disk-read API). Render unified line list from `hunksFromTexts(before ?? '', current ?? '')`. Each hunk: hover bar with 接受 / 拒绝 calling `acceptHunk` / `rejectHunk`. Header buttons: 接受文件 / 拒绝文件. Binary: message + file-level buttons only. Hunk mismatch: disable that hunk, show `t('hunkDrifted')`.
- Toggle 「时间线」: `<TimelineView path={record.path} />` lists `listTimeline` rows with badges `AI` / `保存` and session id; click compares that blob to current; 「恢复」 calls `restore`.

On mount / session change: collect cards from `ctx.sessions` the same way sidebar review does (current session + `treeSessionIds` if those helpers are not importable — **reimplement a minimal tree walk on `ctx.sessions.list` snapshot**, do not value-import sidebar). Call `syncSession` with hits, then `listReview`.

Empty cwd: `t('noSession')`. Remote errors: inline `t('loadFailed')`, do not throw out of render.

**client-apply tests (jsdom):**

```ts
it('does not throw without betterSidebar', () => {
  expect(() => apply(fakeCtx({}))).not.toThrow()
})

it('registers dsh-local-history:review when sidebar exists', () => {
  const ids: string[] = []
  apply(fakeCtx({
    betterSidebar: { registerTab: (d) => { ids.push(d.id); return () => {} } },
  }))
  expect(ids).toEqual(['dsh-local-history:review'])
})
```

**review-view / diff-view:** render with a fake remote; click 拒绝文件 calls `rejectFile` with the record id; drifted hunk button is disabled.

- [ ] **Step 1: Write failing client tests**

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement client modules + styles (token-only colors: `var(--dsw-alias-*)`, no hardcoded hex except as fallback if a token is missing — prefer tokens only)**

- [ ] **Step 4: `pnpm run check` PASS** (typecheck, tests, build). Commit `lib/`.

- [ ] **Step 5: Commit**

```bash
git add src/client tests lib README.md README.zh.md
git commit -m "feat: register review tab with list, hunk diff, and timeline"
```

**Manual verify (executor, after check is green):**

1. Link the package into `~/.dsh/profiles/web` (`dsh plugin --profile web add file:<path>` or `link:`).
2. Hard-refresh the GUI. `+` menu shows **two** review entries: built-in `review` and `dsh-local-history:review`.
3. Save a file in the sidebar editor → Timeline for that path gains a `保存` snapshot.
4. Let the agent write a file → list shows it as pending; reject restores before; accept only flips state.
5. Delete the session folder on disk → that session’s rows disappear from Timeline.

---

## Self-review

| Spec section | Task |
|---|---|
| Save + AI write snapshots, agent vs save | 3 + 4 |
| beforeHash never from post-watch disk | 3 claim + 4 watcher |
| Review list this session + subagents | 5 (+ sync hits include child sessions) |
| File + hunk accept/reject | 3 + 5 |
| Own Diff, no TextEditor paint | 5 |
| Timeline same project, remaining sessions | 4 `listTimeline` + 5 UI |
| Delete session dir clears history | 4 scan + store on disk |
| Settings clamps + pending-safe gc | 1 clamps + 2 gc + 5 toggles |
| Optional sidebar, tab id not `review` | 5 |
| No sidebar source edits, no search plugin | global constraint |

No TBD. Names (`HistoryStore`, `claimAgentCards`, `localHistory`, `dsh-local-history:review`) are consistent across tasks.

`readCurrent` is part of Task 4’s contract; Task 5 must not add a second disk-read path.
