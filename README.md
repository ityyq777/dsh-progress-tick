# dsh-progress-tick

Nudge the **main agent** of every DSH session to report progress every 5 minutes
while a task is running.

> A long task usually means minutes of silence: the agent keeps calling tools and
> never says anything. This plugin watches the agent's run/stop and output
> activity, and once a run has been silent for the interval it appends a short
> `notice` message before the model's next request, asking it to state what it is
> doing, what is done, and what comes next — before it calls the next tool.

## Behaviour

| Situation | What happens |
| --- | --- |
| A run starts (`idle → running`) | The timer starts here |
| `intervalMinutes` elapse with no visible output | One `notice` is appended before the next request |
| The model writes any text (even one sentence before a tool call) | Counted as a report; the timer re-anchors |
| The run finishes before the interval | Timer resets; the next run starts from zero |
| Subagents / teammates | Never touched (`delegationDepth > 0` or `origin === 'subagent'`) |

Only the main agent is affected, and only while it is executing. Nothing is
written into the conversation history or the prompt cache: the notice is produced
at request-assembly time.

## Install

```sh
dsh plugin --profile web add dsh-progress-tick
```

## Configure

**Settings → Plugins → `progress-tick`** exposes a form:

| Field | Meaning |
| --- | --- |
| Enable | Turn the reminders off entirely |
| Interval (minutes) | How long a run may stay silent, default 5; 10 s – 24 h |

The form is generated from the plugin's schemastery `Config`; edits are written to
the profile's `cordis.patch.yml` under `id: progress-tick` and the entry is
hot-reloaded, so no restart is needed. A `settings.json` next to `index.js` is
honoured too and takes precedence when present.

## Chinese docs

下面的中文说明是本插件最初的文档，内容与上面一致。

---

让 **主 agent** 在长任务执行期间，每 5 分钟自动向用户播报一次进度。

## 行为

| 场景 | 行为 |
| --- | --- |
| 一轮任务开始执行（agent `idle → running`） | 从此刻开始计时 |
| 执行满 5 分钟仍没有可见汇报 | 在模型下一次请求前追加一条 `notice` 提醒，要求它先说明进度再继续干活 |
| 模型自己输出了正文（哪怕是工具调用前的一句话） | 视为已汇报，计时重新锚定，5 分钟后才可能再催 |
| 一轮在 5 分钟内结束 | 计时清零；下一轮重新从 0 开始 |
| 子 agent / 团队成员 | 完全不介入（`session.header.delegationDepth > 0` 或 `origin === 'subagent'`） |

## 安装位置

- 源码：`~/.dsh/plugins/progress-tick/`
- 以 `link:` 方式装进 `~/.dsh/profiles/web`；挂载点为 profile 的 `cordis.patch.yml`：
  `- insert: [{ id: progress-tick, name: dsh-progress-tick }]`

## 时长设置

优先级：`settings.json` > 页面/配置层 > 默认 5 分钟。

1. **页面上（推荐，不用改文件）** —— DSH 里 **设置 → 插件（插件管理）**，在列表里点开
   `progress-tick` 这一行，详情页会出现配置表单：

   | 表单项 | 含义 |
   | --- | --- |
   | 启用进度提醒 | `false` 整体关闭 |
   | 提醒间隔（分钟） | 连续这么久没汇报就提醒一次，默认 5；范围 10 秒 ~ 24 小时 |

   表单由插件导出的 schemastery `Config` 生成，字段标了 `.volatile()` 才会出现在页面上；
   改动写进 profile 的 `cordis.patch.yml`（`id: progress-tick` 的 `config:`），Host 会热重生该条目。
   注意：如果当时跑着的进程加载的还是没有 `Config` 导出的旧模块，表单要等下次 `dsh web` 启动才出现。

2. **`settings.json`（可选，存在时优先，改完即时生效）** —— 本目录下：

   ```json
   { "enabled": true, "interval": "5m" }
   ```

   | 字段 | 含义 |
   | --- | --- |
   | `interval` | 带单位：`"90s"` `"5m"` `"1.5h"` `"5分钟"`；裸数字视作分钟 |
   | `intervalMs` | 毫秒：`300000` |
   | `minutes` | 分钟数：`5` |
   | `enabled` | `false` 整体关闭 |

   默认不生成这个文件（让页面设置直接生效）；建了它就盖过页面设置。

3. 也可以直接跟我说「改成 3 分钟」，我改文件。

允许范围 10 秒 – 24 小时；非法值/坏 JSON 自动回落到默认 5 分钟，不会中断任务。

## 实现要点

只观察公开事件、只在已有的 pre-step 边界追加一条 `form: 'notice'` 的 user 消息：

- `agent/status` — 轮次开始 / 结束，负责计时起点与清零
- `agent/assistant-stream` — 检测 `text-delta`，判定「模型刚刚说过话」
- `agent/pre-step` — 到点时往本次请求里追加提醒

不新建模型请求、不改工具、不接管 UI。

## 已知边界

提醒只能在「模型两次请求之间」送达。如果某一步是单个超长工具调用
（例如一次跑 20 分钟的命令），提醒会等这一步结束、模型再次请求时才到达——
因为工具执行期间模型本身没有在说话，任何插件都无法让它中途开口。

## 自测

```bash
node test.mjs   # 10 项逻辑断言，覆盖计时、注入、子 agent、轮次清零
```
