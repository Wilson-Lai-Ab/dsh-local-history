window.__ModuleLoader__.load({ id: 'dsh-local-history', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  DiffView: () => DiffView,
  LOCAL_HISTORY_REMOTE: () => LOCAL_HISTORY_REMOTE,
  NS: () => NS,
  ReviewApp: () => ReviewApp,
  TimelineView: () => TimelineView,
  apply: () => apply,
  en: () => en,
  inject: () => inject,
  zh: () => zh
});
module.exports = __toCommonJS(index_exports);
var import_react8 = require("react");

// src/client/ReviewView.tsx
var import_react2 = require("react");

// src/client/TimelineView.tsx
var import_react = require("react");

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
function jsonParam(name, typeSymbol, schema) {
  return {
    name,
    wire: name,
    source: "json",
    codec: { mode: "strict", typeSymbol, schema }
  };
}
var sessionIdParam = jsonParam("sessionId", "dsh-local-history#SessionId", sessionIdSchema);
var cwdParam = jsonParam("cwd", "dsh-local-history#Cwd", cwdSchema);
var pathParam = jsonParam("path", "dsh-local-history#Path", pathSchema);
var hashParam = jsonParam("hash", "dsh-local-history#Hash", hashSchema);
var recordIdParam = jsonParam("recordId", "dsh-local-history#RecordId", recordIdSchema);
function method(name, parameters, result) {
  return {
    id: `dsh-local-history#localHistory/${name}`,
    service: "localHistory",
    namespace: "localHistory",
    method: name,
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

// src/client/remote.ts
var LOCAL_HISTORY_REMOTE = {
  package: "dsh-local-history",
  descriptors: LOCAL_HISTORY_INVOCATIONS
};
function unwrapResult(result) {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

// src/client/locales.ts
var NS = "localHistory";
var zh = {
  reviewTitle: "\u6539\u52A8\u5BA1\u67E5",
  noSession: "\u6CA1\u6709\u5DE5\u4F5C\u533A",
  loadFailed: "\u52A0\u8F7D\u5931\u8D25",
  snapshotGone: "\u8BE5\u7248\u672C\u5FEB\u7167\u5DF2\u88AB\u6E05\u7406\uFF0C\u65E0\u6CD5\u8BFB\u53D6",
  hunkDrifted: "\u8FD9\u6BB5\u6539\u52A8\u5DF2\u4E0E\u78C1\u76D8\u4E0D\u4E00\u81F4",
  agentEdited: "\u667A\u80FD\u4F53\u6539\u8FC7\u8FD9\u4E2A\u6587\u4EF6",
  undoFile: "\u64A4\u9500",
  keepFile: "\u63A5\u53D7",
  filterPending: "\u5F85\u5904\u7406",
  filterAll: "\u5168\u90E8",
  filterDone: "\u5DF2\u5904\u7406",
  acceptFile: "\u63A5\u53D7\u6587\u4EF6",
  rejectFile: "\u62D2\u7EDD\u6587\u4EF6",
  acceptHunk: "\u63A5\u53D7",
  rejectHunk: "\u62D2\u7EDD",
  undoHunk: "\u64A4\u9500 L{range}",
  keepHunk: "\u63A5\u53D7 L{range}",
  timeline: "\u65F6\u95F4\u7EBF",
  backToList: "\u8FD4\u56DE\u5217\u8868",
  compareTitle: "\u5BF9\u6BD4",
  compareLeft: "\u4E0A\u4E00\u7248 {hash}",
  compareRight: "\u8FD9\u4E00\u7248 {hash}",
  restore: "\u6062\u590D",
  binaryFile: "\u4E8C\u8FDB\u5236\u6587\u4EF6\uFF0C\u4EC5\u652F\u6301\u6574\u6587\u4EF6\u63A5\u53D7\u6216\u62D2\u7EDD",
  badgeAI: "AI",
  badgeSave: "\u4FDD\u5B58",
  statusPending: "\u5F85\u5904\u7406",
  statusAccepted: "\u5DF2\u63A5\u53D7",
  statusRejected: "\u5DF2\u62D2\u7EDD",
  watchEnabled: "\u76D1\u89C6\u5DE5\u4F5C\u533A\u5199\u5165",
  maxPerFile: "\u6BCF\u6587\u4EF6\u5FEB\u7167\u6570",
  maxBytesMb: "\u6BCF\u4F1A\u8BDD\u4F53\u79EF",
  retentionDays: "\u4FDD\u7559\u5929\u6570",
  emptyList: "\u6CA1\u6709\u6539\u52A8",
  pendingCount: "{n} \u5904\u5F85\u5904\u7406",
  keepAll: "\u5168\u90E8\u63A5\u53D7",
  undoAll: "\u5168\u90E8\u64A4\u9500",
  fileCount: "{n} \u4E2A\u6587\u4EF6",
  ofLocation: "of {path}",
  noPrompt: "(\u65E0\u7528\u6237\u6D88\u606F)",
  turn: "\u7B2C {n} \u8F6E",
  turnUnknown: "\u672A\u7F16\u53F7",
  justNow: "\u521A\u521A",
  minutesAgo: "{n} \u5206\u949F\u524D",
  hoursAgo: "{n} \u5C0F\u65F6\u524D",
  daysAgo: "{n} \u5929\u524D",
  unitMb: "MB",
  unitDays: "\u5929"
};
var en = {
  reviewTitle: "Change review",
  noSession: "No workspace",
  loadFailed: "Failed to load",
  snapshotGone: "This snapshot was cleaned up and can no longer be read",
  hunkDrifted: "This hunk no longer matches disk",
  agentEdited: "The agent edited this file",
  undoFile: "Undo",
  keepFile: "Keep",
  filterPending: "Pending",
  filterAll: "All",
  filterDone: "Reviewed",
  acceptFile: "Accept file",
  rejectFile: "Reject file",
  acceptHunk: "Accept",
  rejectHunk: "Reject",
  undoHunk: "Undo L{range}",
  keepHunk: "Keep L{range}",
  timeline: "Timeline",
  backToList: "Back",
  compareTitle: "Compare",
  compareLeft: "Previous {hash}",
  compareRight: "This {hash}",
  restore: "Restore",
  binaryFile: "Binary file; accept or reject the whole file",
  badgeAI: "AI",
  badgeSave: "Save",
  statusPending: "Pending",
  statusAccepted: "Accepted",
  statusRejected: "Rejected",
  watchEnabled: "Watch workspace writes",
  maxPerFile: "Snapshots per file",
  maxBytesMb: "Session size",
  retentionDays: "Retention days",
  emptyList: "No changes",
  pendingCount: "{n} pending",
  keepAll: "Keep all",
  undoAll: "Undo all",
  fileCount: "{n} files",
  ofLocation: "of {path}",
  noPrompt: "(no user message)",
  turn: "Turn {n}",
  turnUnknown: "Unturned",
  justNow: "just now",
  minutesAgo: "{n} minutes ago",
  hoursAgo: "{n} hours ago",
  daysAgo: "{n} days ago",
  unitMb: "MB",
  unitDays: "days"
};
function fmt(template, params) {
  if (params === void 0) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key) => params[key] ?? whole);
}
function lookup(key, params) {
  const template = zh[key] ?? key;
  return fmt(template, params);
}

// src/client/TimelineView.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function relativeTime(mtime, now = Date.now()) {
  const delta = Math.max(0, now - mtime);
  const minutes = Math.round(delta / 6e4);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
function sessionLabel(sessionId) {
  if (sessionId.startsWith("session-") && sessionId.length > 20) return sessionId.slice(8, 16);
  if (sessionId.length > 16) return sessionId.slice(0, 8);
  return sessionId;
}
function TimelineView(props) {
  const t = props.t ?? lookup;
  const [records, setRecords] = (0, import_react.useState)([]);
  const [error, setError] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const value = unwrapResult(await props.remote.listTimeline(props.sessionId, props.cwd, props.path));
        if (!cancelled) {
          setRecords(value.records);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [props.cwd, props.path, props.remote, props.sessionId]);
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh_lh_error", children: t("loadFailed") });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh_lh_timeline", "data-lh-timeline-list": "", children: records.map((record) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "button",
    {
      type: "button",
      className: "dsh_lh_timeRow",
      "data-selected": props.selectedId === record.id ? "true" : "false",
      title: record.sessionId,
      onClick: () => {
        props.onSelect?.(record, records);
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh_lh_timeWhen", children: relativeTime(record.mtime) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh_lh_timeSession", children: sessionLabel(record.sessionId) })
      ]
    },
    record.id
  )) });
}

