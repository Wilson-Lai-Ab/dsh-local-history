# dsh-local-history

DeepSeek Harness Web 界面的会话级 Local History 与 AI 改动审查插件。

Host 把工作区写入拍成全文快照，存进当前 DSH 会话目录。Client 可选择向 better-sidebar 注册 tab（`dsh-local-history:review`），列出本会话的 AI 文件改动，以及同一项目下其余会话的文件 Timeline。

Client 向 better-sidebar 注册 tab（`dsh-local-history:review`，不占用内置 `review` id），提供待处理列表、自有 Diff 和时间线。未安装 better-sidebar 时 Host 监视仍工作，只是不注册 tab。

## 安装

```sh
dsh plugin --profile web add <package-url>
```

安装后重启 `dsh web`，让 Host 和浏览器客户端加载插件。

`dsh-better-sidebar` 是可选 peer（`>=0.12.0`）。未安装时 Host 仍可加载，只是不注册审查 tab。

## 存储

快照与 DSH 会话文件同层，不读写 sidebar 的 `review.json`：

```text
~/.dsh/sessions/<projectKey>/<sessionId>/local-history/
```

可用 `DSH_SESSIONS_ROOT` 覆盖会话根目录。项目与会话路径编码与 DSH-better-sidebar 一致。
