// src/runtime.ts
import { readFile as readFile2, readdir, unlink, writeFile as writeFile2 } from "node:fs/promises";
import { join as join4 } from "node:path";

// src/agent/tag.ts
import { randomUUID } from "node:crypto";

// src/history/hunks.ts
function splitLines(text) {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
function joinLines(lines, trailingNl) {
  if (lines.length === 0) return trailingNl ? "\n" : "";
  return trailingNl ? `${lines.join("\n")}
` : lines.join("\n");
}
function reconstructBefore(after, diffs) {
  if (diffs.length === 0) return null;
  let text = after;
  for (const diff of [...diffs].reverse()) {
    const next = applySnippetUndo(text, diff);
    if (next === null) return null;
    text = next;
  }
  return text;
}
function applySnippetUndo(after, diff) {
  const inserted = diff.newText;
  if (inserted === "") return null;
  const first = after.indexOf(inserted);
  if (first === -1) return null;
  if (after.indexOf(inserted, first + 1) !== -1) return null;
  return `${after.slice(0, first)}${diff.oldText ?? ""}${after.slice(first + inserted.length)}`;
}
function hunksFromTexts(oldText, newText) {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  if (oldLines.length > 6e3 || newLines.length > 6e3) return [];
  const out = [];
  let i = 0;
  let j = 0;
  const window = 80;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i += 1;
      j += 1;
      continue;
    }
    const oldStart = i;
    const newStart = j;
    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) break;
      let synced = false;
      const iMax = Math.min(oldLines.length, i + window);
      const jMax = Math.min(newLines.length, j + window);
      if (j < newLines.length) {
        for (let look = i + 1; look < iMax; look += 1) {
          if (oldLines[look] === newLines[j]) {
            i = look;
            synced = true;
            break;
          }
        }
      }
      if (!synced && i < oldLines.length) {
        for (let look = j + 1; look < jMax; look += 1) {
          if (newLines[look] === oldLines[i]) {
            j = look;
            synced = true;
            break;
          }
        }
      }
      if (synced) break;
      if (i < oldLines.length) i += 1;
      if (j < newLines.length) j += 1;
    }
    const oldBlock = oldLines.slice(oldStart, i);
    const newBlock = newLines.slice(newStart, j);
    if (oldBlock.length === 0 && newBlock.length === 0) continue;
    const start = newBlock.length === 0 ? Math.max(1, newStart) : newStart + 1;
    const end = newBlock.length === 0 ? start : newStart + newBlock.length;
    out.push({
      key: `${start}:${end}:${oldStart}:${oldBlock.length}:${newBlock.length}`,
      start,
      end,
      paintStart: start,
      paintEnd: end,
      oldBlock: oldBlock.join("\n"),
      newBlock: newBlock.join("\n")
    });
  }
  return out;
}
function applyHunkUndo(text, hunk) {
  const trailing = text.endsWith("\n");
  const lines = splitLines(text);
  const newLines = hunk.newBlock === "" && hunk.oldBlock === "" ? lines.slice(hunk.start - 1, hunk.end) : splitLines(hunk.newBlock);
  const oldLines = splitLines(hunk.oldBlock);
  if (newLines.length === 0 && oldLines.length === 0) return "";
  const from = Math.max(0, hunk.start - 1);
  const count = newLines.length === 0 ? 0 : Math.min(newLines.length, Math.max(0, lines.length - from));
  const next = [...lines];
  next.splice(from, count, ...oldLines);
  return joinLines(next, trailing && next.length > 0);
}
function hunkMatches(text, hunk) {
  const lines = splitLines(text);
  if (hunk.newBlock === "" && hunk.oldBlock === "") {
    const span = Math.max(1, lines.length);
    return hunk.start === 1 && hunk.end === span;
  }
  if (hunk.newBlock !== "") {
    const expected = splitLines(hunk.newBlock);
    const slice = lines.slice(hunk.start - 1, hunk.end);
    if (slice.length !== expected.length) return false;
    return slice.every((line, index) => line === expected[index]);
  }
  const from = Math.max(0, hunk.start - 1);
  return from <= lines.length;
}

// src/agent/cards.ts
function sameCardPath(a, b) {
  return a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
}
function resolveProjectPath(cwd, path) {
  const absolute = path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
  if (absolute) return path;
  const base = cwd ?? "";
  if (base === "") return path;
  const separator = base.includes("\\") ? "\\" : "/";
  return `${base.replace(/[\\/]+$/, "")}${separator}${path}`;
}
function addedPaths(view) {
  const added = /* @__PURE__ */ new Set();
  if (view === null || typeof view !== "object") return added;
  const diffs = view.diffs;
  if (!Array.isArray(diffs)) return added;
  for (const diff of diffs) {
    if (diff === null || typeof diff !== "object") continue;
    const record = diff;
    if (typeof record.path === "string" && record.oldText === null) added.add(record.path);
  }
  return added;
}
function reviewLocations(view) {
  if (view === null || typeof view !== "object") return [];
  const record = view;
  const deleted = record.card === "generic" && record.kind === "delete";
  const edited = record.card === "diff" || record.card === "generic" && (record.kind === "edit" || record.kind === "write" || record.kind === "create");
  if (!deleted && !edited) return [];
  const created = addedPaths(view);
  const out = [];
  const push = (path, kind) => {
    out.push({ path, kind });
  };
  if (Array.isArray(record.locations)) {
    for (const location of record.locations) {
      if (location !== null && typeof location === "object" && typeof location.path === "string") {
        const path = location.path;
        const added = [...created].some((item) => sameCardPath(item, path));
        push(path, deleted ? "delete" : added ? "add" : "edit");
      }
    }
  }
  if (out.length === 0 && Array.isArray(record.diffs)) {
    for (const diff of record.diffs) {
      if (diff !== null && typeof diff === "object" && typeof diff.path === "string") {
        const path = diff.path;
        const added = [...created].some((item) => sameCardPath(item, path));
        push(path, added ? "add" : "edit");
      }
    }
  }
  return out;
}
function reviewViewsOf(node) {
  if (node === null || typeof node !== "object") return [];
  const record = node;
  return [record.callView, record.resultView].filter((view) => view !== null && view !== void 0);
}
function parseToolArgs(raw) {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || raw === "") return void 0;
  try {
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    return void 0;
  }
  return void 0;
}
function sessionEventOf(node) {
  if (node === null || typeof node !== "object") return void 0;
  const wrapper = node;
  if (wrapper.type === "event" && wrapper.event !== null && typeof wrapper.event === "object") {
    return wrapper.event;
  }
  if (typeof wrapper.type === "string" && "data" in wrapper) return node;
  return void 0;
}
function resultIsError(data) {
  if (data === null || typeof data !== "object") return false;
  const content = data.message?.content;
  if (!Array.isArray(content) || content[0] === null || typeof content[0] !== "object") return false;
  return content[0].isError === true;
}
function resultCallId(data) {
  if (data === null || typeof data !== "object") return void 0;
  const id = data.message?.source?.callId;
  return typeof id === "string" && id !== "" ? id : void 0;
}
function hitFromMutationTool(name2, argsRaw, cwd, turn) {
  if (name2 !== "edit" && name2 !== "write") return void 0;
  const args = parseToolArgs(argsRaw);
  if (args === void 0) return void 0;
  const filePath = args.file_path;
  if (typeof filePath !== "string" || filePath === "") return void 0;
  const path = resolveProjectPath(cwd, filePath);
  if (name2 === "write") return { path, kind: "add", turn };
  const oldString = args.old_string;
  const newString = args.new_string;
  if (typeof oldString !== "string" || typeof newString !== "string") return void 0;
  return {
    path,
    kind: "edit",
    oldText: oldString,
    turn,
    diffs: [{ oldText: oldString, newText: newString }]
  };
}
function diffsOf(view, path) {
  if (view === null || typeof view !== "object") return [];
  const diffs = view.diffs;
  if (!Array.isArray(diffs)) return [];
  const out = [];
  for (const diff of diffs) {
    if (diff === null || typeof diff !== "object") continue;
    const record = diff;
    if (typeof record.path !== "string" || !sameCardPath(record.path, path)) continue;
    if (typeof record.newText !== "string") continue;
    const hunk = { newText: record.newText };
    if (record.oldText === null) hunk.oldText = null;
    else if (typeof record.oldText === "string") hunk.oldText = record.oldText;
    out.push(hunk);
  }
  return out;
}
function oldTextOf(view, path) {
  if (view === null || typeof view !== "object") return void 0;
  const diffs = view.diffs;
  if (!Array.isArray(diffs)) return void 0;
  for (const diff of diffs) {
    if (diff === null || typeof diff !== "object") continue;
    const record = diff;
    if (typeof record.path !== "string" || !sameCardPath(record.path, path)) continue;
    if (record.oldText === null) return null;
    if (typeof record.oldText === "string") return record.oldText;
  }
  return void 0;
}
function upsertHit(byKey, order, hit) {
  const key = `${hit.turn ?? "x"}
${hit.path}`;
  const existing = byKey.get(key);
  if (existing === void 0) {
    order.push(key);
    byKey.set(key, hit);
    return;
  }
  existing.kind = hit.kind;
  if (existing.oldText === void 0 && hit.oldText !== void 0) existing.oldText = hit.oldText;
  if (existing.oldText === null) existing.kind = "add";
  if (hit.diffs !== void 0 && hit.diffs.length > 0) existing.diffs = hit.diffs;
}
function collectSessionEdits(nodes, cwd) {
  const byKey = /* @__PURE__ */ new Map();
  const order = [];
  const pendingCalls = /* @__PURE__ */ new Map();
  let turn;
  for (const node of nodes) {
    if (node === null || typeof node !== "object") continue;
    const event = sessionEventOf(node);
    if (event !== void 0) {
      const data = event.data;
      if (event.type === "tool/call" && data !== null && typeof data === "object") {
        const record2 = data;
        if (typeof record2.turn === "number") turn = record2.turn;
        if (typeof record2.callId === "string" && record2.callId !== "") {
          pendingCalls.set(record2.callId, { name: record2.name, argsRaw: record2.arguments, turn });
        }
        continue;
      }
      if (event.type === "tool/result" && data !== null && typeof data === "object") {
        const record2 = data;
        if (typeof record2.turn === "number") turn = record2.turn;
        const callId = resultCallId(data);
        const pending = callId === void 0 ? void 0 : pendingCalls.get(callId);
        if (pending !== void 0 && !resultIsError(data)) {
          const hit2 = hitFromMutationTool(pending.name, pending.argsRaw, cwd, pending.turn ?? turn);
          if (hit2 !== void 0) upsertHit(byKey, order, hit2);
        }
        continue;
      }
    }
    const record = node;
    if (record.kind === "user" || record.kind === "steering") continue;
    if (typeof record.turn === "number") turn = record.turn;
    if (record.kind !== "tool-result" || record.isError === true) continue;
    let foundView = false;
    for (const view of reviewViewsOf(node)) {
      for (const location of reviewLocations(view)) {
        foundView = true;
        const path = resolveProjectPath(cwd, location.path);
        const oldText = oldTextOf(view, location.path);
        const hunks = diffsOf(view, location.path);
        const hit2 = { path, kind: location.kind, turn, oldText };
        if (hunks.length > 0) hit2.diffs = hunks;
        upsertHit(byKey, order, hit2);
      }
    }
    if (foundView) continue;
    const hit = hitFromMutationTool(record.call?.name, record.call?.argsRaw, cwd, turn);
    if (hit !== void 0) upsertHit(byKey, order, hit);
  }
  return order.map((key) => byKey.get(key)).filter((row) => row !== void 0);
}

