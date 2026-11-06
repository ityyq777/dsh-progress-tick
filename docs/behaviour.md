# 行为

| Situation | What happens |
| --- | --- |
| A run starts (`idle → running`) | The timer starts here; per-turn counters reset |
| `intervalMinutes` elapse without an informative report | One `notice` is appended before the next request |
| The model writes an **informative** report | Timer re-anchors (see below) |
| The run finishes before the interval | Timer resets; the next run starts from zero |
| The user sends a message mid-run (`source.kind === 'user'`) | No nudge on that step — the step already carries a fresh human message, so the timer simply re-anchors |
| Subagents / teammates | Never nudged (`delegationDepth > 0` or `origin === 'subagent'`) |

## What counts as "already reported"

Not every visible sentence resets the timer — otherwise a quick "ok, continuing"
would silently defeat the whole point. A reply counts only when **either**:

- the text emitted since the last report is at least `minReportChars` characters, **or**
- it contains one of the `reportMarkers` keywords (`完成`, `发现`, `下一步`, … ).

Both are configurable.

## Escalation

- **Back-off**: after `backoffAfter` nudges in one turn, the effective interval is
  multiplied by `backoffFactor` (capped at 8×), so a long turn does not turn into
  a stream of reminders.
- **Stuck detection**: when the same action (tool + target) repeats
  `stuckThreshold` times in a row, the reminder changes from "report progress" to
  "are you stuck? say where and what you already tried".
- **Detail level**: every `detailEvery`-th reminder includes a compact summary of
  the most recent actions (tool name + target + failure marker) and subagent
  status, so the model has something concrete to report.

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
