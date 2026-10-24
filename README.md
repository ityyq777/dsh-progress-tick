# dsh-progress-tick

Nudge the **main agent** of every DSH session to report progress while a task is
running — at a configurable interval, with optional recent-action summaries,
exponential back-off, stuck detection, and a `/progress` command for on-demand
reports.

> A long task usually means minutes of silence: the agent keeps calling tools and
> never says anything. This plugin watches the agent's run/stop and output
> activity, and once a run has gone quiet for the interval it appends a short
> `notice` message before the model's next request, asking it to state what it is
> doing, what is done, and what comes next — before it calls the next tool.

## 设置页

重启 `dsh web` 后，**设置 → 进度播报** 会出现一个独立分区（与「插件市场」同级，走的是官方的 `settings.section` 槽），可以直接改全部配置：

- 开关是 DSH 原生风格，输入框/按钮跟随主题（只依赖 `currentColor` 与 `--dsw-radius-*`，浅色/深色/换肤都融合）
- 改动点「保存」立刻写进设置文档并对当前进程生效，无需重启
- 「恢复默认」清掉本插件的用户覆盖
- 语言字段是下拉（auto / zh / en）

## 任务驾驶舱（左侧栏「进度播报」）

0.5.0 起，左侧栏一级入口（与「插件 / 任务看板 / SSH」同级）是一个**任务驾驶舱**，0.5.1 起单会话详情从浮层抽屉改为会话视图里的「进度」标签页：

- **会话列表**：标题、工作区、已运行时长、本轮提醒次数、最近动作、下次提醒倒计时、疑似卡住标记
- **搜索与筛选**：按标题 / 会话 ID / 目录搜索；筛选「全部 / 运行中 / 已提醒 / 疑似卡住 / 已静音 / 已结束」
- **会话「进度」标签页**（在「对话」「轨迹」之后，点列表卡片跳转过去）：
  - 每次提醒的**时间、原因**（计时到期 / 疑似卡住 / 手动）与触发时已运行时长
  - **最近动作时间线**：工具名、参数摘要、耗时、失败标记
  - **当前工具已耗时**：面板每秒走表，不需要等下一次快照
  - **子 agent 树**：名称/标题、运行时长、静默时长、当前工具、停滞标记
- **立即催一次**：给该会话排一次手动提醒，下一个 step 生效（不受间隔与轮次上限约束）
- **本会话静音**：只挡自动提醒，`/progress` 与「立即催一次」仍然有效；内存态，重启即清

### 数据通道

| 端点 | 说明 |
| --- | --- |
| `GET /api/progress-tick/status` | 全量快照（轮询兜底） |
| `GET /api/progress-tick/events` | SSE，`snapshot` 事件推送同一份快照；25s 心跳 |
| `POST /api/progress-tick/nudge` | `{ sessionId }` 手动催一次 |
| `POST /api/progress-tick/mute` | `{ sessionId, muted }` 会话静音 |

页面优先用 SSE 实时更新，首帧到达前与断线期间自动退回 5 秒轮询（状态页会显示「实时推送 / 轮询兜底」）。

**防护**：这四条路由绕过 DSH 的 `/api` 认证桥，因此自己做门禁——仅回环地址、`Host` 必须是 `localhost` 或 IP 字面量（防 DNS rebinding）、写操作要求同源 + `content-type: application/json` + `x-progress-tick: 1` 自定义头、4KB 体积上限、每 60 秒 20 次限流。

## Behaviour

| Situation | What happens |
| --- | --- |
| A run starts (`idle → running`) | The timer starts here; per-turn counters reset |
| `intervalMinutes` elapse without an informative report | One `notice` is appended before the next request |
| The model writes an **informative** report | Timer re-anchors (see below) |
| The run finishes before the interval | Timer resets; the next run starts from zero |
| The user sends a message mid-run (`source.kind === 'user'`) | No nudge on that step — the step already carries a fresh human message, so the timer simply re-anchors |
| Subagents / teammates | Never nudged (`delegationDepth > 0` or `origin === 'subagent'`) |

