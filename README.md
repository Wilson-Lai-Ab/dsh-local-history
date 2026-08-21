# dsh-local-history

Session-scoped local history and AI change review for the DeepSeek Harness web GUI.

The host snapshots workspace writes into the current DSH session directory. The client optionally registers a better-sidebar tab (`dsh-local-history:review`) that lists this session's AI file edits and a per-file Timeline across remaining sessions in the same project.

The client registers a better-sidebar tab (`dsh-local-history:review`, never the built-in `review` id) with a pending list, own Diff pane, and per-file Timeline. Without better-sidebar the host still watches; the tab is not registered.

## Install

```sh
dsh plugin --profile web add <package-url>
```

Restart `dsh web` after installation so the Host and browser client load the plugin.

`dsh-better-sidebar` is an optional peer (`>=0.12.0`). Without it the host still loads; the review tab is not registered.

## Storage

Snapshots live next to DSH session files, not in sidebar `review.json`:

```text
~/.dsh/sessions/<projectKey>/<sessionId>/local-history/
```

`DSH_SESSIONS_ROOT` overrides the sessions root. Project and session path encoding matches DSH-better-sidebar.
