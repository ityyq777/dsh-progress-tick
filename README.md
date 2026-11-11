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

> 安装：GUI 插件面板/插件市场点「安装」，或使用 npm 包名 `dsh-progress-tick`、GitHub 地址安装；桌面端 CLI 与各安装方式详见 [docs/install.md](docs/install.md)。

## 功能速览

- **定期提醒**：连续执行超过设定间隔且没有“有信息量的汇报”时，在下一个 step 注入一条 `notice`；子 agent 永不提醒。
- **卡住检测**：同一动作连续重复到阈值时，提醒改口问“你卡在哪、试过什么”。
- **退避与上限**：单轮提醒越多间隔越长（封顶 8×），可设每轮次数上限。
- **任务驾驶舱**：左侧栏会话总览 + 每个会话的「进度」标签页（提醒记录、最近汇报正文、当前工具耗时、子 agent 树），支持立即催一次 / 本会话静音。
- **`/progress` 命令**：不等计时器，随时让主 agent 立刻汇报。
- **设置页**：全部配置项内置表单，改动即时生效。

## 文档

| 想了解 | 看这里 |
| --- | --- |
| 怎么装（GUI / 命令行 / 本地开发 / npm / 桌面端），以及为什么有的命令装不上 | [docs/install.md](docs/install.md) |
| 为什么它比你自己插话问进度更管用（设计取舍） | [docs/design-why.md](docs/design-why.md) |
| 运行行为：计时、汇报判定、退避、卡住升级、已知限制 | [docs/behaviour.md](docs/behaviour.md) |
| 全部配置项、设置页、`/progress`、状态文件 | [docs/configuration.md](docs/configuration.md) |
| 界面：任务驾驶舱、「进度」标签页、HTTP/SSE 数据通道与防护 | [docs/ui.md](docs/ui.md) |

## 版本与反馈

- Releases：<https://github.com/ityyq777/dsh-progress-tick/releases>
- Issues：<https://github.com/ityyq777/dsh-progress-tick/issues>
- 自测：仓库根目录 `node test.mjs`（零依赖）。