// src/client/compare.ts
var COMPARE_TAB = "dsh-local-history:compare";
var REVIEW_TAB = "dsh-local-history:change";
function reviewTabId(record) {
  return `${REVIEW_TAB}:${record.id}`;
}
function isHistoryRecord(value) {
  if (value === null || typeof value !== "object") return false;
  const record = value;
  return typeof record.id === "string" && typeof record.path === "string" && typeof record.sessionId === "string";
}
function compareTabId(seed) {
  return `${COMPARE_TAB}:${seed.path}:${seed.leftHash ?? "x"}:${seed.rightHash ?? "x"}`;
}
function fileNameOf(path) {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return slash === -1 ? path : path.slice(slash + 1);
}
function shortHash(hash) {
  if (hash === null || hash === "") return "\u2205";
  return hash.slice(0, 8);
}
function sameHash(a, b) {
  return a !== void 0 && a !== null && a !== "" && a === b;
}
function compareSeedFromTimeline(records, selected, cwd) {
  const ordered = records.slice().sort((a, b) => a.mtime - b.mtime || a.id.localeCompare(b.id));
  const index = ordered.findIndex((row) => row.id === selected.id);
  let previous;
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = ordered[i];
    if (candidate !== void 0 && !sameHash(candidate.hash, selected.hash)) {
      previous = candidate;
      break;
    }
  }
  const leftHash = previous?.hash ?? (sameHash(selected.beforeHash, selected.hash) ? null : selected.beforeHash);
  return {
    path: selected.path,
    sessionId: selected.sessionId,
    cwd,
    leftHash,
    rightHash: selected.hash,
    leftSessionId: previous?.sessionId,
    rightSessionId: selected.sessionId
  };
}
function isCompareSeed(value) {
  if (value === null || typeof value !== "object") return false;
  const seed = value;
  return typeof seed.path === "string" && typeof seed.sessionId === "string";
}

// src/client/pending.ts
var pending = null;
var pendingListeners = /* @__PURE__ */ new Set();
var reviewListeners = /* @__PURE__ */ new Set();
function setPendingCount(value) {
  pending = value;
  for (const listener of pendingListeners) listener();
}
function getPendingCount() {
  return pending;
}
function subscribePending(listener) {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}
function notifyReviewChanged() {
  for (const listener of reviewListeners) listener();
}
function subscribeReviewChanged(listener) {
  reviewListeners.add(listener);
  return () => {
    reviewListeners.delete(listener);
  };
}
function pendingBadge() {
  try {
    const value = pending;
    if (value === null || value <= 0) return null;
    return value;
  } catch {
    return null;
  }
}

// src/client/review-revert.ts
var undo = [];
var redo = [];
function matches(entry, sessionId, path) {
  if (sessionId !== void 0 && entry.sessionId !== sessionId) return false;
  if (path !== void 0 && entry.path !== path) return false;
  return true;
}
function lastIndex(stack, sessionId, path) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i];
    if (entry !== void 0 && matches(entry, sessionId, path)) return i;
  }
  return -1;
}
function pushReviewRevert(entry) {
  undo.push(entry);
  redo.length = 0;
}
function popReviewUndo(sessionId, path) {
  const index = lastIndex(undo, sessionId, path);
  if (index === -1) return void 0;
  const [entry] = undo.splice(index, 1);
  if (entry === void 0) return void 0;
  redo.push(entry);
  return entry;
}
function popReviewRedo(sessionId, path) {
  const index = lastIndex(redo, sessionId, path);
  if (index === -1) return void 0;
  const [entry] = redo.splice(index, 1);
  if (entry === void 0) return void 0;
  undo.push(entry);
  return entry;
}
function reopenPayloadOf(entry) {
  const payload = {};
  if (entry.kind !== "file-accept" && entry.kind !== "hunk-accept") {
    payload.content = entry.previous ?? null;
  }
  if (entry.hunkKey !== void 0) payload.hunkKey = entry.hunkKey;
  return payload;
}
async function applyReviewRevert(remote, entry, direction) {
  const { sessionId, cwd, recordId } = entry;
  if (direction === "undo") {
    unwrapResult(await remote.reopenRecord(sessionId, cwd, recordId, reopenPayloadOf(entry)));
    return;
  }
  if (entry.kind === "file-accept") {
    unwrapResult(await remote.acceptFile(sessionId, cwd, recordId));
    return;
  }
  if (entry.kind === "file-reject") {
    unwrapResult(await remote.rejectFile(sessionId, cwd, recordId));
    return;
  }
  if (entry.kind === "hunk-accept" && entry.hunkKey !== void 0) {
    unwrapResult(await remote.acceptHunk(sessionId, cwd, recordId, entry.hunkKey));
    return;
  }
  if (entry.kind === "hunk-reject" && entry.hunk !== void 0) {
    unwrapResult(await remote.rejectHunk(sessionId, cwd, recordId, entry.hunk));
  }
}