// src/agent/tag.ts
function sameTurn(a, b) {
  return a === b;
}
function claimedBy(record, sessionId, path, turn) {
  if (record.source !== "agent") return false;
  if (!sameCardPath(record.path, path)) return false;
  const sessionMatch = record.sessionId === sessionId || record.agentSessionId === sessionId;
  if (!sessionMatch) return false;
  return sameTurn(record.turn, turn);
}
function latestHashForPath(records, path) {
  let latest;
  for (const record of records) {
    if (!sameCardPath(record.path, path)) continue;
    if (latest === void 0 || record.mtime > latest.mtime || record.mtime === latest.mtime && record.id > latest.id) {
      latest = record;
    }
  }
  return latest?.hash ?? null;
}
async function beforeHashOf(store, records, hit, current) {
  let kind = hit.kind;
  if (typeof current === "string" && hit.diffs !== void 0 && hit.diffs.length > 0) {
    const reconstructed = reconstructBefore(current, hit.diffs);
    if (reconstructed !== null) {
      const blob = await store.putBlob(reconstructed);
      if (kind === "add" && reconstructed !== "") kind = "edit";
      return { beforeHash: blob.hash, kind };
    }
  }
  const previous = latestHashForPath(records, hit.path);
  if (typeof hit.oldText === "string") {
    if (looksLikeHunkSnippet(hit.oldText, current) && previous !== null && await store.hasBlob(previous)) {
      return { beforeHash: previous, kind: kind === "add" ? "edit" : kind };
    }
    const blob = await store.putBlob(hit.oldText);
    return { beforeHash: blob.hash, kind };
  }
  if (hit.oldText === null) {
    return { beforeHash: null, kind: "add" };
  }
  if (previous === null) kind = "add";
  else if (kind !== "delete") kind = "edit";
  if (previous !== null && !await store.hasBlob(previous)) {
    return { beforeHash: null, kind: kind === "add" ? "add" : "edit" };
  }
  return { beforeHash: previous, kind };
}
function looksLikeHunkSnippet(oldText, current) {
  if (current === null || current === "") return false;
  const oldLines = oldText === "" ? [] : oldText.split("\n");
  const newLines = current === "" ? [] : current.split("\n");
  return oldLines.length * 2 < newLines.length;
}
async function repairSnippetBefore(input, hit, record) {
  if (record.beforeHash === null) return;
  if (hit.diffs === void 0 || hit.diffs.length === 0) return;
  const current = await input.readCurrent(hit.path);
  if (typeof current.content !== "string") return;
  let stored;
  try {
    stored = await input.store.readBlob(record.beforeHash);
  } catch {
    const index2 = await input.store.load();
    const target2 = index2.records.find((item) => item.id === record.id);
    if (target2 !== void 0) {
      let changed = false;
      if (target2.beforeHash !== null) {
        target2.beforeHash = null;
        changed = true;
      }
      if (target2.hash !== null && !await input.store.hasBlob(target2.hash)) {
        target2.hash = null;
        target2.bytes = 0;
        changed = true;
      }
      if (changed) await input.store.save(index2);
    }
    return;
  }
  const reconstructed = reconstructBefore(current.content, hit.diffs);
  if (reconstructed === null || reconstructed === stored) return;
  const blob = await input.store.putBlob(reconstructed);
  if (blob.hash === record.beforeHash) return;
  record.beforeHash = blob.hash;
  if (record.kind === "add" && reconstructed !== "") record.kind = "edit";
  const index = await input.store.load();
  const target = index.records.find((item) => item.id === record.id);
  if (target === void 0) return;
  target.beforeHash = blob.hash;
  if (target.kind === "add" && reconstructed !== "") target.kind = "edit";
  await input.store.save(index);
}
async function claimAgentCards(input) {
  const hits = input.hits ?? collectSessionEdits(input.nodes ?? [], input.cwd);
  const claimed = [];
  for (const hit of hits) {
    try {
      const saved = await input.store.withLock(async () => {
        const index = await input.store.load();
        const already = index.records.find((record2) => claimedBy(record2, input.sessionId, hit.path, hit.turn));
        if (already !== void 0) {
          await repairSnippetBefore(input, hit, already);
          return void 0;
        }
        const current = await input.readCurrent(hit.path);
        const { beforeHash, kind: fromBefore } = await beforeHashOf(input.store, index.records, hit, current.content);
        let kind = fromBefore;
        let hash;
        let bytes;
        if (current.binary) {
          hash = null;
          bytes = 0;
          if (kind === "delete") kind = beforeHash === null ? "add" : "edit";
        } else if (current.content === null) {
          kind = "delete";
          hash = null;
          bytes = 0;
        } else {
          const blob = await input.store.putBlob(current.content);
          hash = blob.hash;
          bytes = blob.bytes;
          if (beforeHash === null) kind = "add";
        }
        const record = {
          id: randomUUID(),
          path: hit.path,
          hash,
          beforeHash,
          bytes,
          mtime: Date.now(),
          source: "agent",
          kind,
          sessionId: input.sessionId,
          decision: "pending"
        };
        if (hit.turn !== void 0) record.turn = hit.turn;
        const next = await input.store.append(record, input.limits, Date.now());
        await acceptEarlierPending(input.store, hit.path, record.id);
        return next.records.find((item) => item.id === record.id);
      });
      if (saved !== void 0) claimed.push(saved);
    } catch {
    }
  }
  return claimed;
}
async function acceptEarlierPending(store, path, keepId) {
  const index = await store.load();
  let changed = false;
  for (const record of index.records) {
    if (record.id === keepId) continue;
    if (record.source !== "agent") continue;
    if (!sameCardPath(record.path, path)) continue;
    if ((record.decision ?? "pending") !== "pending") continue;
    record.decision = "accepted";
    changed = true;
  }
  if (changed) await store.save(index);
}