### What counts as "already reported"

Not every visible sentence resets the timer — otherwise a quick "ok, continuing"
would silently defeat the whole point. A reply counts only when **either**:

- the text emitted since the last report is at least `minReportChars` characters, **or**
- it contains one of the `reportMarkers` keywords (`完成`, `发现`, `下一步`, … ).

Both are configurable.

### Escalation

- **Back-off**: after `backoffAfter` nudges in one turn, the effective interval is
  multiplied by `backoffFactor` (capped at 8×), so a long turn does not turn into
  a stream of reminders.
- **Stuck detection**: when the same action (tool + target) repeats
  `stuckThreshold` times in a row, the reminder changes from "report progress" to
  "are you stuck? say where and what you already tried".
- **Detail level**: every `detailEvery`-th reminder includes a compact summary of
  the most recent actions (tool name + target + failure marker) and subagent
  status, so the model has something concrete to report.

## Configuration

The plugin registers its own section in the Settings panel — **Settings →
进度播报** (order 60, right after the built-in sections) — with a generated form
over this table. The same slot (`settings.section`) is the one `dshmarket` uses,
so it shows up wherever that panel is installed.

Saving from the form goes through `remote.settings.mutate()` with revision
fencing; **恢复默认** unsets the fields you overrode. Every field is
`volatile`, so a saved change applies on the next step — no restart, no remount.
You can still edit the values by hand in the profile patch if you prefer.

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Master switch |
| `intervalMinutes` | `5` | Minutes between reminders (min 10 s, max 24 h) |
| `minReportChars` | `40` | Characters of visible text that count as a report |
| `reportMarkers` | `完成,已完成,发现,下一步,…` | Any of these also counts as a report |
| `maxNudgesPerTurn` | `0` | Cap per turn, `0` = unlimited |
| `backoffAfter` | `3` | Nudge count after which back-off starts |
| `backoffFactor` | `2` | Interval multiplier (capped at 8×) |
| `locale` | `auto` | `auto` follows the user's language; or `zh` / `en` |
| `includeActions` | `true` | Include recent-action summary |
| `actionCount` | `3` | How many actions to include |
| `detailEvery` | `2` | Every Nth reminder is the detailed variant |
| `stuckDetection` | `true` | Switch to the "are you stuck?" reminder |
| `stuckThreshold` | `3` | Consecutive identical actions that count as stuck |
| `subagentSummary` | `true` | Mention subagent status in reminders |
| `subagentStaleMinutes` | `10` | A subagent silent this long is reported as stalled |
| `statusFile` | `true` | Write a per-session JSON state file |
| `statusDir` | `""` | State directory, empty = `~/.dsh/progress-tick/status` |
| `commandEnabled` | `true` | Register `/progress` |

## `/progress`

Type `/progress` in a session to have the main agent report immediately, without
waiting for the timer (handy while a long tool call is running — the reminder is
queued and injected before the next request).

## Status file

With `statusFile` enabled, each session writes
`~/.dsh/progress-tick/status/<sessionId>.json` with the current anchor, nudge
count, pending characters, recent actions, and subagent bookkeeping — useful for
external dashboards or debugging. Action targets are parsed out of the tool
arguments and truncated to 160 characters, so the full parameter payload (which
may contain credentials) is never written to disk.

## Install

```sh
dsh plugin --profile web add dsh-progress-tick
```

## Known limits

- **Inside one long tool call** nothing can be injected: `agent/pre-step` only
  fires between steps, so a 10-minute `bash` is only nudged once it returns.
  `maxNudgesPerTurn` and back-off keep that from turning into noise.
- Recent-action summaries rely on `session/event` (`tool/call`, `tool/result`).
  If an event shape changes upstream, reminders still work; only the action
  summary and stuck detection degrade.
- Subagent bookkeeping reads the child session header (`parentSession`,
  `origin`, `delegationDepth`); a session store that re-roots sessions would
  lose that attribution.