// src/client/review-keys.ts
var handlers = [];
function isReviewUndoKey(event) {
  return (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "z" && !event.shiftKey;
}
function isReviewRedoKey(event) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
  if (event.key.toLowerCase() === "z" && event.shiftKey) return true;
  return event.key.toLowerCase() === "y" && !event.shiftKey;
}
function typingInField(event) {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target.isContentEditable === true;
}
function onKey(event) {
  if (typingInField(event) || handlers.length === 0) return;
  const undo2 = isReviewUndoKey(event);
  const redo2 = isReviewRedoKey(event);
  if (!undo2 && !redo2) return;
  for (let i = handlers.length - 1; i >= 0; i--) {
    const handler = handlers[i];
    if (handler === void 0) continue;
    const handled = undo2 ? handler.undo() : handler.redo();
    if (handled === false) continue;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
}
function bindReviewKeys(onUndo, onRedo) {
  const handler = { undo: onUndo, redo: onRedo };
  handlers.push(handler);
  if (handlers.length === 1) window.addEventListener("keydown", onKey, true);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index !== -1) handlers.splice(index, 1);
    if (handlers.length === 0) window.removeEventListener("keydown", onKey, true);
  };
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
function hitFromMutationTool(name, argsRaw, cwd, turn) {
  if (name !== "edit" && name !== "write") return void 0;
  const args = parseToolArgs(argsRaw);
  if (args === void 0) return void 0;
  const filePath = args.file_path;
  if (typeof filePath !== "string" || filePath === "") return void 0;
  const path = resolveProjectPath(cwd, filePath);
  if (name === "write") return { path, kind: "add", oldText: null, turn };
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
        const pending2 = callId === void 0 ? void 0 : pendingCalls.get(callId);
        if (pending2 !== void 0 && !resultIsError(data)) {
          const hit2 = hitFromMutationTool(pending2.name, pending2.argsRaw, cwd, pending2.turn ?? turn);
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

// src/client/present.ts
function relativeTo(cwd, path) {
  const file = path.replace(/\\/g, "/");
  if (cwd === void 0 || cwd === "") return file;
  const root = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  if (file === root) return ".";
  if (file.startsWith(`${root}/`)) return file.slice(root.length + 1);
  return file;
}
function presentReviewHit(path, cwd) {
  const rel = relativeTo(cwd, path);
  const shown = rel === "." ? path.replace(/\\/g, "/").split("/").pop() ?? path : rel;
  const parts = shown.replace(/\\/g, "/").split("/").filter((part) => part !== "");
  const fileName = parts.pop() ?? shown;
  if (parts.length === 0) return { name: fileName, location: null, module: null };
  const module2 = parts[0] ?? null;
  const afterModule = parts.slice(1);
  return {
    name: fileName,
    location: afterModule.length === 0 ? null : afterModule.join("/"),
    module: module2
  };
}
function promptPreview(prompt, max = 96) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 1))}\u2026`;
}
function textFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return "";
  const texts = [];
  for (const block of blocks) {
    if (typeof block === "string") {
      texts.push(block);
      continue;
    }
    if (block === null || typeof block !== "object") continue;
    const record = block;
    if (typeof record.text === "string" && (record.type === void 0 || record.type === "text")) {
      texts.push(record.text);
    }
  }
  return texts.join("\n");
}
function promptOfNode(node) {
  if (node === null || typeof node !== "object") return "";
  const record = node;
  if (typeof record.text === "string") return record.text;
  if (typeof record.content === "string") return record.content;
  const fromContent = textFromBlocks(record.content);
  if (fromContent !== "") return fromContent;
  return textFromBlocks(record.parts);
}
function collectTurnPrompts(nodes) {
  const prompts = /* @__PURE__ */ new Map();
  let prompt = "";
  let turn;
  for (const node of nodes) {
    if (node === null || typeof node !== "object") continue;
    const record = node;
    if (record.kind === "user" || record.kind === "steering") {
      const next = promptOfNode(node).trim();
      if (next !== "") prompt = next;
      continue;
    }
    if (typeof record.turn === "number") turn = record.turn;
    if (prompt === "") continue;
    prompts.set(turn ?? "x", prompt);
  }
  return prompts;
}
var KEYWORDS = /* @__PURE__ */ new Set([
  "export",
  "import",
  "from",
  "const",
  "let",
  "var",
  "function",
  "return",
  "async",
  "await",
  "class",
  "extends",
  "new",
  "if",
  "else",
  "for",
  "while",
  "switch",
  "case",
  "break",
  "continue",
  "try",
  "catch",
  "finally",
  "throw",
  "typeof",
  "in",
  "of",
  "void",
  "as",
  "type",
  "interface",
  "true",
  "false",
  "null",
  "undefined",
  "package",
  "public",
  "private",
  "protected",
  "static",
  "final",
  "abstract",
  "implements",
  "enum",
  "synchronized",
  "volatile",
  "transient",
  "native",
  "throws",
  "this",
  "super",
  "instanceof",
  "assert",
  "default",
  "boolean",
  "byte",
  "char",
  "short",
  "int",
  "long",
  "float",
  "double"
]);
function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function spansToHtml(spans) {
  return spans.map((span) => {
    const safe = escapeHtml(span.text);
    return span.kind === void 0 ? safe : `<span data-tok="${span.kind}">${safe}</span>`;
  }).join("");
}
function highlightLineHtml(text, start = "code") {
  const { spans, mode } = highlightLineState(text, start);
  return { html: spansToHtml(spans), mode };
}
function highlightRowsHtml(rows) {
  let mode = "code";
  return rows.map((row) => {
    if (row.kind === "del") return highlightLineHtml(row.text).html;
    const next = highlightLineHtml(row.text, mode);
    mode = next.mode;
    return next.html;
  });
}
function highlightLine(text) {
  return highlightLineState(text, "code").spans;
}
function highlightLineState(text, start) {
  const out = [];
  const push = (kind, chunk) => {
    if (chunk === "") return;
    const last = out[out.length - 1];
    if (last !== void 0 && last.kind === kind) last.text += chunk;
    else out.push({ kind, text: chunk });
  };
  let mode = start;
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    if (mode === "block") {
      const end = rest.indexOf("*/");
      if (end === -1) {
        push("cmt", rest);
        return { spans: out, mode: "block" };
      }
      push("cmt", rest.slice(0, end + 2));
      i += end + 2;
      mode = "code";
      continue;
    }
    if (mode === "template") {
      const close = rest.match(/^(?:\\.|[^`$])+/);
      if (close !== null) {
        push("str", close[0]);
        i += close[0].length;
        continue;
      }
      if (rest.startsWith("`")) {
        push("str", "`");
        i += 1;
        mode = "code";
        continue;
      }
      push("str", rest[0] ?? "");
      i += 1;
      continue;
    }
    if (rest.startsWith("//")) {
      push("cmt", rest);
      break;
    }
    if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/");
      if (end === -1) {
        push("cmt", rest);
        return { spans: out, mode: "block" };
      }
      push("cmt", rest.slice(0, end + 2));
      i += end + 2;
      continue;
    }
    if (rest.startsWith("`")) {
      const closed = rest.match(/^`(?:\\.|[^`$])*`/);
      if (closed !== null) {
        push("str", closed[0]);
        i += closed[0].length;
        continue;
      }
      push("str", rest);
      return { spans: out, mode: "template" };
    }
    const str = rest.match(/^('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/);
    if (str !== null) {
      push("str", str[0]);
      i += str[0].length;
      continue;
    }
    const regex = rest.match(/^\/(?:\\.|[^/\n])+\/[gimsuy]*/);
    if (regex !== null && (i === 0 || /[\s([=,!:&|?{~;]/.test(text[i - 1] ?? ""))) {
      push("str", regex[0]);
      i += regex[0].length;
      continue;
    }
    const ident = rest.match(/^[A-Za-z_$][\w$]*/);
    if (ident !== null) {
      const word = ident[0];
      const after = text.slice(i + word.length);
      if (KEYWORDS.has(word)) push("kw", word);
      else if (/^\s*\(/.test(after)) push("fn", word);
      else push(void 0, word);
      i += word.length;
      continue;
    }
    push(void 0, text[i] ?? "");
    i += 1;
  }
  return { spans: out, mode };
}

// src/client/session-tree.ts
function treeSessionIds(byId, rootId) {
  if (rootId === void 0 || rootId === "") return [];
  const ids = /* @__PURE__ */ new Set();
  for (const summary of Object.values(byId)) {
    if (summary === void 0) continue;
    const seen = /* @__PURE__ */ new Set();
    let current = summary;
    let reachesRoot = false;
    while (current !== void 0 && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.id === rootId) {
        reachesRoot = true;
        break;
      }
      if (current.origin !== "subagent" || current.parentId === void 0) break;
      current = byId[current.parentId];
    }
    if (reachesRoot) ids.add(summary.id);
  }
  if (!ids.has(rootId)) ids.add(rootId);
  return [...ids];
}
function collectTreeHits(sessions, sessionId, cwd) {
  const snapshot = sessions?.list?.getSnapshot?.() ?? {};
  const byId = snapshot.byId ?? {};
  const ids = treeSessionIds(byId, sessionId);
  const hits = [];
  for (const id of ids) {
    const binding = sessions?.binding?.(id);
    const nodes = binding?.session?.getSnapshot?.()?.nodes ?? [];
    const entries = binding?.eventSource?.getSnapshot?.()?.entries ?? [];
    const childCwd = byId[id]?.cwd ?? cwd;
    hits.push(...collectSessionEdits([...nodes, ...entries], childCwd));
  }
  return hits;
}
function collectTreePrompts(sessions, sessionId) {
  const snapshot = sessions?.list?.getSnapshot?.() ?? {};
  const byId = snapshot.byId ?? {};
  const ids = treeSessionIds(byId, sessionId);
  const prompts = /* @__PURE__ */ new Map();
  for (const id of ids) {
    const binding = sessions?.binding?.(id);
    const nodes = binding?.session?.getSnapshot?.()?.nodes ?? [];
    const entries = binding?.eventSource?.getSnapshot?.()?.entries ?? [];
    for (const [turn, prompt] of collectTurnPrompts([...nodes, ...entries])) {
      if (!prompts.has(turn)) prompts.set(turn, prompt);
    }
  }
  return prompts;
}

// src/client/ReviewView.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function kindBadge(kind) {
  if (kind === "add") return "A";
  if (kind === "delete") return "D";
  return "M";
}
function relativeTimeLong(mtime, t, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - mtime) / 6e4));
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minutesAgo", { n: String(minutes) });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("hoursAgo", { n: String(hours) });
  return t("daysAgo", { n: String(Math.round(hours / 24)) });
}
function matchesFilter(record, filter) {
  const decision = record.decision ?? "pending";
  if (filter === "pending") return decision === "pending";
  if (filter === "done") return decision !== "pending";
  return true;
}
function groupByTurn(records, newestFirst) {
  const map = /* @__PURE__ */ new Map();
  for (const record of records) {
    const key = record.turn === void 0 ? "x" : String(record.turn);
    let group = map.get(key);
    if (group === void 0) {
      group = { key, turn: record.turn, time: record.mtime, records: [] };
      map.set(key, group);
    }
    group.records.push(record);
    if (record.mtime > (group.time ?? 0)) group.time = record.mtime;
  }
  const groups = [...map.values()];
  groups.sort((a, b) => {
    const aTurn = a.turn ?? -1;
    const bTurn = b.turn ?? -1;
    if (aTurn !== bTurn) return newestFirst ? bTurn - aTurn : aTurn - bTurn;
    const aTime = a.time ?? 0;
    const bTime = b.time ?? 0;
    return newestFirst ? bTime - aTime : aTime - bTime;
  });
  return groups;
}
function ReviewApp(props) {
  const t = props.t ?? lookup;
  const { scope, remote, sessions } = props;
  const [filter, setFilter] = (0, import_react2.useState)("pending");
  const [records, setRecords] = (0, import_react2.useState)([]);
  const [timelineId, setTimelineId] = (0, import_react2.useState)();
  const [error, setError] = (0, import_react2.useState)(false);
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const syncing = (0, import_react2.useRef)(false);
  const cwd = scope.cwd;
  const pending2 = (0, import_react2.useMemo)(() => latestPendingPerPath(records), [records]);
  const revertRef = (0, import_react2.useRef)(() => false);
  const loadList = async () => {
    if (cwd === void 0 || cwd === "") return;
    try {
      const review = unwrapResult(await remote.listReview(scope.sessionId, cwd));
      setRecords(review.records);
      setPendingCount(review.pending);
      setError(false);
    } catch {
      setError(true);
      setPendingCount(null);
    }
  };
  const syncThenList = async () => {
    if (cwd === void 0 || cwd === "" || syncing.current) return;
    syncing.current = true;
    try {
      const hits = collectTreeHits(sessions, scope.sessionId, cwd);
      unwrapResult(await remote.syncSession(scope.sessionId, cwd, hits));
      await loadList();
      notifyReviewChanged();
    } catch {
      setError(true);
      setPendingCount(null);
    } finally {
      syncing.current = false;
    }
  };
  (0, import_react2.useEffect)(() => {
    if (cwd === void 0 || cwd === "") {
      setRecords([]);
      setPendingCount(null);
      return;
    }
    if (props.visible === false) return;
    void syncThenList();
  }, [cwd, scope.sessionId, props.visible]);
  (0, import_react2.useEffect)(() => {
    if (cwd === void 0 || cwd === "") return;
    return subscribeReviewChanged(() => {
      void loadList();
    });
  }, [cwd, scope.sessionId]);
  (0, import_react2.useEffect)(() => {
    if (cwd === void 0 || cwd === "") return;
    return sessions?.list?.subscribe?.(() => {
      void syncThenList();
    });
  }, [cwd, scope.sessionId, sessions]);
  (0, import_react2.useEffect)(() => bindReviewKeys(
    () => revertRef.current("undo"),
    () => revertRef.current("redo")
  ), []);
  const filtered = (0, import_react2.useMemo)(() => {
    if (filter === "pending") return pending2;
    return records.filter((record) => matchesFilter(record, filter));
  }, [filter, pending2, records]);
  const groups = (0, import_react2.useMemo)(() => groupByTurn(filtered, filter !== "done"), [filter, filtered]);
  const prompts = (0, import_react2.useMemo)(
    () => collectTreePrompts(sessions, scope.sessionId),
    [sessions, scope.sessionId, records]
  );
  const revert = (direction) => {
    const entry = direction === "undo" ? popReviewUndo() : popReviewRedo();
    if (entry === void 0) return false;
    void (async () => {
      try {
        await applyReviewRevert(remote, entry, direction);
        notifyReviewChanged();
      } catch {
      }
    })();
    return true;
  };
  revertRef.current = revert;
  const keepAll = () => {
    void (async () => {
      if (busy) return;
      setBusy(true);
      try {
        for (const record of pending2) {
          unwrapResult(await remote.acceptFile(scope.sessionId, cwd, record.id));
          pushReviewRevert({
            kind: "file-accept",
            sessionId: scope.sessionId,
            cwd,
            recordId: record.id,
            path: record.path
          });
        }
        await loadList();
        notifyReviewChanged();
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
    })();
  };
  const undoAll = () => {
    void (async () => {
      if (busy) return;
      setBusy(true);
      try {
        for (const record of pending2) {
          const current = unwrapResult(await remote.readCurrent(scope.sessionId, cwd, record.path));
          unwrapResult(await remote.rejectFile(scope.sessionId, cwd, record.id));
          pushReviewRevert({
            kind: "file-reject",
            sessionId: scope.sessionId,
            cwd,
            recordId: record.id,
            path: record.path,
            previous: current.content,
            next: null
          });
        }
        await loadList();
        notifyReviewChanged();
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
    })();
  };
  if (cwd === void 0 || cwd === "") {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh_lh_root", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh_lh_empty", children: t("noSession") }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh_lh_root", "data-lh-review": "", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh_lh_toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh_lh_pendingCount", children: t("pendingCount", { n: String(pending2.length) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh_lh_toolbarGrow" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dsh_lh_button", disabled: pending2.length === 0 || busy, onClick: keepAll, children: t("keepAll") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dsh_lh_button", disabled: pending2.length === 0 || busy, onClick: undoAll, children: t("undoAll") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh_lh_filters", role: "tablist", children: [
      ["pending", "filterPending"],
      ["all", "filterAll"],
      ["done", "filterDone"]
    ].map(([id, key]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "button",
      {
        type: "button",
        role: "tab",
        className: "dsh_lh_filter",
        "aria-selected": filter === id,
        onClick: () => {
          setFilter(id);
        },
        children: t(key)
      },
      id
    )) }),
    error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh_lh_error", children: t("loadFailed") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh_lh_list", "data-lh-full": "", children: [
      groups.length === 0 && !error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh_lh_empty", children: t("emptyList") }),
      groups.map((group) => {
        const prompt = prompts.get(group.turn ?? "x") ?? "";
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh_lh_group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh_lh_groupHeader", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh_lh_groupMeta", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh_lh_groupTurn", children: group.turn === void 0 ? t("turnUnknown") : t("turn", { n: String(group.turn) }) }),
              group.time !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh_lh_groupTime", children: relativeTimeLong(group.time, t) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh_lh_groupCount", children: t("fileCount", { n: String(group.records.length) }) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh_lh_groupPrompt", children: prompt === "" ? t("noPrompt") : promptPreview(prompt) })
          ] }),
          group.records.map((record) => {
            const shown = presentReviewHit(record.path, cwd);
            const decided = (record.decision ?? "pending") !== "pending";
            const openTimeline = timelineId === record.id;
            return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                "div",
                {
                  className: "dsh_lh_row",
                  "data-lh-row": "",
                  "data-selected": openTimeline ? "true" : "false",
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                      "button",
                      {
                        type: "button",
                        className: "dsh_lh_rowMain",
                        title: record.path,
                        onClick: () => {
                          props.onOpenReview?.(record);
                        },
                        children: [
                          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh_lh_kind", "data-kind": record.kind, children: kindBadge(record.kind) }),
                          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh_lh_name", "data-kind": record.kind, children: shown.name }),
                          shown.location !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh_lh_location", "data-kind": record.kind, children: t("ofLocation", { path: shown.location }) }),
                          shown.module !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh_lh_module", children: shown.module })
                        ]
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh_lh_rowActions", children: [
                      decided && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh_lh_status", children: record.decision === "accepted" ? t("statusAccepted") : t("statusRejected") }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                        "button",
                        {
                          type: "button",
                          className: "dsh_lh_chevron",
                          "aria-label": t("timeline"),
                          "aria-expanded": openTimeline,
                          "data-lh-timeline": "",
                          onClick: () => {
                            setTimelineId((current) => current === record.id ? void 0 : record.id);
                          },
                          children: openTimeline ? "\u25BE" : "\u25B8"
                        }
                      )
                    ] })
                  ]
                }
              ),
              openTimeline && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                TimelineView,
                {
                  path: record.path,
                  sessionId: scope.sessionId,
                  cwd,
                  remote,
                  t,
                  selectedId: record.id,
                  onSelect: (item, all) => {
                    props.onOpenCompare?.(compareSeedFromTimeline(all, item, cwd));
                  }
                }
              )
            ] }, record.id);
          })
        ] }, group.key);
      })
    ] })
  ] });
}

// src/client/SettingsPanel.tsx
var import_react3 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function SettingsPanel(props) {
  const t = props.t ?? lookup;
  const [value, setValue] = (0, import_react3.useState)(null);
  const [error, setError] = (0, import_react3.useState)(false);
  (0, import_react3.useEffect)(() => {
    let cancelled = false;
    void props.remote.getSettings().then((result) => {
      if (cancelled) return;
      setValue(unwrapResult(result));
      setError(false);
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [props.remote]);
  const commit = async (update) => {
    try {
      const next = unwrapResult(await props.remote.updateSettings(update));
      setValue(next);
      setError(false);
    } catch {
      setError(true);
    }
  };
  if (error && value === null) return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh_lh_error", children: t("loadFailed") });
  if (value === null) return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh_lh_empty" });
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh_lh_settings", "data-lh-settings": "", children: [
    error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh_lh_error", children: t("loadFailed") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "dsh_lh_settingRow", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: t("watchEnabled") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "input",
        {
          type: "checkbox",
          checked: value.watchEnabled,
          onChange: (event) => {
            void commit({ watchEnabled: event.target.checked });
          }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "dsh_lh_settingRow", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: t("maxPerFile") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "input",
        {
          type: "number",
          min: 1,
          max: 200,
          value: value.maxPerFile,
          onChange: (event) => {
            void commit({ maxPerFile: Number(event.target.value) });
          }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "dsh_lh_settingRow", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: t("maxBytesMb") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "input",
        {
          type: "number",
          min: 16,
          max: 2048,
          value: value.maxBytesMb,
          onChange: (event) => {
            void commit({ maxBytesMb: Number(event.target.value) });
          }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "dsh_lh_settingRow", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: t("retentionDays") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "input",
        {
          type: "number",
          min: 1,
          max: 365,
          value: value.retentionDays,
          onChange: (event) => {
            void commit({ retentionDays: Number(event.target.value) });
          }
        }
      )
    ] })
  ] });
}

// src/client/DiffView.tsx
var import_react6 = require("react");

// src/history/hunks.ts
function splitLines(text) {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
function hunksFromTexts(oldText, newText) {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  if (oldLines.length > 6e3 || newLines.length > 6e3) return [];
  const out = [];
  let i = 0;
  let j = 0;
  const window2 = 80;
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
      const iMax = Math.min(oldLines.length, i + window2);
      const jMax = Math.min(newLines.length, j + window2);
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
function paintFileDiff(before, after) {
  const hunks = hunksFromTexts(before, after);
  const afterLines = splitLines(after);
  const rows = [];
  let cursor = 1;
  for (const hunk of hunks) {
    const ctxEnd = hunk.newBlock === "" ? hunk.start : hunk.start - 1;
    while (cursor <= ctxEnd && cursor <= afterLines.length) {
      rows.push({ kind: "ctx", text: afterLines[cursor - 1] ?? "", line: cursor });
      cursor += 1;
    }
    for (const [index, text] of splitLines(hunk.oldBlock).entries()) {
      rows.push({ kind: "del", text, hunkKey: hunk.key, line: index === 0 ? hunk.start : void 0 });
    }
    if (hunk.newBlock !== "") {
      const last = hunk.end;
      while (cursor <= last && cursor <= afterLines.length) {
        rows.push({
          kind: "add",
          text: afterLines[cursor - 1] ?? "",
          line: cursor,
          hunkKey: hunk.key
        });
        cursor += 1;
      }
    }
  }
  while (cursor <= afterLines.length) {
    rows.push({ kind: "ctx", text: afterLines[cursor - 1] ?? "", line: cursor });
    cursor += 1;
  }
  return { rows, hunks };
}
function paintSplitDiff(before, after) {
  const hunks = hunksFromTexts(before, after);
  const oldLines = splitLines(before);
  const newLines = splitLines(after);
  const rows = [];
  let left = 1;
  let right = 1;
  const pushCtx = () => {
    rows.push({
      left: { kind: "ctx", text: oldLines[left - 1] ?? "", line: left },
      right: { kind: "ctx", text: newLines[right - 1] ?? "", line: right }
    });
    left += 1;
    right += 1;
  };
  for (const hunk of hunks) {
    const ctxEnd = hunk.newBlock === "" ? hunk.start : hunk.start - 1;
    while (right <= ctxEnd && right <= newLines.length && left <= oldLines.length) pushCtx();
    const dels = splitLines(hunk.oldBlock);
    const adds = splitLines(hunk.newBlock);
    const count = Math.max(dels.length, adds.length);
    for (let index = 0; index < count; index += 1) {
      const del = dels[index];
      const add = adds[index];
      rows.push({
        left: del === void 0 ? { kind: "empty", text: "" } : { kind: "del", text: del, line: left++ },
        right: add === void 0 ? { kind: "empty", text: "" } : { kind: "add", text: add, line: right++ }
      });
    }
  }
  while (left <= oldLines.length && right <= newLines.length) pushCtx();
  while (left <= oldLines.length) {
    rows.push({
      left: { kind: "del", text: oldLines[left - 1] ?? "", line: left },
      right: { kind: "empty", text: "" }
    });
    left += 1;
  }
  while (right <= newLines.length) {
    rows.push({
      left: { kind: "empty", text: "" },
      right: { kind: "add", text: newLines[right - 1] ?? "", line: right }
    });
    right += 1;
  }
  return { rows, hunks };
}

// src/client/review-minimap.ts
var import_react4 = require("react");
var import_react5 = require("react");
var MAX_WIDTH = 120;
var WIDTH_RATIO = 6;
var SIZE_RATIO = 4;
var REVIEW_LINE_PX = 20;
var GLYPH = {
  default: "#abb2bf",
  kw: "#c678dd",
  str: "#98c379",
  cmt: "#5c6370",
  fn: "#61afef"
};
var WASH = {
  add: "rgba(46,160,67,0.18)",
  del: "rgba(248,81,73,0.18)"
};
function minimapWidthPx(hostWidth) {
  return Math.min(MAX_WIDTH, Math.max(0, Math.round(hostWidth / WIDTH_RATIO)));
}
function minimapLayout(input) {
  const editorLine = input.editorLinePx ?? REVIEW_LINE_PX;
  const natural = editorLine / SIZE_RATIO;
  const rows = Math.max(1, input.rowCount);
  const lineHeight = input.gutterHeight <= 0 ? natural : Math.min(natural, input.gutterHeight / rows);
  const paintHeight = lineHeight * rows;
  const scrollHeight = Math.max(1, input.scrollHeight);
  return {
    lineHeight,
    paintHeight,
    overlayHeight: input.clientHeight / scrollHeight * paintHeight,
    overlayTop: input.scrollTop / scrollHeight * paintHeight
  };
}
function minimapLines(rows) {
  return rows.map((row) => {
    const glyphs = highlightLine(row.text).map((span) => ({
      text: span.text,
      color: GLYPH[span.kind ?? "default"] ?? GLYPH.default
    }));
    const wash = row.kind === "add" ? WASH.add : row.kind === "del" ? WASH.del : void 0;
    return { glyphs, wash };
  });
}
function minimapClickRatio(offsetY, height) {
  if (height <= 0) return 0;
  return Math.min(1, Math.max(0, offsetY / height));
}
function readEditorMinimap(source) {
  return source?.getSnapshot?.()?.prefs?.editorMinimap !== false;
}
function useEditorMinimap(source) {
  return (0, import_react4.useSyncExternalStore)(
    (listener) => source?.subscribeState?.(listener) ?? (() => {
    }),
    () => readEditorMinimap(source),
    () => true
  );
}
function drawMinimap(canvas, rows) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width <= 0 || height <= 0) return;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (rows.length === 0) return;
  const lines = minimapLines(rows);
  const lineH = minimapLayout({
    rowCount: lines.length,
    gutterHeight: height,
    scrollHeight: height,
    clientHeight: height,
    scrollTop: 0
  }).lineHeight;
  const fontPx = Math.max(1.2, lineH * 0.85);
  const charW = fontPx * 0.55;
  ctx.textBaseline = "top";
  ctx.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  for (let i = 0; i < lines.length; i += 1) {
    const y = i * lineH;
    const line = lines[i];
    if (line === void 0) continue;
    if (line.wash !== void 0) {
      ctx.fillStyle = line.wash;
      ctx.fillRect(0, y, width, Math.max(lineH, 1 / dpr));
    }
    let x = 2;
    for (const glyph of line.glyphs) {
      if (x > width) break;
      ctx.fillStyle = glyph.color;
      ctx.fillText(glyph.text, x, y);
      x += glyph.text.length * charW;
    }
  }
}
function ReviewMinimap(props) {
  const canvasRef = (0, import_react4.useRef)(null);
  const overlayRef = (0, import_react4.useRef)(null);
  const rootRef = (0, import_react4.useRef)(null);
  const enabled = props.enabled !== false;
  (0, import_react4.useEffect)(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (canvas === null || root === null) return;
    const host = props.scrollEl?.parentElement ?? root.parentElement;
    const apply2 = () => {
      const width = minimapWidthPx(host?.clientWidth ?? root.clientWidth);
      root.style.width = `${width}px`;
      host?.style.setProperty("--dsh-lh-minimap", `${width}px`);
      drawMinimap(canvas, props.rows);
    };
    apply2();
    const observer = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(apply2);
    if (host !== null && host !== void 0) observer?.observe(host);
    observer?.observe(root);
    return () => {
      observer?.disconnect();
    };
  }, [enabled, props.rows, props.scrollEl]);
  (0, import_react4.useEffect)(() => {
    if (!enabled) return;
    const scroll = props.scrollEl;
    const overlay = overlayRef.current;
    const root = rootRef.current;
    if (scroll === null || overlay === null || root === null) return;
    const sync = () => {
      const layout = minimapLayout({
        rowCount: props.rows.length,
        gutterHeight: root.clientHeight,
        scrollHeight: scroll.scrollHeight,
        clientHeight: scroll.clientHeight,
        scrollTop: scroll.scrollTop
      });
      overlay.style.height = `${Math.max(2, layout.overlayHeight)}px`;
      overlay.style.top = `${layout.overlayTop}px`;
    };
    sync();
    scroll.addEventListener("scroll", sync, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(sync);
    observer?.observe(scroll);
    observer?.observe(root);
    return () => {
      scroll.removeEventListener("scroll", sync);
      observer?.disconnect();
    };
  }, [enabled, props.scrollEl, props.rows.length]);
  if (!enabled) return null;
  const onClick = (event) => {
    const scroll = props.scrollEl;
    if (scroll === null) return;
    const box = event.currentTarget.getBoundingClientRect();
    const layout = minimapLayout({
      rowCount: props.rows.length,
      gutterHeight: box.height,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
      scrollTop: scroll.scrollTop
    });
    const ratio = minimapClickRatio(event.clientY - box.top, layout.paintHeight);
    const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    scroll.scrollTop = ratio * max;
  };
  return (0, import_react5.createElement)(
    "div",
    {
      ref: rootRef,
      className: "dsh_lh_minimap",
      onClick,
      role: "scrollbar",
      "aria-label": "minimap"
    },
    (0, import_react5.createElement)("canvas", { ref: canvasRef, className: "dsh_lh_minimapCanvas" }),
    (0, import_react5.createElement)("div", { ref: overlayRef, className: "dsh_lh_minimapOverlay" })
  );
}

// src/client/DiffView.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function DiffView(props) {
  const t = props.t ?? lookup;
  const { record, sessionId, cwd, remote } = props;
  const [state, setState] = (0, import_react6.useState)(null);
  const [busy, setBusy] = (0, import_react6.useState)(false);
  const [accepted, setAccepted] = (0, import_react6.useState)(() => acceptedHunkKeys(record));
  const revertRef = (0, import_react6.useRef)(() => false);
  const liveRef = (0, import_react6.useRef)(false);
  const [fileEl, setFileEl] = (0, import_react6.useState)(null);
  const minimapOn = useEditorMinimap(props.prefs);
  (0, import_react6.useEffect)(() => {
    liveRef.current = false;
  }, [record.id]);
  (0, import_react6.useEffect)(() => {
    let cancelled = false;
    const load = async (live) => {
      try {
        let latest = record;
        try {
          const review = unwrapResult(await remote.listReview(sessionId, cwd));
          const found = review.records.find((item) => item.id === record.id);
          if (found !== void 0) {
            latest = found;
            setAccepted((prev) => /* @__PURE__ */ new Set([...prev, ...acceptedHunkKeys(found)]));
          }
        } catch {
        }
        let before = "";
        const blobSession = props.blobSessionId ?? sessionId;
        const beforeHash = props.compareHash ?? latest.beforeHash;
        if (beforeHash !== null && beforeHash !== void 0 && beforeHash !== "") {
          const blob = unwrapResult(await remote.readBlob(blobSession, cwd, beforeHash));
          before = blob.content;
        }
        let after = "";
        let binary = false;
        const afterHash = props.afterHash;
        const useLive = live || liveRef.current;
        if (!useLive && afterHash !== null && afterHash !== void 0 && afterHash !== "") {
          after = unwrapResult(await remote.readBlob(blobSession, cwd, afterHash)).content;
        } else {
          const current = unwrapResult(await remote.readCurrent(sessionId, cwd, record.path));
          after = current.content ?? "";
          binary = current.binary;
        }
        if (cancelled) return;
        if (latest.beforeHash !== record.beforeHash) props.onRecord?.(latest);
        liveRef.current = useLive;
        setState({
          before,
          after,
          current: after,
          binary,
          error: false,
          gone: false,
          live: useLive
        });
      } catch (loadError) {
        if (!cancelled) setState({
          before: "",
          after: "",
          current: "",
          binary: false,
          error: true,
          gone: String(loadError).includes("ENOENT"),
          live
        });
      }
    };
    void load(false);
    const stop = subscribeReviewChanged(() => {
      void load(liveRef.current);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [cwd, props.afterHash, props.blobSessionId, props.compareHash, record.beforeHash, record.hash, record.id, record.path, remote, sessionId]);
  const reloadLive = async () => {
    const current = unwrapResult(await remote.readCurrent(sessionId, cwd, record.path));
    liveRef.current = true;
    setState((prev) => ({
      before: prev?.before ?? "",
      after: current.content ?? "",
      current: current.content ?? "",
      binary: current.binary,
      error: false,
      gone: false,
      live: true
    }));
  };
  const remember = (result) => {
    const records = result?.records;
    const latest = records?.find((item) => item.id === record.id);
    if (latest === void 0) return;
    setAccepted(acceptedHunkKeys(latest));
    props.onRecord?.(latest);
  };
  const run = async (fn, after, hunkKey, hunk) => {
    if (busy) return;
    setBusy(true);
    try {
      const snapshot = state?.current;
      remember(unwrapResult(await fn()));
      if (after === "accept-hunk" && hunkKey !== void 0) {
        setAccepted((prev) => /* @__PURE__ */ new Set([...prev, hunkKey]));
        pushReviewRevert({
          kind: "hunk-accept",
          sessionId,
          cwd,
          recordId: record.id,
          path: record.path,
          hunkKey,
          hunk
        });
      }
      if (after === "reject-hunk" && hunk !== void 0) {
        pushReviewRevert({
          kind: "hunk-reject",
          sessionId,
          cwd,
          recordId: record.id,
          path: record.path,
          previous: snapshot,
          hunkKey: hunk.key,
          hunk
        });
        await reloadLive();
      }
      if (after === "file") {
        const keep = hunkKey === "keep";
        pushReviewRevert({
          kind: keep ? "file-accept" : "file-reject",
          sessionId,
          cwd,
          recordId: record.id,
          path: record.path,
          previous: keep ? void 0 : snapshot
        });
      }
      props.onChanged?.();
      notifyReviewChanged();
      if (after === "file") props.onFileDone?.();
    } catch {
      setState((prev) => prev === null ? { before: "", after: "", current: "", binary: false, error: true, gone: false, live: false } : { ...prev, error: true, gone: false });
    } finally {
      setBusy(false);
    }
  };
  const revert = (direction) => {
    const entry = direction === "undo" ? popReviewUndo(sessionId, record.path) : popReviewRedo(sessionId, record.path);
    if (entry === void 0) return false;
    void (async () => {
      try {
        await applyReviewRevert(remote, entry, direction);
        if (entry.kind === "hunk-accept" && entry.hunkKey !== void 0) {
          setAccepted((prev) => {
            const next = new Set(prev);
            if (direction === "undo") next.delete(entry.hunkKey);
            else next.add(entry.hunkKey);
            return next;
          });
        }
        await reloadLive();
        notifyReviewChanged();
        props.onChanged?.();
      } catch {
      }
    })();
    return true;
  };
  revertRef.current = revert;
  (0, import_react6.useEffect)(() => {
    if (props.visible === false) return;
    return bindReviewKeys(
      () => revertRef.current("undo"),
      () => revertRef.current("redo")
    );
  }, [props.visible]);
  if (state === null) return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh_lh_empty" });
  if (state.error) return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh_lh_error", children: state.gone ? t("snapshotGone") : t("loadFailed") });
  const painted = state.binary ? { rows: [], hunks: [] } : paintFileDiff(state.before, state.after);
  const rows = settleAccepted(painted.rows, accepted);
  const highlighted = highlightRowsHtml(rows);
  const decided = (record.decision ?? "pending") !== "pending";
  const hunkByKey = new Map(
    decided ? [] : painted.hunks.filter((hunk) => !accepted.has(hunk.key)).map((hunk) => [hunk.key, hunk])
  );
  const blocks = groupPaintRows(rows.map((row, index) => ({ ...row, html: highlighted[index] ?? "" })));
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh_lh_root dsh_lh_pane", "data-lh-diff": "", children: [
    !decided && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh_lh_reviewBar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh_lh_reviewHint", children: t("agentEdited") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh_lh_reviewActions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "dsh_lh_button",
            disabled: busy,
            onClick: () => {
              void run(() => remote.rejectFile(sessionId, cwd, record.id), "file");
            },
            children: t("undoFile")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "dsh_lh_button",
            "data-kind": "keep",
            disabled: busy,
            onClick: () => {
              void run(() => remote.acceptFile(sessionId, cwd, record.id), "file", "keep");
            },
            children: t("keepFile")
          }
        )
      ] })
    ] }),
    state.binary ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh_lh_empty", children: t("binaryFile") }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh_lh_fileWrap", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh_lh_file", ref: setFileEl, children: blocks.map((block, blockIndex) => {
        const hunk = block.hunkKey === void 0 ? void 0 : hunkByKey.get(block.hunkKey);
        const range = hunk === void 0 ? "" : hunkRange(hunk);
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "div",
          {
            className: "dsh_lh_block",
            "data-hunk-key": block.hunkKey ?? "",
            children: [
              hunk !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh_lh_inlineBar", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "dsh_lh_button",
                    disabled: busy,
                    onClick: () => {
                      void run(() => remote.rejectHunk(sessionId, cwd, record.id, hunk), "reject-hunk", hunk.key, hunk);
                    },
                    children: t("undoHunk", { range })
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "dsh_lh_button",
                    "data-kind": "keep",
                    disabled: busy,
                    onClick: () => {
                      void run(() => remote.acceptHunk(sessionId, cwd, record.id, hunk.key), "accept-hunk", hunk.key, hunk);
                    },
                    children: t("keepHunk", { range })
                  }
                )
              ] }),
              block.rows.map((row, index) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                "div",
                {
                  className: "dsh_lh_rowLine",
                  "data-mark": row.kind,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh_lh_gutter", children: row.kind === "del" ? "" : row.line ?? "" }),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh_lh_code", dangerouslySetInnerHTML: { __html: row.html } })
                  ]
                },
                `${row.kind}-${row.line ?? "x"}-${index}`
              ))
            ]
          },
          block.hunkKey ?? `ctx-${blockIndex}`
        );
      }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ReviewMinimap, { rows, scrollEl: fileEl, enabled: minimapOn })
    ] })
  ] });
}
function acceptedHunkKeys(record) {
  const keys = /* @__PURE__ */ new Set();
  for (const [key, decision] of Object.entries(record.hunks ?? {})) {
    if (decision === "accepted") keys.add(key);
  }
  return keys;
}
function settleAccepted(rows, accepted) {
  const out = [];
  for (const row of rows) {
    if (row.hunkKey === void 0 || !accepted.has(row.hunkKey)) {
      out.push(row);
      continue;
    }
    if (row.kind === "del") continue;
    out.push({ ...row, kind: "ctx", hunkKey: void 0 });
  }
  return out;
}
function hunkRange(hunk) {
  return hunk.start === hunk.end ? `${hunk.start}` : `${hunk.start}-${hunk.end}`;
}
function groupPaintRows(rows) {
  const blocks = [];
  for (const row of rows) {
    const key = row.hunkKey;
    const last = blocks[blocks.length - 1];
    if (last !== void 0 && last.hunkKey === key) last.rows.push(row);
    else blocks.push({ hunkKey: key, rows: [row] });
  }
  return blocks;
}

// src/client/SplitDiffView.tsx
var import_react7 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
function SplitDiffView(props) {
  const t = props.t ?? lookup;
  const { seed, remote } = props;
  const minimapOn = useEditorMinimap(props.prefs);
  const [state, setState] = (0, import_react7.useState)(null);
  const leftRef = (0, import_react7.useRef)(null);
  const rightRef = (0, import_react7.useRef)(null);
  const [rightEl, setRightEl] = (0, import_react7.useState)(null);
  const syncingRef = (0, import_react7.useRef)(false);
  const setRightPane = (node) => {
    rightRef.current = node;
    setRightEl(node);
  };
  const leftHash = seed.leftHash ?? "";
  const rightHash = seed.rightHash ?? "";
  const leftSession = seed.leftSessionId ?? seed.sessionId;
  const rightSession = seed.rightSessionId ?? seed.sessionId;
  const cwd = seed.cwd;
  (0, import_react7.useEffect)(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const left = leftHash === "" ? "" : unwrapResult(await remote.readBlob(leftSession, cwd, leftHash)).content;
        const right = rightHash === "" ? "" : unwrapResult(await remote.readBlob(rightSession, cwd, rightHash)).content;
        if (!cancelled) setState({ left, right, error: false, gone: false });
      } catch (loadError) {
        if (!cancelled) setState({ left: "", right: "", error: true, gone: String(loadError).includes("ENOENT") });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [cwd, leftHash, leftSession, rightHash, rightSession]);
  const rows = (0, import_react7.useMemo)(
    () => state === null || state.error ? [] : paintSplitDiff(state.left, state.right).rows,
    [state]
  );
  const highlighted = (0, import_react7.useMemo)(() => splitHighlighted(rows), [rows]);
  const syncScroll = (source, target) => {
    if (syncingRef.current) return;
    const vSpan = source.scrollHeight - source.clientHeight;
    const hSpan = source.scrollWidth - source.clientWidth;
    const targetTop = vSpan <= 0 ? target.scrollTop : source.scrollTop / vSpan * (target.scrollHeight - target.clientHeight);
    const targetLeft = hSpan <= 0 ? target.scrollLeft : source.scrollLeft / hSpan * (target.scrollWidth - target.clientWidth);
    if (Math.abs(target.scrollTop - targetTop) < 1 && Math.abs(target.scrollLeft - targetLeft) < 1) return;
    syncingRef.current = true;
    target.scrollTop = targetTop;
    target.scrollLeft = targetLeft;
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };
  if (state === null) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh_lh_empty" });
  if (state.error) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh_lh_error", children: state.gone ? t("snapshotGone") : t("loadFailed") });
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh_lh_root dsh_lh_split", "data-lh-split": "", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh_lh_splitHeads", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh_lh_splitHead", children: t("compareLeft", { hash: shortHash(seed.leftHash) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh_lh_splitHead", children: t("compareRight", { hash: shortHash(seed.rightHash) }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh_lh_splitBody", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh_lh_splitPanes", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "div",
          {
            ref: leftRef,
            className: "dsh_lh_splitPane",
            onScroll: (event) => {
              const target = rightRef.current;
              if (target !== null) syncScroll(event.currentTarget, target);
            },
            children: highlighted.map((row, index) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh_lh_rowLine", "data-mark": row.left.kind, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh_lh_gutter", children: row.left.line ?? "" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh_lh_code", dangerouslySetInnerHTML: { __html: row.leftHtml } })
            ] }, index))
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "div",
          {
            ref: setRightPane,
            className: "dsh_lh_splitPane",
            onScroll: (event) => {
              const target = leftRef.current;
              if (target !== null) syncScroll(event.currentTarget, target);
            },
            children: highlighted.map((row, index) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh_lh_rowLine", "data-mark": row.right.kind, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh_lh_gutter", children: row.right.line ?? "" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh_lh_code", dangerouslySetInnerHTML: { __html: row.rightHtml } })
            ] }, index))
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        ReviewMinimap,
        {
          rows: highlighted.map((row) => ({ kind: row.right.kind, text: row.right.text })),
          scrollEl: rightEl,
          enabled: minimapOn
        }
      )
    ] })
  ] });
}
function splitHighlighted(rows) {
  let leftMode = "code";
  let rightMode = "code";
  return rows.map((row) => {
    const left = highlightLineHtml(row.left.text, row.left.kind === "empty" ? leftMode : leftMode);
    const right = highlightLineHtml(row.right.text, row.right.kind === "empty" ? rightMode : rightMode);
    if (row.left.kind !== "empty") leftMode = left.mode;
    if (row.right.kind !== "empty") rightMode = right.mode;
    return { ...row, leftHtml: left.html, rightHtml: right.html };
  });
}

// src/client/styles.ts
var STYLE_ID = "dsh-local-history-style";
var cssText = `
.dsh_lh_root {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  font: inherit;
}
.dsh_lh_filters {
  display: flex;
  flex: none;
  gap: 6px;
  padding: 6px 10px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dsh_lh_filter {
  flex: none;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dsh_lh_filter:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh_lh_filter[aria-selected='true'] {
  background: var(--dsw-alias-button-ghost-active-fill);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
.dsh_lh_pendingCount {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}
.dsh_lh_toolbarGrow {
  flex: 1 1 auto;
  min-width: 0;
}
.dsh_lh_body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}
.dsh_lh_list {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.dsh_lh_list[data-lh-full=''] {
  width: 100%;
  max-width: none;
  border-right: 0;
}
.dsh_lh_pane {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.dsh_lh_group {
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.dsh_lh_group:first-child {
  border-top: 0;
}
.dsh_lh_groupHeader {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px 4px;
}
.dsh_lh_groupMeta {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.dsh_lh_groupTurn {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}
.dsh_lh_groupTime,
.dsh_lh_groupCount {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}
.dsh_lh_groupPrompt {
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_lh_row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 6px;
  padding: 4px 8px;
  border-radius: 8px;
  min-width: 0;
}
.dsh_lh_row:hover,
.dsh_lh_row[data-selected='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh_lh_rowMain {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh_lh_kind {
  flex: none;
  width: 20px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 700;
}
.dsh_lh_kind[data-kind='add'],
.dsh_lh_name[data-kind='add'],
.dsh_lh_location[data-kind='add'] { color: var(--dsw-alias-state-success-primary); }
.dsh_lh_kind[data-kind='delete'],
.dsh_lh_name[data-kind='delete'],
.dsh_lh_location[data-kind='delete'] { color: var(--dsw-alias-state-error-primary); }
.dsh_lh_kind[data-kind='edit'],
.dsh_lh_name[data-kind='edit'],
.dsh_lh_location[data-kind='edit'] { color: var(--dsw-alias-state-business-primary); }
.dsh_lh_name {
  flex: none;
  max-width: 55%;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_lh_location {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_lh_module {
  flex: none;
  max-width: 28%;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_lh_rowActions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dsh_lh_chevron {
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 22px;
  cursor: pointer;
}
.dsh_lh_chevron:hover,
.dsh_lh_chevron[aria-expanded='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh_lh_status {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}
.dsh_lh_empty,
.dsh_lh_error {
  padding: 16px 12px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}
.dsh_lh_error {
  color: var(--dsw-alias-state-error-primary);
}
.dsh_lh_toolbar {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dsh_lh_button {
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dsh_lh_button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh_lh_button:disabled {
  opacity: 0.45;
  cursor: default;
}
.dsh_lh_button[data-kind='danger']:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
}
.dsh_lh_button[data-kind='keep'] {
  border: 0;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-inverted);
}
.dsh_lh_button[data-kind='keep']:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-inverted);
  filter: brightness(1.05);
}
.dsh_lh_reviewBar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dsh_lh_reviewHint {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.dsh_lh_reviewActions {
  display: flex;
  flex: none;
  gap: 6px;
}
.dsh_lh_fileWrap {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  --dsh-lh-minimap: min(120px, calc(100% / 6));
}
.dsh_lh_file {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 20px;
}
.dsh_lh_block {
  position: relative;
}
.dsh_lh_inlineBar {
  position: absolute;
  top: 2px;
  right: calc(8px + var(--dsh-lh-minimap, 0px));
  z-index: 1;
  display: none;
  gap: 4px;
}
.dsh_lh_block:hover .dsh_lh_inlineBar {
  display: flex;
}
.dsh_lh_inlineBar .dsh_lh_button {
  height: 24px;
  padding: 0 10px;
  font-size: 11px;
}
.dsh_lh_rowLine {
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  min-width: 0;
  width: 100%;
  white-space: pre;
}
.dsh_lh_gutter {
  flex: none;
  box-sizing: border-box;
  width: 40px;
  padding: 0 8px 0 0;
  border-right: 3px solid transparent;
  color: var(--dsw-alias-label-tertiary);
  text-align: right;
  user-select: none;
}
.dsh_lh_code {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 12px 0 8px;
}
.dsh_lh_code [data-tok='kw'],
.dsh_lh_rowLine[data-mark] .dsh_lh_code [data-tok='kw'] {
  color: var(--dsw-alias-brand-primary);
}
.dsh_lh_code [data-tok='str'],
.dsh_lh_rowLine[data-mark] .dsh_lh_code [data-tok='str'] {
  color: var(--dsw-alias-state-success-primary);
}
.dsh_lh_code [data-tok='cmt'],
.dsh_lh_rowLine[data-mark] .dsh_lh_code [data-tok='cmt'] {
  color: var(--dsw-alias-label-tertiary);
}
.dsh_lh_code [data-tok='fn'],
.dsh_lh_rowLine[data-mark] .dsh_lh_code [data-tok='fn'] {
  color: var(--dsw-alias-label-primary);
}
.dsh_lh_rowLine[data-mark='del'] {
  background: var(--dsw-alias-state-error-bg);
}
.dsh_lh_rowLine[data-mark='del'] .dsh_lh_gutter {
  border-right-color: var(--dsw-alias-state-error-primary);
}
.dsh_lh_rowLine[data-mark='del'] .dsh_lh_code {
  text-decoration: line-through;
}
.dsh_lh_rowLine[data-mark='add'] {
  background: color-mix(in srgb, var(--dsw-alias-state-success-bg) 55%, transparent);
}
.dsh_lh_rowLine[data-mark='add'] .dsh_lh_gutter {
  border-right-color: var(--dsw-alias-state-success-primary);
}
.dsh_lh_rowLine[data-mark='empty'] {
  background: var(--dsw-alias-bg-layer-2, transparent);
}
.dsh_lh_drift {
  padding: 4px 12px;
  color: var(--dsw-alias-state-warning-primary);
  font-size: 12px;
}
.dsh_lh_timeline {
  flex: none;
  min-height: 0;
  margin: 0 12px 8px 36px;
  overflow: auto;
  border-left: 1px solid var(--dsw-alias-border-l1);
}
.dsh_lh_timeRow {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh_lh_timeRow:hover,
.dsh_lh_timeRow[data-selected='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh_lh_timeWhen {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
.dsh_lh_timeSession {
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_lh_snapshot {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.dsh_lh_snapBody {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 18px;
}
.dsh_lh_snapGutter {
  flex: none;
  margin: 0;
  padding: 8px 8px 8px 12px;
  border-right: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-tertiary);
  text-align: right;
  user-select: none;
}
.dsh_lh_snapCode {
  flex: 1 1 auto;
  margin: 0;
  padding: 8px 12px;
  min-width: 0;
  white-space: pre;
}
.dsh_lh_snapCode [data-tok='kw'] { color: var(--dsw-alias-brand-primary); }
.dsh_lh_snapCode [data-tok='str'],
.dsh_lh_snapCode [data-tok='cmt'] { color: var(--dsw-alias-state-success-primary); }
.dsh_lh_snapCode [data-tok='fn'] { color: var(--dsw-alias-label-primary); }
.dsh_lh_split {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.dsh_lh_splitHeads {
  display: grid;
  flex: none;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dsh_lh_splitHead {
  overflow: hidden;
  padding: 6px 12px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_lh_splitHead + .dsh_lh_splitHead {
  border-left: 1px solid var(--dsw-alias-border-l2);
}
.dsh_lh_splitBody {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 20px;
}
.dsh_lh_splitPanes {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}
.dsh_lh_minimap {
  position: relative;
  flex: none;
  width: min(120px, calc(100% / 6));
  min-height: 0;
  overflow: hidden;
  cursor: pointer;
  border-left: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
}
.dsh_lh_minimapCanvas {
  display: block;
  width: 100%;
  height: 100%;
}
.dsh_lh_minimapOverlay {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
}
/* Each side is its own scrollable pane: own vertical + horizontal scrollbar,
   vertical scrolling synced from the component. */
.dsh_lh_splitPane {
  flex: 1 1 50%;
  min-width: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--dsw-alias-border-l2) transparent;
}
.dsh_lh_splitPane + .dsh_lh_splitPane {
  border-left: 1px solid var(--dsw-alias-border-l2);
}
/* Rows size to their content (at least the pane width) so long lines widen
   the pane's scroll area instead of bleeding into the neighbor column. */
.dsh_lh_splitPane .dsh_lh_rowLine {
  width: max-content;
  min-width: 100%;
}
/* Line numbers stay pinned to the pane edge while the code scrolls
   horizontally (sticky-left); they still scroll vertically with the rows.
   Opaque per-mark backgrounds hide the code sliding underneath. */
.dsh_lh_splitPane .dsh_lh_gutter {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--dsw-alias-bg-layer-1);
}
.dsh_lh_splitPane .dsh_lh_rowLine[data-mark='del'] .dsh_lh_gutter {
  background: var(--dsw-alias-state-error-bg);
}
.dsh_lh_splitPane .dsh_lh_rowLine[data-mark='add'] .dsh_lh_gutter {
  background: color-mix(in srgb, var(--dsw-alias-state-success-bg) 55%, transparent);
}
.dsh_lh_splitPane .dsh_lh_rowLine[data-mark='empty'] .dsh_lh_gutter {
  background: var(--dsw-alias-bg-layer-2, transparent);
}
.dsh_lh_splitPane::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.dsh_lh_splitPane::-webkit-scrollbar-track {
  background: transparent;
}
.dsh_lh_splitPane::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-border-l2);
  border: 2px solid transparent;
  border-radius: 6px;
  background-clip: padding-box;
}
.dsh_lh_splitPane::-webkit-scrollbar-thumb:hover {
  background: var(--dsw-alias-label-tertiary);
  border: 2px solid transparent;
  border-radius: 6px;
  background-clip: padding-box;
}
.dsh_lh_badge {
  flex: none;
  padding: 1px 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.dsh_lh_badge[data-source='agent'] {
  color: var(--dsw-alias-brand-primary);
}
.dsh_lh_settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 4px 0;
}
.dsh_lh_settingRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.dsh_lh_settingRow input[type='number'] {
  box-sizing: border-box;
  width: 88px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
.dsh_lh_settingRow input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--dsw-alias-brand-primary);
}
`;
function adoptStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.dataset.plugin = "dsh-local-history";
  style.dataset.pluginCss = STYLE_ID;
  style.textContent = cssText;
  document.head.appendChild(style);
}

// src/client/index.ts
var inject = ["remote", "slots", "locale", "sessions"];
function reviewTabIcon(size) {
  return (0, import_react8.createElement)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      xmlns: "http://www.w3.org/2000/svg",
      "aria-hidden": true
    },
    (0, import_react8.createElement)("rect", {
      x: "2",
      y: "1.5",
      width: "9.5",
      height: "13",
      rx: "1.5",
      stroke: "currentColor",
      strokeWidth: "1.5"
    }),
    (0, import_react8.createElement)("path", {
      d: "M4.25 5.25h5M4.25 8h5M4.25 10.75h2.75",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round"
    }),
    (0, import_react8.createElement)("path", {
      d: "m10.25 9.5 1.5 1.5 3-3",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    })
  );
}
function bindT(ctx) {
  if (typeof ctx.locale.bind === "function") return ctx.locale.bind(NS);
  return lookup;
}
function resolveRemote(ctx) {
  const face = ctx.reflect?.get("remote.localHistory");
  return face;
}
function ReviewTab(props) {
  const t = bindT(props.ctx);
  const remote = resolveRemote(props.ctx);
  if (remote === void 0) {
    return (0, import_react8.createElement)("div", { className: "dsh_lh_error" }, t("loadFailed"));
  }
  return (0, import_react8.createElement)(ReviewApp, {
    scope: props.scope,
    visible: props.visible,
    remote,
    sessions: props.ctx.sessions,
    t,
    onOpenCompare: (seed) => {
      props.sidebar?.openTab?.({
        type: COMPARE_TAB,
        title: fileNameOf(seed.path),
        path: seed.path,
        id: compareTabId(seed),
        meta: seed
      }, props.scope);
    },
    onOpenReview: (record) => {
      props.sidebar?.openTab?.({
        type: REVIEW_TAB,
        title: fileNameOf(record.path),
        path: record.path,
        id: reviewTabId(record),
        meta: record
      }, props.scope);
    }
  });
}
function apply(ctx) {
  adoptStyles();
  ctx.locale.register(NS, { zh, en });
  void ctx.remote.$mount(LOCAL_HISTORY_REMOTE);
  ctx.inject(["betterSidebar"], (scope) => {
    const sidebar = scope.betterSidebar ?? scope.get?.("betterSidebar");
    if (sidebar === void 0) return;
    const t = bindT(ctx);
    ctx.effect(() => subscribePending(() => {
      sidebar.updateTab?.("dsh-local-history:review", { meta: { pending: getPendingCount() } });
    }), "dsh-local-history: badge bump");
    ctx.effect(() => sidebar.registerTab({
      id: "dsh-local-history:review",
      title: () => t("reviewTitle"),
      icon: reviewTabIcon,
      order: 26,
      single: true,
      badge: () => pendingBadge(),
      settings: {
        pluginToggles: [
          { key: "watchEnabled", type: "switch", title: () => t("watchEnabled") },
          { key: "maxPerFile", type: "number", title: () => t("maxPerFile"), min: 1, max: 200 },
          { key: "maxBytesMb", type: "number", title: () => t("maxBytesMb"), min: 16, max: 2048, unit: t("unitMb") },
          { key: "retentionDays", type: "number", title: () => t("retentionDays"), min: 1, max: 365, unit: t("unitDays") }
        ],
        render: () => {
          const remote = resolveRemote(ctx);
          if (remote === void 0) return (0, import_react8.createElement)("div", { className: "dsh_lh_error" }, t("loadFailed"));
          return (0, import_react8.createElement)(SettingsPanel, { remote, t });
        }
      },
      component: (props) => (0, import_react8.createElement)(ReviewTab, {
        ctx,
        sidebar,
        scope: props.scope,
        visible: props.visible
      })
    }), "dsh-local-history: review tab");
    ctx.effect(() => sidebar.registerTab({
      id: COMPARE_TAB,
      title: () => t("compareTitle"),
      order: -1,
      hidden: true,
      dedupeKey: (tab) => tab.id,
      component: (props) => {
        const remote = resolveRemote(ctx);
        const seed = isCompareSeed(props.tab?.meta) ? props.tab.meta : void 0;
        if (remote === void 0 || seed === void 0) {
          return (0, import_react8.createElement)("div", { className: "dsh_lh_error" }, t("loadFailed"));
        }
        return (0, import_react8.createElement)(SplitDiffView, { seed, remote, t, prefs: sidebar });
      }
    }), "dsh-local-history: compare tab");
    ctx.effect(() => sidebar.registerTab({
      id: REVIEW_TAB,
      title: () => t("agentEdited"),
      order: -1,
      hidden: true,
      dedupeKey: (tab) => tab.id,
      component: (props) => {
        const remote = resolveRemote(ctx);
        const record = isHistoryRecord(props.tab?.meta) ? props.tab.meta : void 0;
        if (remote === void 0 || record === void 0) {
          return (0, import_react8.createElement)("div", { className: "dsh_lh_error" }, t("loadFailed"));
        }
        return (0, import_react8.createElement)(DiffView, {
          record,
          sessionId: props.scope.sessionId,
          cwd: props.scope.cwd,
          remote,
          t,
          prefs: sidebar,
          afterHash: record.hash,
          visible: props.visible,
          onRecord: (next) => {
            if (props.tab?.id !== void 0) sidebar.updateTab?.(props.tab.id, { meta: next });
          },
          onFileDone: () => {
            if (props.tab?.id !== void 0) sidebar.closeTab?.(props.tab.id, props.scope);
          }
        });
      }
    }), "dsh-local-history: change tab");
  });
}
return module.exports; } });
//# sourceMappingURL=client.js.map