// src/history/actions.ts
import { randomUUID as randomUUID2 } from "node:crypto";
function requireRecord(index, recordId) {
  const record = index.records.find((item) => item.id === recordId);
  if (record === void 0) throw new Error(`record-not-found: ${recordId}`);
  return record;
}
async function persist(io, index) {
  const next = io.store.gc(index, io.limits, Date.now());
  await io.store.save(next);
  return next;
}
function decideFileFromHunks(record, before, after) {
  const original = hunksFromTexts(before, after);
  const decided = record.hunks ?? {};
  if (original.length === 0) {
    if (Object.keys(decided).length === 0) return;
  } else if (!original.every((hunk) => decided[hunk.key] !== void 0)) {
    return;
  }
  record.decision = Object.values(decided).some((value) => value === "rejected") ? "rejected" : "accepted";
}
async function beforeTextOf(io, record) {
  if (record.beforeHash === null) return "";
  try {
    return await io.store.readBlob(record.beforeHash);
  } catch {
    return "";
  }
}
async function acceptFile(io, recordId) {
  return io.store.withLock(async () => {
    const index = await io.store.load();
    const record = requireRecord(index, recordId);
    record.decision = "accepted";
    return persist(io, index);
  });
}
async function rejectFile(io, recordId) {
  return io.store.withLock(async () => {
    const index = await io.store.load();
    const record = requireRecord(index, recordId);
    let restore = null;
    if (record.beforeHash !== null) {
      try {
        restore = await io.store.readBlob(record.beforeHash);
      } catch {
        restore = null;
      }
    }
    record.decision = "rejected";
    const next = await persist(io, index);
    if (restore !== null) await io.writeFile(record.path, restore);
    else if (record.kind === "add" && record.hash !== null) await io.unlink(record.path);
    return next;
  });
}
async function acceptHunk(io, recordId, hunkKey) {
  return io.store.withLock(async () => {
    const index = await io.store.load();
    const record = requireRecord(index, recordId);
    record.hunks = { ...record.hunks, [hunkKey]: "accepted" };
    const before = await beforeTextOf(io, record);
    const after = record.hash === null ? "" : await io.store.readBlob(record.hash).catch(() => "");
    decideFileFromHunks(record, before, after);
    return persist(io, index);
  });
}
async function rejectHunk(io, recordId, hunk) {
  return io.store.withLock(async () => {
    const index = await io.store.load();
    const record = requireRecord(index, recordId);
    const current = await io.readFile(record.path);
    if (current === null || !hunkMatches(current, hunk)) throw new Error("hunk-mismatch");
    const nextText = applyHunkUndo(current, hunk);
    const blob = await io.store.putBlob(nextText);
    const save = {
      id: randomUUID2(),
      path: record.path,
      hash: blob.hash,
      beforeHash: record.hash,
      bytes: blob.bytes,
      mtime: Date.now(),
      source: "save",
      kind: "edit",
      sessionId: io.sessionId
    };
    index.records.push(save);
    record.hunks = { ...record.hunks, [hunk.key]: "rejected" };
    const before = await beforeTextOf(io, record);
    const after = record.hash === null ? "" : await io.store.readBlob(record.hash).catch(() => "");
    decideFileFromHunks(record, before, after);
    const next = await persist(io, index);
    await io.writeFile(record.path, nextText);
    return next;
  });
}
async function reopenRecord(io, recordId, payload) {
  return io.store.withLock(async () => {
    const index = await io.store.load();
    const record = requireRecord(index, recordId);
    if (payload.hunkKey !== void 0) {
      const nextHunks = { ...record.hunks };
      delete nextHunks[payload.hunkKey];
      record.hunks = Object.keys(nextHunks).length === 0 ? void 0 : nextHunks;
    }
    record.decision = "pending";
    const next = await persist(io, index);
    if (typeof payload.content === "string") await io.writeFile(record.path, payload.content);
    return next;
  });
}
async function restoreSnapshot(io, recordId) {
  return io.store.withLock(async () => {
    const index = await io.store.load();
    const record = requireRecord(index, recordId);
    const previous = await io.readFile(record.path);
    if (previous !== null) {
      const blob = await io.store.putBlob(previous);
      index.records.push({
        id: randomUUID2(),
        path: record.path,
        hash: blob.hash,
        beforeHash: record.hash,
        bytes: blob.bytes,
        mtime: Date.now(),
        source: "save",
        kind: "edit",
        sessionId: io.sessionId
      });
    } else {
      index.records.push({
        id: randomUUID2(),
        path: record.path,
        hash: null,
        beforeHash: record.hash,
        bytes: 0,
        mtime: Date.now(),
        source: "save",
        kind: "delete",
        sessionId: io.sessionId
      });
    }
    const next = await persist(io, index);
    if (record.hash === null) await io.unlink(record.path);
    else await io.writeFile(record.path, await io.store.readBlob(record.hash));
    return next;
  });
}

// src/history/store.ts
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join as join2 } from "node:path";

