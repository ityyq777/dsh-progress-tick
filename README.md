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

## 状态页（左侧栏「进度播报」）

0.4.0 起，左侧栏一级入口（与「插件 / 任务看板 / SSH」同级）多了一个 **进度播报** 页面：

- 列出当前所有被跟踪的**主 agent 会话**：标题（首条用户消息）、工作区、已运行时长、本轮已提醒次数、最近一次工具动作、是否疑似卡住
- 每个运行中的会话有一条进度条，显示「距上次汇报 / 当前提醒间隔」，右侧是**下次提醒倒计时**
- 数据来自宿主只读接口 `GET /api/progress-tick/status`（仅回环地址可访问），页面每 4 秒刷新一次
- 页面背景使用 `--dsw-alias-bg-layer-2`，文字继承当前主题，深色/浅色/换肤都跟随

## Behaviour

| Situation | What happens |
| --- | --- |
| A run starts (`idle → running`) | The timer starts here; per-turn counters reset |
| `intervalMinutes` elapse without an informative report | One `notice` is appended before the next request |
| The model writes an **informative** report | Timer re-anchors (see below) |
| The run finishes before the interval | Timer resets; the next run starts from zero |
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
external dashboards or debugging.

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
