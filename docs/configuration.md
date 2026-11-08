# 配置

全部字段的含义与默认值如下。设置页（**设置 → 进度播报**）提供同名表单；你也可以直接改 profile patch 里的值。每个字段都是 `volatile`：保存后下一个 step 即生效，无需重启。

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
| `stuckThreshold` | `3` | Consecutive byte-identical actions (tool + target + arguments) that count as stuck |
| `subagentSummary` | `true` | Mention subagent status in reminders |
| `subagentStaleMinutes` | `10` | A subagent silent this long is reported as stalled |
| `statusFile` | `true` | Write a per-session JSON state file |
| `statusDir` | `""` | State directory, empty = `~/.dsh/progress-tick/status` |
| `commandEnabled` | `true` | Register `/progress` |
| `reportHistoryCount` | `3` | 会话「进度」标签页展示最近几条汇报正文（0 = 不展示） |

## 设置页

重启 `dsh web` 后，**设置 → 进度播报** 会出现一个独立分区（与「插件市场」同级，走的是官方的 `settings.section` 槽），可以直接改全部配置：

- 开关是 DSH 原生风格，输入框/按钮跟随主题（只依赖 `currentColor` 与 `--dsw-radius-*`，浅色/深色/换肤都融合）
- 改动点「保存」立刻写进设置文档并对当前进程生效，无需重启
- 「恢复默认」清掉本插件的用户覆盖
- 语言字段是下拉（auto / zh / en）

Saving from the form goes through `remote.settings.mutate()` with revision
fencing; **恢复默认** unsets the fields you overrode. Every field is
`volatile`, so a saved change applies on the next step — no restart, no remount.

## `/progress` 命令

Type `/progress` in a session to have the main agent report immediately, without
waiting for the timer (handy while a long tool call is running — the reminder is
queued and injected before the next request). 由 `commandEnabled` 控制注册。

## 状态文件

With `statusFile` enabled, each session writes
`~/.dsh/progress-tick/status/<sessionId>.json` with the current anchor, nudge
count, pending characters, recent actions, and subagent bookkeeping — useful for
external dashboards or debugging. Action targets are parsed out of the tool
arguments and truncated to 160 characters, so the full parameter payload (which
may contain credentials) is never written to disk.