// src/history/document.ts
import { join } from "node:path";
var SOURCES = /* @__PURE__ */ new Set(["agent", "save"]);
var KINDS = /* @__PURE__ */ new Set(["add", "edit", "delete"]);
var DECISIONS = /* @__PURE__ */ new Set(["pending", "accepted", "rejected"]);
var HUNK_DECISIONS = /* @__PURE__ */ new Set(["accepted", "rejected"]);
function emptyIndex() {
  return { version: 1, records: [] };
}
function blobPath(historyRoot, hash) {
  return join(historyRoot, "blobs", hash);
}
function parseIndex(raw) {
  if (!isPlainObject(raw)) return emptyIndex();
  if (raw.version !== 1) return emptyIndex();
  if (!Array.isArray(raw.records)) return emptyIndex();
  const records = [];
  for (const item of raw.records) {
    const record = parseRecord(item);
    if (record === null) return emptyIndex();
    records.push(record);
  }
  return { version: 1, records };
}
function parseRecord(raw) {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.id !== "string") return null;
  if (typeof raw.path !== "string") return null;
  if (!isHash(raw.hash) || !isHash(raw.beforeHash)) return null;
  if (typeof raw.bytes !== "number" || !Number.isFinite(raw.bytes)) return null;
  if (typeof raw.mtime !== "number" || !Number.isFinite(raw.mtime)) return null;
  if (typeof raw.source !== "string" || !SOURCES.has(raw.source)) return null;
  if (typeof raw.kind !== "string" || !KINDS.has(raw.kind)) return null;
  if (typeof raw.sessionId !== "string") return null;
  const record = {
    id: raw.id,
    path: raw.path,
    hash: raw.hash,
    beforeHash: raw.beforeHash,
    bytes: raw.bytes,
    mtime: raw.mtime,
    source: raw.source,
    kind: raw.kind,
    sessionId: raw.sessionId
  };
  if (raw.turn !== void 0) {
    if (typeof raw.turn !== "number" || !Number.isFinite(raw.turn)) return null;
    record.turn = raw.turn;
  }
  if (raw.agentSessionId !== void 0) {
    if (typeof raw.agentSessionId !== "string") return null;
    record.agentSessionId = raw.agentSessionId;
  }
  if (raw.decision !== void 0) {
    if (typeof raw.decision !== "string" || !DECISIONS.has(raw.decision)) return null;
    record.decision = raw.decision;
  }
  if (raw.hunks !== void 0) {
    const hunks = parseHunks(raw.hunks);
    if (hunks === null) return null;
    record.hunks = hunks;
  }
  return record;
}
function parseHunks(raw) {
  if (!isPlainObject(raw)) return null;
  const hunks = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string" || !HUNK_DECISIONS.has(value)) return null;
    hunks[key] = value;
  }
  return hunks;
}
function isHash(value) {
  return value === null || typeof value === "string";
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/history/store.ts
var DAY_MS = 24 * 60 * 60 * 1e3;
var storeLocks = /* @__PURE__ */ new Map();
var storeLockHeld = /* @__PURE__ */ new Set();
function sha256Hex(bytes) {
  const hash = createHash("sha256");
  hash.update(typeof bytes === "string" ? bytes : Buffer.from(bytes));
  return hash.digest("hex");
}
function withStoreLock(historyRoot, fn) {
  if (storeLockHeld.has(historyRoot)) return fn();
  const previous = storeLocks.get(historyRoot) ?? Promise.resolve();
  const run = previous.then(
    () => {
      storeLockHeld.add(historyRoot);
      return fn();
    },
    () => {
      storeLockHeld.add(historyRoot);
      return fn();
    }
  );
  storeLocks.set(historyRoot, run.then(
    () => {
      storeLockHeld.delete(historyRoot);
      return void 0;
    },
    () => {
      storeLockHeld.delete(historyRoot);
      return void 0;
    }
  ));
  return run;
}
var HistoryStore = class {
  constructor(historyRoot) {
    this.historyRoot = historyRoot;
  }
  /** Run `fn` inside this store's serialized critical section (re-entrant). */
  withLock(fn) {
    return withStoreLock(this.historyRoot, fn);
  }
  async load() {
    try {
      const raw = await readFile(join2(this.historyRoot, "index.json"), "utf8");
      return parseIndex(JSON.parse(raw));
    } catch {
      return emptyIndex();
    }
  }
  async hasBlob(hash) {
    try {
      await stat(blobPath(this.historyRoot, hash));
      return true;
    } catch {
      return false;
    }
  }
  async save(index) {
    return withStoreLock(this.historyRoot, () => this.saveUnlocked(index));
  }
  async putBlob(content) {
    return withStoreLock(this.historyRoot, () => this.putBlobUnlocked(content));
  }
  async readBlob(hash) {
    return await readFile(blobPath(this.historyRoot, hash), "utf8");
  }
  async append(record, limits, now) {
    return withStoreLock(this.historyRoot, async () => {
      const index = await this.load();
      index.records.push(record);
      const next = this.gc(index, limits, now);
      await this.saveUnlocked(next);
      return next;
    });
  }
  /** Recycle per spec; returns next index. Never drops pending agent or live hashes. */
  gc(index, limits, now = Date.now()) {
    const drop = /* @__PURE__ */ new Set();
    const cutoff = now - limits.retentionDays * DAY_MS;
    for (const record of index.records) {
      if (record.source === "save" && record.mtime < cutoff) drop.add(record.id);
    }
    const remaining = () => index.records.filter((record) => !drop.has(record.id));
    for (const group of groupedByPath(remaining()).values()) {
      let extra = group.length - limits.maxPerFile;
      if (extra <= 0) continue;
      const oldestFirst = group.slice().sort(byMtimeThenId);
      for (const record of oldestFirst) {
        if (extra <= 0) break;
        if (record.source === "save") {
          drop.add(record.id);
          extra -= 1;
        }
      }
    }
    while (true) {
      const list = remaining();
      const overCount = [...groupedByPath(list).values()].some((group) => group.length > limits.maxPerFile);
      const overBytes = uniqueLiveBytes(list, this.historyRoot) > limits.maxBytes;
      if (!overCount && !overBytes) break;
      const victim = list.filter((record) => record.source === "agent" && (record.decision === "accepted" || record.decision === "rejected")).slice().sort(byMtimeThenId)[0];
      if (victim === void 0) break;
      drop.add(victim.id);
    }
    return { version: 1, records: remaining() };
  }
  async saveUnlocked(index) {
    await mkdir(this.historyRoot, { recursive: true });
    const dest = join2(this.historyRoot, "index.json");
    const previous = await this.load();
    await writeAtomic(dest, `${JSON.stringify(index, null, 2)}
`);
    unlinkDeadBlobs(this.historyRoot, liveHashes(previous.records), liveHashes(index.records));
  }
  async putBlobUnlocked(content) {
    const hash = sha256Hex(content);
    const bytes = Buffer.byteLength(content, "utf8");
    const dest = blobPath(this.historyRoot, hash);
    await mkdir(dirname(dest), { recursive: true });
    try {
      await stat(dest);
      return { hash, bytes };
    } catch {
      await writeAtomic(dest, content);
      return { hash, bytes };
    }
  }
};
function byMtimeThenId(a, b) {
  return a.mtime - b.mtime || a.id.localeCompare(b.id);
}
function groupedByPath(records) {
  const groups = /* @__PURE__ */ new Map();
  for (const record of records) {
    const group = groups.get(record.path);
    if (group) group.push(record);
    else groups.set(record.path, [record]);
  }
  return groups;
}
function liveHashes(records) {
  const hashes = /* @__PURE__ */ new Set();
  for (const record of records) {
    if (record.hash !== null) hashes.add(record.hash);
    if (record.beforeHash !== null) hashes.add(record.beforeHash);
  }
  return hashes;
}
function uniqueLiveBytes(records, historyRoot) {
  const sizes = /* @__PURE__ */ new Map();
  for (const record of records) {
    if (record.hash !== null) sizes.set(record.hash, record.bytes);
  }
  for (const record of records) {
    if (record.beforeHash !== null && !sizes.has(record.beforeHash)) {
      sizes.set(record.beforeHash, blobFileSize(historyRoot, record.beforeHash));
    }
  }
  let sum = 0;
  for (const size of sizes.values()) sum += size;
  return sum;
}
function blobFileSize(historyRoot, hash) {
  try {
    return statSync(blobPath(historyRoot, hash)).size;
  } catch {
    return 0;
  }
}
function unlinkDeadBlobs(historyRoot, previousLive, nextLive) {
  let names;
  try {
    names = readdirSync(join2(historyRoot, "blobs"));
  } catch {
    return;
  }
  for (const name2 of names) {
    if (name2.startsWith(".")) continue;
    if (!previousLive.has(name2)) continue;
    if (nextLive.has(name2)) continue;
    try {
      unlinkSync(join2(historyRoot, "blobs", name2));
    } catch {
    }
  }
}
async function writeAtomic(dest, content) {
  const tmp = `${dest}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, dest);
}

// src/history/backfill.ts
function samePath(a, b) {
  return a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
}
async function newestDifferentPrior(store, records, record) {
  const candidates = records.filter((item) => item.id !== record.id && samePath(item.path, record.path)).filter((item) => item.mtime < record.mtime || item.mtime === record.mtime && item.id < record.id).filter((item) => item.hash !== null && item.hash !== record.hash).sort((a, b) => b.mtime - a.mtime || b.id.localeCompare(a.id));
  for (const candidate of candidates) {
    if (candidate.hash !== null && await store.hasBlob(candidate.hash)) return candidate.hash;
  }
  return null;
}
async function backfillAgentBefore(store) {
  return store.withLock(async () => {
    const index = await store.load();
    const emptyHash = sha256Hex("");
    let repaired = 0;
    for (const record of index.records) {
      if (record.source !== "agent") continue;
      if (record.kind !== "add") continue;
      if (record.beforeHash !== null && record.beforeHash !== emptyHash) continue;
      if (record.hash === null) continue;
      const before = await newestDifferentPrior(store, index.records, record);
      if (before === null) continue;
      record.beforeHash = before;
      record.kind = "edit";
      repaired += 1;
    }
    if (repaired > 0) await store.save(index);
    return repaired;
  });
}

// src/session-path.ts
import { join as join3 } from "node:path";
import { homedir } from "node:os";
function encodeSessionSegment(raw) {
  if (raw.length === 0) throw new Error("cannot encode an empty path segment");
  if (raw === ".") return "~002E";
  if (raw === "..") return "~002E~002E";
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    const ch = String.fromCharCode(code);
    if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) out += ch;
    else out += `~${code.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return out;
}
function normalizeCwd(cwd) {
  if (cwd === void 0) return void 0;
  const trimmed = cwd.replace(/[\\/]+$/, "");
  return trimmed === "" ? void 0 : trimmed;
}
function projectKey(cwd) {
  const trimmed = normalizeCwd(cwd);
  if (trimmed === void 0) throw new Error("cannot encode an empty project path");
  let readable = "";
  let separatorRun = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === "/" || ch === "\\" || ch === ":") {
      if (!separatorRun) readable += "-";
      separatorRun = true;
    } else if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch;
      separatorRun = false;
    } else {
      readable += `~${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
      separatorRun = false;
    }
  }
  return `--${(readable.replace(/^-+/, "") || "root").slice(0, 251)}--`;
}
function defaultSessionsRoot() {
  const fromEnv = process.env.DSH_SESSIONS_ROOT;
  if (fromEnv !== void 0 && fromEnv !== "") return fromEnv;
  return join3(homedir(), ".dsh", "sessions");
}
function sessionDir(root, cwd, sessionId) {
  const normalized = normalizeCwd(cwd);
  const project = normalized === void 0 ? join3(root, "_no-cwd") : join3(root, projectKey(normalized));
  return join3(project, encodeSessionSegment(sessionId));
}
function historyDir(sessionDirPath) {
  return join3(sessionDirPath, "local-history");
}

// src/pending-latest.ts
function newerPending(a, b) {
  const aTurn = a.turn ?? -1;
  const bTurn = b.turn ?? -1;
  if (aTurn !== bTurn) return aTurn > bTurn;
  if (a.mtime !== b.mtime) return a.mtime > b.mtime;
  return a.id > b.id;
}
function latestPendingPerPath(records) {
  const byPath = /* @__PURE__ */ new Map();
  const order = [];
  for (const record of records) {
    if (record.source !== "agent") continue;
    if ((record.decision ?? "pending") !== "pending") continue;
    const existing = [...byPath.values()].find((row) => sameCardPath(row.path, record.path));
    if (existing === void 0) {
      byPath.set(record.id, record);
      order.push(record.id);
      continue;
    }
    if (!newerPending(record, existing)) continue;
    byPath.delete(existing.id);
    byPath.set(record.id, record);
    const index = order.indexOf(existing.id);
    if (index !== -1) order[index] = record.id;
  }
  return order.map((id) => byPath.get(id)).filter((row) => row !== void 0);
}
function pendingCount(records) {
  return latestPendingPerPath(records).length;
}

// src/watch/watcher.ts
import { statSync as statSync2, watch } from "node:fs";
import { randomUUID as randomUUID3 } from "node:crypto";
import { resolve } from "node:path";

// src/defaults.ts
var DEFAULT_IGNORE_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "lib",
  "coverage",
  ".pnpm-store",
  "target",
  "build",
  ".next",
  ".turbo",
  "out"
];
var MAX_PER_FILE = 50;
var MAX_BYTES = 200 * 1024 * 1024;
var RETENTION_DAYS = 30;
var DEFAULT_WATCH_ENABLED = true;
var MIN_PER_FILE = 1;
var MAX_PER_FILE_CAP = 200;
var MIN_BYTES = 16 * 1024 * 1024;
var MAX_BYTES_CAP = 2048 * 1024 * 1024;
var MIN_RETENTION_DAYS = 1;
var MAX_RETENTION_DAYS = 365;
var IGNORE_DIR_SET = new Set(DEFAULT_IGNORE_DIRS);
function shouldSkipDir(name2) {
  return name2.startsWith(".") || IGNORE_DIR_SET.has(name2);
}
function clampMaxPerFile(n) {
  if (!Number.isFinite(n)) return MAX_PER_FILE;
  if (n < MIN_PER_FILE) return MIN_PER_FILE;
  if (n > MAX_PER_FILE_CAP) return MAX_PER_FILE_CAP;
  return n;
}
function clampMaxBytes(n) {
  if (!Number.isFinite(n)) return MAX_BYTES;
  if (n < MIN_BYTES) return MIN_BYTES;
  if (n > MAX_BYTES_CAP) return MAX_BYTES_CAP;
  return n;
}
function clampRetentionDays(n) {
  if (!Number.isFinite(n)) return RETENTION_DAYS;
  if (n < MIN_RETENTION_DAYS) return MIN_RETENTION_DAYS;
  if (n > MAX_RETENTION_DAYS) return MAX_RETENTION_DAYS;
  return n;
}

// src/watch/watcher.ts
var DEBOUNCE_MS = 100;
function pathHasSkippedSegment(absPath, cwd) {
  const rel = cwd !== void 0 && absPath.startsWith(cwd) ? absPath.slice(cwd.length) : absPath;
  return rel.split(/[\\/]/).filter(Boolean).some((segment) => shouldSkipDir(segment));
}
function startWatcher(cwd, onWrite) {
  const timers = /* @__PURE__ */ new Map();
  let closed = false;
  let watcher;
  try {
    watcher = watch(cwd, { recursive: true, persistent: true }, (_event, filename) => {
      if (closed) return;
      if (filename === null || filename === void 0 || filename === "" || filename === ".") return;
      const absPath = resolve(cwd, filename.toString());
      if (absPath === resolve(cwd)) return;
      if (pathHasSkippedSegment(absPath, cwd)) return;
      try {
        if (statSync2(absPath).isDirectory()) return;
      } catch {
      }
      const previous = timers.get(absPath);
      if (previous !== void 0) clearTimeout(previous);
      timers.set(absPath, setTimeout(() => {
        timers.delete(absPath);
        if (closed) return;
        onWrite(absPath);
      }, DEBOUNCE_MS));
    });
    watcher.on("error", () => {
    });
  } catch {
    return { close() {
    } };
  }
  return {
    close() {
      closed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      watcher.close();
    }
  };
}
function latestForPath(records, path) {
  let latest;
  for (const record of records) {
    if (!sameCardPath(record.path, path)) continue;
    if (latest === void 0 || record.mtime > latest.mtime || record.mtime === latest.mtime && record.id > latest.id) {
      latest = record;
    }
  }
  return latest;
}
function kindFrom(previousHash, currentHash, binary) {
  if (binary) return previousHash === null ? "add" : "edit";
  if (previousHash === null && currentHash !== null) return "add";
  if (currentHash === null) return "delete";
  return "edit";
}
var BINARY_MARK = "__binary__";
var writeQueues = /* @__PURE__ */ new Map();
var lastHash = /* @__PURE__ */ new Map();
function lastHashMap(historyRoot) {
  let map = lastHash.get(historyRoot);
  if (map === void 0) {
    map = /* @__PURE__ */ new Map();
    lastHash.set(historyRoot, map);
  }
  return map;
}
function enqueueWrite(historyRoot, path, task) {
  let perPath = writeQueues.get(historyRoot);
  if (perPath === void 0) {
    perPath = /* @__PURE__ */ new Map();
    writeQueues.set(historyRoot, perPath);
  }
  const previous = perPath.get(path) ?? Promise.resolve();
  const next = previous.then(task, task).catch(() => {
  });
  perPath.set(path, next);
  return next;
}
async function snapshotSave(input) {
  const path = resolve(input.absPath);
  const seen = lastHashMap(input.store.historyRoot);
  const current = await input.readCurrent(path);
  const hash = current.binary ? BINARY_MARK : current.content === null ? null : sha256Hex(current.content);
  if (seen.has(path) && seen.get(path) === hash) return;
  await input.store.withLock(async () => {
    const index = await input.store.load();
    const latest = latestForPath(index.records, path);
    const previousHash = latest?.hash ?? null;
    if (!current.binary && previousHash === hash) {
      seen.set(path, hash);
      return;
    }
    if (current.binary) {
      if (latest !== void 0 && latest.hash === null && latest.kind !== "delete") {
        seen.set(path, BINARY_MARK);
        return;
      }
      const record2 = {
        id: randomUUID3(),
        path,
        hash: null,
        beforeHash: previousHash,
        bytes: 0,
        mtime: Date.now(),
        source: "save",
        kind: kindFrom(previousHash, null, true),
        sessionId: input.sessionId
      };
      await input.store.append(record2, input.limits, Date.now());
      seen.set(path, BINARY_MARK);
      return;
    }
    if (current.content === null) {
      if (previousHash === null && latest === void 0) return;
      const record2 = {
        id: randomUUID3(),
        path,
        hash: null,
        beforeHash: previousHash,
        bytes: 0,
        mtime: Date.now(),
        source: "save",
        kind: "delete",
        sessionId: input.sessionId
      };
      await input.store.append(record2, input.limits, Date.now());
      seen.set(path, null);
      return;
    }
    const blob = await input.store.putBlob(current.content);
    const record = {
      id: randomUUID3(),
      path,
      hash: blob.hash,
      beforeHash: previousHash,
      bytes: blob.bytes,
      mtime: Date.now(),
      source: "save",
      kind: kindFrom(previousHash, blob.hash, false),
      sessionId: input.sessionId
    };
    await input.store.append(record, input.limits, Date.now());
    seen.set(path, blob.hash);
  });
}
async function handleWatchWrite(input) {
  const absPath = resolve(input.absPath);
  if (pathHasSkippedSegment(absPath, input.cwd)) return;
  const next = { ...input, absPath };
  return enqueueWrite(input.store.historyRoot, absPath, async () => {
    const matched = input.hits.filter((hit) => sameCardPath(hit.path, absPath));
    if (matched.length > 0) {
      const claimed = await claimAgentCards({
        store: input.store,
        sessionId: input.sessionId,
        cwd: input.cwd,
        hits: matched,
        limits: input.limits,
        readCurrent: input.readCurrent
      });
      if (claimed.length > 0) return;
    }
    await snapshotSave(next);
  });
}

// src/runtime.ts
var MB = 1024 * 1024;
var BINARY_SAMPLE = 4096;
function limitsFromSettings(settings) {
  return {
    maxPerFile: settings.maxPerFile,
    maxBytes: settings.maxBytesMb * MB,
    retentionDays: settings.retentionDays
  };
}
async function readWorkspaceCurrent(absPath) {
  let bytes;
  try {
    bytes = await readFile2(absPath);
  } catch {
    return { content: null, binary: false };
  }
  const sample = bytes.subarray(0, BINARY_SAMPLE);
  if (sample.includes(0)) return { content: null, binary: true };
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
  } catch {
    return { content: null, binary: true };
  }
  return { content: bytes.toString("utf8"), binary: false };
}
function normalizePath(path) {
  return path.replace(/\\/g, "/");
}
function sessionWatchKey(sessionId, cwd) {
  return `${sessionId}
${cwd}`;
}
function attachTypertRemote(service, serviceKey) {
  const binding = Object.freeze({ service, serviceKey, namespace: serviceKey });
  Object.defineProperty(service, "typertRemote", {
    value: binding,
    enumerable: true,
    configurable: false,
    writable: false
  });
}
var LocalHistoryRuntime = class {
  constructor(_ctx, settings) {
    this.settings = settings;
    attachTypertRemote(this, "localHistory");
  }
  watchers = /* @__PURE__ */ new Map();
  lastHits = /* @__PURE__ */ new Map();
  knownSessions = /* @__PURE__ */ new Map();
  stores = /* @__PURE__ */ new Map();
  getSettings() {
    return this.settings.get();
  }
  async updateSettings(update) {
    const next = await this.settings.update(update);
    if (!next.watchEnabled) this.stopAllWatchers();
    else this.startKnownWatchers();
    return next;
  }
  async listReview(sessionId, cwd) {
    const records = (await this.storeFor(sessionId, normalizeCwd(cwd)).load()).records.filter((record) => record.source === "agent");
    return { records, pending: pendingCount(records) };
  }
  async listTimeline(sessionId, cwd, path) {
    const root = defaultSessionsRoot();
    const wanted = normalizePath(path);
    const normalized = normalizeCwd(cwd);
    if (normalized === void 0) {
      const records = (await this.storeFor(sessionId, cwd).load()).records.filter((record) => normalizePath(record.path) === wanted).slice().sort((a, b) => b.mtime - a.mtime);
      return { records };
    }
    const project = join4(root, projectKey(normalized));
    let names;
    try {
      names = await readdir(project);
    } catch {
      return { records: [] };
    }
    const collected = [];
    for (const name2 of names) {
      const dir = join4(project, name2);
      const store = new HistoryStore(historyDir(dir));
      const index = await store.load();
      for (const record of index.records) {
        if (normalizePath(record.path) === wanted) collected.push(record);
      }
    }
    collected.sort((a, b) => b.mtime - a.mtime);
    return { records: collected };
  }
  async readBlob(sessionId, cwd, hash) {
    return { content: await this.storeFor(sessionId, cwd).readBlob(hash) };
  }
  async readCurrent(_sessionId, _cwd, path) {
    return await readWorkspaceCurrent(path);
  }
  async acceptFile(sessionId, cwd, recordId) {
    const next = await acceptFile(this.actionIo(sessionId, cwd), recordId);
    return { records: next.records };
  }
  async rejectFile(sessionId, cwd, recordId) {
    const next = await rejectFile(this.actionIo(sessionId, cwd), recordId);
    return { records: next.records };
  }
  async acceptHunk(sessionId, cwd, recordId, hunkKey) {
    const next = await acceptHunk(this.actionIo(sessionId, cwd), recordId, hunkKey);
    return { records: next.records };
  }
  async rejectHunk(sessionId, cwd, recordId, hunk) {
    const next = await rejectHunk(this.actionIo(sessionId, cwd), recordId, hunk);
    return { records: next.records };
  }
  async restore(sessionId, cwd, recordId) {
    const next = await restoreSnapshot(this.actionIo(sessionId, cwd), recordId);
    return { records: next.records };
  }
  async reopenRecord(sessionId, cwd, recordId, payload) {
    const next = await reopenRecord(this.actionIo(sessionId, cwd), recordId, payload);
    return { records: next.records };
  }
  async syncSession(sessionId, cwd, hits) {
    const normalized = normalizeCwd(cwd);
    if (normalized !== void 0) {
      const key = sessionWatchKey(sessionId, normalized);
      this.knownSessions.set(key, { sessionId, cwd: normalized });
      this.lastHits.set(key, [...hits]);
    } else {
      this.lastHits.set(sessionId, [...hits]);
    }
    const store = this.storeFor(sessionId, normalized);
    const settings = this.settings.get();
    await backfillAgentBefore(store);
    await claimAgentCards({
      store,
      sessionId,
      cwd: normalized,
      hits,
      limits: limitsFromSettings(settings),
      readCurrent: readWorkspaceCurrent
    });
    if (settings.watchEnabled && normalized !== void 0) this.ensureWatcher(sessionId, normalized);
    const records = (await store.load()).records;
    return { pending: pendingCount(records) };
  }
  dispose() {
    this.stopAllWatchers();
  }
  storeFor(sessionId, cwd) {
    const root = historyDir(sessionDir(defaultSessionsRoot(), normalizeCwd(cwd), sessionId));
    const cached = this.stores.get(root);
    if (cached !== void 0) return cached;
    const store = new HistoryStore(root);
    this.stores.set(root, store);
    return store;
  }
  actionIo(sessionId, cwd) {
    const store = this.storeFor(sessionId, cwd);
    return {
      store,
      sessionId,
      limits: limitsFromSettings(this.settings.get()),
      writeFile: (path, content) => writeFile2(path, content),
      unlink: (path) => unlink(path),
      readFile: async (path) => (await readWorkspaceCurrent(path)).content
    };
  }
  ensureWatcher(sessionId, cwd) {
    const key = sessionWatchKey(sessionId, cwd);
    if (this.watchers.has(key)) return;
    const handle = startWatcher(cwd, (absPath) => {
      void handleWatchWrite({
        store: this.storeFor(sessionId, cwd),
        sessionId,
        cwd,
        absPath,
        limits: limitsFromSettings(this.settings.get()),
        hits: this.lastHits.get(key) ?? this.lastHits.get(sessionId) ?? [],
        readCurrent: readWorkspaceCurrent
      });
    });
    this.watchers.set(key, handle);
  }
  startKnownWatchers() {
    for (const { sessionId, cwd } of this.knownSessions.values()) this.ensureWatcher(sessionId, cwd);
  }
  stopAllWatchers() {
    for (const handle of this.watchers.values()) handle.close();
    this.watchers.clear();
  }
};

// src/z.ts
function issue(message) {
  throw new Error(message);
}
function wrap(parse, optional = false) {
  const schema = {
    parse,
    optional: () => wrap((value) => {
      if (value === void 0) return void 0;
      return parse(value);
    }, true),
    nullable: () => wrap((value) => {
      if (value === null) return null;
      return parse(value);
    }),
    readonly: () => schema,
    _optional: optional
  };
  return schema;
}
var z = {
  string(opts = {}) {
    return wrap((value) => {
      if (typeof value !== "string") issue("expected string");
      if (opts.min !== void 0 && value.length < opts.min) issue("string too short");
      return value;
    });
  },
  number() {
    return wrap((value) => {
      if (typeof value !== "number" || !Number.isFinite(value)) issue("expected number");
      return value;
    });
  },
  boolean() {
    return wrap((value) => {
      if (typeof value !== "boolean") issue("expected boolean");
      return value;
    });
  },
  null() {
    return wrap((value) => {
      if (value !== null) issue("expected null");
      return null;
    });
  },
  enum(values) {
    const allowed = new Set(values);
    return wrap((value) => {
      if (typeof value !== "string" || !allowed.has(value)) issue("expected enum");
      return value;
    });
  },
  array(inner) {
    return wrap((value) => {
      if (!Array.isArray(value)) issue("expected array");
      return value.map((item) => inner.parse(item));
    });
  },
  object(shape) {
    return wrap((value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) issue("expected object");
      const input = value;
      const out = {};
      for (const [key, schema] of Object.entries(shape)) {
        const parsed = schema.parse(input[key]);
        if (parsed !== void 0) out[key] = parsed;
        else if (!schema._optional && !(key in input)) issue(`missing ${key}`);
      }
      return out;
    });
  },
  union(schemas) {
    return wrap((value) => {
      const errors = [];
      for (const schema of schemas) {
        try {
          return schema.parse(value);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "invalid");
        }
      }
      issue(errors.join("; ") || "invalid union");
    });
  },
  record(inner) {
    return wrap((value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) issue("expected object");
      const out = {};
      for (const [key, item] of Object.entries(value)) out[key] = inner.parse(item);
      return out;
    });
  }
};

// src/contract.ts
var sessionIdSchema = z.string({ min: 1 });
var cwdSchema = z.string().optional();
var pathSchema = z.string({ min: 1 });
var hashSchema = z.string({ min: 1 });
var recordIdSchema = z.string({ min: 1 });
var fileDiffHunkSchema = z.object({
  oldText: z.union([z.string(), z.null()]).optional(),
  newText: z.string()
});
var agentCardHitSchema = z.object({
  path: pathSchema,
  kind: z.enum(["add", "edit", "delete"]),
  oldText: z.union([z.string(), z.null()]).optional(),
  turn: z.number().optional(),
  diffs: z.array(fileDiffHunkSchema).optional()
});
var reviewHunkSchema = z.object({
  key: z.string({ min: 1 }),
  start: z.number(),
  end: z.number(),
  paintStart: z.number(),
  paintEnd: z.number(),
  oldBlock: z.string(),
  newBlock: z.string()
});
var historyRecordSchema = z.object({
  id: z.string({ min: 1 }),
  path: z.string({ min: 1 }),
  hash: z.union([z.string(), z.null()]),
  beforeHash: z.union([z.string(), z.null()]),
  bytes: z.number(),
  mtime: z.number(),
  source: z.enum(["agent", "save"]),
  kind: z.enum(["add", "edit", "delete"]),
  sessionId: z.string({ min: 1 }),
  turn: z.number().optional(),
  agentSessionId: z.string().optional(),
  decision: z.enum(["pending", "accepted", "rejected"]).optional(),
  hunks: z.record(z.enum(["accepted", "rejected"])).optional()
});
var localHistorySettingsSchema = z.object({
  watchEnabled: z.boolean(),
  maxPerFile: z.number(),
  maxBytesMb: z.number(),
  retentionDays: z.number()
});
var localHistorySettingsUpdateSchema = z.object({
  watchEnabled: z.boolean().optional(),
  maxPerFile: z.number().optional(),
  maxBytesMb: z.number().optional(),
  retentionDays: z.number().optional()
});
var recordsResultSchema = z.object({
  records: z.array(historyRecordSchema)
});
var reviewResultSchema = z.object({
  records: z.array(historyRecordSchema),
  pending: z.number()
});
var pendingResultSchema = z.object({
  pending: z.number()
});
var blobResultSchema = z.object({
  content: z.string()
});
var currentResultSchema = z.object({
  content: z.union([z.string(), z.null()]),
  binary: z.boolean()
});
var reopenPayloadSchema = z.object({
  content: z.union([z.string(), z.null()]).optional(),
  hunkKey: z.string().optional()
});
function jsonParam(name2, typeSymbol, schema) {
  return {
    name: name2,
    wire: name2,
    source: "json",
    codec: { mode: "strict", typeSymbol, schema }
  };
}
var sessionIdParam = jsonParam("sessionId", "dsh-local-history#SessionId", sessionIdSchema);
var cwdParam = jsonParam("cwd", "dsh-local-history#Cwd", cwdSchema);
var pathParam = jsonParam("path", "dsh-local-history#Path", pathSchema);
var hashParam = jsonParam("hash", "dsh-local-history#Hash", hashSchema);
var recordIdParam = jsonParam("recordId", "dsh-local-history#RecordId", recordIdSchema);
function method(name2, parameters, result) {
  return {
    id: `dsh-local-history#localHistory/${name2}`,
    service: "localHistory",
    namespace: "localHistory",
    method: name2,
    invocation: { kind: "direct" },
    parameters,
    result
  };
}
var recordsResult = {
  mode: "strict",
  typeSymbol: "dsh-local-history#HistoryRecord[]",
  schema: recordsResultSchema
};
var settingsResult = {
  mode: "strict",
  typeSymbol: "dsh-local-history#LocalHistorySettings",
  schema: localHistorySettingsSchema
};
var LOCAL_HISTORY_INVOCATIONS = [
  method("listReview", [sessionIdParam, cwdParam], {
    mode: "strict",
    typeSymbol: "dsh-local-history#ReviewResult",
    schema: reviewResultSchema
  }),
  method("listTimeline", [sessionIdParam, cwdParam, pathParam], recordsResult),
  method("readBlob", [sessionIdParam, cwdParam, hashParam], {
    mode: "strict",
    typeSymbol: "dsh-local-history#BlobResult",
    schema: blobResultSchema
  }),
  method("readCurrent", [sessionIdParam, cwdParam, pathParam], {
    mode: "strict",
    typeSymbol: "dsh-local-history#CurrentResult",
    schema: currentResultSchema
  }),
  method("acceptFile", [sessionIdParam, cwdParam, recordIdParam], recordsResult),
  method("rejectFile", [sessionIdParam, cwdParam, recordIdParam], recordsResult),
  method("acceptHunk", [
    sessionIdParam,
    cwdParam,
    recordIdParam,
    jsonParam("hunkKey", "dsh-local-history#HunkKey", z.string({ min: 1 }))
  ], recordsResult),
  method("rejectHunk", [
    sessionIdParam,
    cwdParam,
    recordIdParam,
    jsonParam("hunk", "dsh-local-history#ReviewHunk", reviewHunkSchema)
  ], recordsResult),
  method("restore", [sessionIdParam, cwdParam, recordIdParam], recordsResult),
  method("reopenRecord", [
    sessionIdParam,
    cwdParam,
    recordIdParam,
    jsonParam("payload", "dsh-local-history#ReopenPayload", reopenPayloadSchema)
  ], recordsResult),
  method("getSettings", [], settingsResult),
  method("updateSettings", [
    jsonParam("update", "dsh-local-history#LocalHistorySettingsUpdate", localHistorySettingsUpdateSchema)
  ], settingsResult),
  method("syncSession", [
    sessionIdParam,
    cwdParam,
    jsonParam("hits", "dsh-local-history#AgentCardHit[]", z.array(agentCardHitSchema))
  ], {
    mode: "strict",
    typeSymbol: "dsh-local-history#PendingResult",
    schema: pendingResultSchema
  })
];

