# 任务驾驶舱（v0.5.0）实施计划

## 用户需求（原文，m00404）

> 状态页升级成"任务驾驶舱"：单会话详情抽屉（每次提醒的时间/原因/是计时还是卡住触发、最近动作时间线、当前工具已耗时、子 agent 树），加筛选/搜索/"立即催一次"/"本会话静音"。后两个需要 POST 路由，顺手把 P1 的防护做掉。
> SSE 替代轮询：scope.webServer.register({ kind: 'prefix' }) 起一条 /api/progress-tick/events，提醒/状态变化时推送，轮询保留兜底。省 CPU，也为后续"催了立刻在 UI 上看到"打基础。

## 已验证的 DSH 事实（0.2.0-rc.2）

- `scope.webServer.register({kind:'exact'|'prefix', path, handler})`，handler 是 Node `(req,res)`；**exact 表优先于 prefix 表**，所以 `/api/progress-tick/*` 用 exact 注册不会被 client-connection 的 `/api` prefix 抢走。
- webServer 自身**不做认证**；`/api` 的鉴权在 client-connection 的 prefix handler 里，我们的 exact 路由绕过它 → 必须自己做防护。
- `session/event` 里 `session.header.parentSession` 指向父会话（子 agent 事件也会发）。
- 没有子 agent 名称/标签字段，名称取会话标题。

## Host 侧（index.js）——已改

- 状态新增：`toolStartedAt/currentTool`、`nudgeReasons[]`、`lastNudgeAt`、`mute`、`force`、子会话 `kind:child|main`、`children[]`、`lastEventType`、`lastEventAt`、`actions {kind, name, target, ok, at, ms}`。
- 快照新增：`nudged`、`muted`、`currentTool{name,target,elapsedMs}`、`yourTurnMs`、`nudgeReasons`、`stuck`、`actions`、`children`、`subagentTree`、`tools`、`session`（会话维度字段）。
- `noteChildEvent` 跟踪子 agent 工具耗时；`setMuted`、`requestNudge`。
- HTTP：`/api/progress-tick/{status,events,nudge,mute}`；写操作四重防护（loopback + Host 白名单 + 同源 + `x-progress-tick: 1` + JSON + 4KB + 限流 10/秒）。
- SSE：`broadcastSnapshot()`、`scheduleBroadcast(80ms 合并)`、心跳 25s、慢客户端丢帧、最多 8 个订阅者。

## 待完成（按顺序）

1. `apply()`：`configForBroadcast = () => baseConfig`；`registerStatusRoute` → `registerHttpRoutes`；在 status/tool-call/tool-result/nudge/mute/子会话事件处调用 `scheduleBroadcast()`；pre-step 支持 `state.force`（reason=manual，不受间隔/上限约束）与 `state.mute`；`finishAction`/`currentTool` 收尾；写盘 payload 带上 nudgeReasons。
2. client/client.js：详情抽屉（时间线、当前工具计时、子 agent 树、催一次、静音）、搜索/筛选；EventSource 订阅 + 2s 轮询兜底（断线 >5 次退回轮询）。
3. 测试：防护（跨域/跨站/缺头/超限/限流/未知会话）、SSE 帧格式、requestNudge 状态机、快照字段。
4. README + CHANGELOG，版本 0.5.0；`node --test`；commit + push。
5. 提醒用户：重启 dsh 后生效。

## 注意

- 本会话里 agent 工具调用被 context 压缩影响，改动前先 `git diff`/重读文件确认。
- PAT 已泄露在聊天里，建议轮换。