// src/settings.ts
var LOCAL_HISTORY_NAMESPACE = "local-history";
var MB2 = 1024 * 1024;
var DEFAULT_LOCAL_HISTORY_SETTINGS = {
  watchEnabled: DEFAULT_WATCH_ENABLED,
  maxPerFile: MAX_PER_FILE,
  maxBytesMb: MAX_BYTES / MB2,
  retentionDays: RETENTION_DAYS
};
function clampLocalHistorySettings(raw) {
  const watchEnabled = typeof raw.watchEnabled === "boolean" ? raw.watchEnabled : DEFAULT_LOCAL_HISTORY_SETTINGS.watchEnabled;
  const maxPerFile = clampMaxPerFile(
    typeof raw.maxPerFile === "number" ? raw.maxPerFile : DEFAULT_LOCAL_HISTORY_SETTINGS.maxPerFile
  );
  const maxBytesMbRaw = typeof raw.maxBytesMb === "number" ? raw.maxBytesMb : DEFAULT_LOCAL_HISTORY_SETTINGS.maxBytesMb;
  const maxBytesMb = clampMaxBytes(maxBytesMbRaw * MB2) / MB2;
  const retentionDays = clampRetentionDays(
    typeof raw.retentionDays === "number" ? raw.retentionDays : DEFAULT_LOCAL_HISTORY_SETTINGS.retentionDays
  );
  return { watchEnabled, maxPerFile, maxBytesMb, retentionDays };
}
function memoryScope(initial = DEFAULT_LOCAL_HISTORY_SETTINGS) {
  let current = clampLocalHistorySettings(initial);
  return {
    get: () => current,
    update: async (update) => {
      current = clampLocalHistorySettings({ ...current, ...update });
      return current;
    }
  };
}
function registerLocalHistorySettings(ctx) {
  const register = ctx.settings?.register;
  if (typeof register !== "function") return memoryScope();
  try {
    const registered = register(LOCAL_HISTORY_NAMESPACE, localHistorySettingsSchema, { applies: "live" });
    if (registered === void 0 || typeof registered.get !== "function") return memoryScope();
    return {
      get: () => clampLocalHistorySettings(registered.get?.() ?? DEFAULT_LOCAL_HISTORY_SETTINGS),
      update: async (update) => {
        const next = clampLocalHistorySettings({ ...registered.get?.() ?? DEFAULT_LOCAL_HISTORY_SETTINGS, ...update });
        if (typeof registered.update === "function") await registered.update(next);
        return clampLocalHistorySettings(registered.get?.() ?? next);
      }
    };
  } catch {
    return memoryScope();
  }
}

// src/typert.ts
var METHODS = [
  { name: "listReview", signature: "listReview(sessionId: string, cwd?: string): Promise<{ records: HistoryRecord[]; pending: number }>" },
  { name: "listTimeline", signature: "listTimeline(sessionId: string, cwd: string | undefined, path: string): Promise<{ records: HistoryRecord[] }>" },
  { name: "readBlob", signature: "readBlob(sessionId: string, cwd: string | undefined, hash: string): Promise<{ content: string }>" },
  { name: "readCurrent", signature: "readCurrent(sessionId: string, cwd: string | undefined, path: string): Promise<{ content: string | null; binary: boolean }>" },
  { name: "acceptFile", signature: "acceptFile(sessionId: string, cwd: string | undefined, recordId: string): Promise<{ records: HistoryRecord[] }>" },
  { name: "rejectFile", signature: "rejectFile(sessionId: string, cwd: string | undefined, recordId: string): Promise<{ records: HistoryRecord[] }>" },
  { name: "acceptHunk", signature: "acceptHunk(sessionId: string, cwd: string | undefined, recordId: string, hunkKey: string): Promise<{ records: HistoryRecord[] }>" },
  { name: "rejectHunk", signature: "rejectHunk(sessionId: string, cwd: string | undefined, recordId: string, hunk: ReviewHunk): Promise<{ records: HistoryRecord[] }>" },
  { name: "restore", signature: "restore(sessionId: string, cwd: string | undefined, recordId: string): Promise<{ records: HistoryRecord[] }>" },
  { name: "reopenRecord", signature: "reopenRecord(sessionId: string, cwd: string | undefined, recordId: string, payload: ReopenPayload): Promise<{ records: HistoryRecord[] }>" },
  { name: "getSettings", signature: "getSettings(): LocalHistorySettings" },
  { name: "updateSettings", signature: "updateSettings(update: LocalHistorySettingsUpdate): Promise<LocalHistorySettings>" },
  { name: "syncSession", signature: "syncSession(sessionId: string, cwd: string | undefined, hits: AgentCardHit[]): Promise<{ pending: number }>" }
];
var TYPERT_MANIFEST = {
  package: "dsh-local-history",
  face: "host",
  schemas: [],
  model: {
    services: [
      {
        key: "localHistory",
        exportName: "LocalHistoryRuntime",
        description: "Session-scoped local history snapshots and AI change review.",
        tags: [],
        members: METHODS.map((method2) => ({ kind: "method", ...method2 })),
        types: []
      }
    ],
    events: [],
    objects: []
  },
  invocations: LOCAL_HISTORY_INVOCATIONS
};

// src/index.ts
var name = "dsh-local-history";
var inject = ["settings", "typert"];
function apply(ctx) {
  const settings = registerLocalHistorySettings(ctx);
  const runtime = new LocalHistoryRuntime(ctx, settings);
  ctx.reflect.provide("localHistory", runtime);
  ctx.effect(() => {
    const dispose = ctx.typert.register(TYPERT_MANIFEST);
    return () => {
      void dispose();
    };
  }, "dsh-local-history: typert manifest");
  ctx.effect(() => () => runtime.dispose(), "dsh-local-history: runtime cleanup");
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
