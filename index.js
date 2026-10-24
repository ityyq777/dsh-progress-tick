/**
 * dsh-progress-tick
 *
 * 让「主 agent」在长任务执行期间定期向用户主动汇报进度。
 *
 * 语义（对齐用户需求）：
 * - 只在主 agent（顶层 session）上生效；子 agent / 团队成员一律跳过。
 * - 计时从这一轮开始执行任务时算起（agent 状态由 idle -> running）。
 * - 若一轮在不足 interval 内结束，计时清零；下一轮重新从 0 开始。
 * - 执行期间每 interval（默认 5 分钟）注入一条一次性的播报提醒，
 *   模型在本步回复正文里先说进度，再继续调用工具。
 * - 只要模型自己输出了正文（assistant 的 text-delta），计时重新锚定，
 *   等价于「它刚刚汇报过」，不会催它重复汇报。
 *
 * 时长可配置，且改完即生效（无需重启）：见 settings.json / 下方 resolveSettings。
 *
 * 实现上只做一件事：在 agent 既有的 pre-step 边界，必要时往本次请求里追加
 * 一条 form:'notice' 的 user 消息。不新建模型请求、不改工具、不碰 UI。
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import Schema from '@deepseek-ai/schemastery'
import os from 'node:os'
import path from 'node:path'

export const name = 'progress-tick'

/**
 * 暴露给 DSH 设置页的表单（schemastery）：设置 → 插件 → progress-tick。
 * Host 会把这里的字段渲染成可编辑控件，改动写回 profile 的配置层并热重生。
 */
export const Config = Schema.object({
  enabled: Schema.boolean()
    .default(true)
    .description('启用进度提醒（只对主 agent 生效）')
    .volatile(),
  intervalMinutes: Schema.number()
    .default(5)
    .description('提醒间隔（分钟）：连续这么久没汇报过，就提醒一次（10 秒 ~ 24 小时，超范围自动夹紧）')
    .volatile(),
})

export const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
export const MIN_INTERVAL_MS = 10 * 1000
export const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000
export const SETTINGS_FILE = path.join(os.homedir(), '.dsh', 'plugins', 'progress-tick', 'settings.json')

const MAX_STATES = 256

/** 秒/毫秒/分/小时，中英文都收。 */
const UNIT_FACTOR = {
  ms: 1,
  毫秒: 1,
  s: 1000,
  sec: 1000,
  secs: 1000,
  秒: 1000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  分钟: 60_000,
  h: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  小时: 3_600_000,
}

/**
 * 解析时长。`"5m"` `"90s"` `"1.5h"` `"5分钟"` `"300000ms"` `"5"`(视作分钟) 都行。
 * @returns {number | undefined} 毫秒；无法解析时返回 undefined
 */
export function parseDuration(input) {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input * 60_000 : undefined // 裸数字＝分钟（给人看的写法）
  }
  if (typeof input !== 'string') return undefined
  const match = /^\s*([0-9]+(?:\.[0-9]+)?)\s*(ms|毫秒|s|sec|secs|秒|m|min|mins|分钟|h|hour|hours|小时)?\s*$/i.exec(
    input,
  )
  if (!match) return undefined
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return undefined
  const factor = UNIT_FACTOR[(match[2] ?? 'm').toLowerCase()] ?? 60_000
  return amount * factor
}

export function clampInterval(value) {
  if (value === undefined || value === null || !Number.isFinite(value)) return DEFAULT_INTERVAL_MS
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(value)))
}

export function formatSpan(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)} 秒`
  const minutes = ms / 60_000
  const text = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1)
  return `${text} 分钟`
}

/** settings.json 的 mtime 缓存：每个 pre-step 只做一次 statSync。 */
let cache = { key: '', value: {} }

/** 读取可变设置文件；文件不存在或坏掉时返回 {}（并只警告一次）。 */
export function readSettings(file = SETTINGS_FILE, onError) {
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    cache = { key: '', value: {} }
    return {}
  }
  const key = `${file}:${stat.mtimeMs}:${stat.size}`
  if (cache.key === key) return cache.value
  let value = {}
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed
  } catch (error) {
    onError?.(error)
  }
  cache = { key, value }
  return value
}

/**
 * 合成最终设置：settings.json 优先，其次插件 config，最后默认值。
 * `interval`（带单位/裸数字＝分钟）与 `intervalMs`（毫秒）等价。
 */
/** schemastery 的 `.volatile()` 字段在运行期是活引用（{ get }），取值要拆开。 */
export function valueOf(value, fallback) {
  if (value && typeof value === 'object' && typeof value.get === 'function') {
    try {
      const live = value.get()
      return live === undefined ? fallback : live
    } catch {
      return fallback
    }
  }
  return value === undefined ? fallback : value
}

export function resolveSettings(config = {}, file = config?.settingsFile ?? SETTINGS_FILE) {
  const settings = readSettings(file)
  const enabled =
    typeof settings.enabled === 'boolean' ? settings.enabled : valueOf(config?.enabled, true) !== false

  let raw
  if (typeof settings.minutes === 'number') raw = settings.minutes * 60_000
  else if (settings.intervalMs !== undefined) raw = Number(settings.intervalMs)
  else if (settings.interval !== undefined) raw = parseDuration(settings.interval)
  if (raw === undefined) {
    // 页面上的设置优先（分钟）；intervalMs 是兼容旧配置的后备写法。
    const minutes = valueOf(config?.intervalMinutes)
    if (typeof minutes === 'number') raw = minutes * 60_000
    else raw = Number(valueOf(config?.intervalMs))
  }

  return { enabled, intervalMs: clampInterval(raw) }
}

/** 只有顶层 session 才算「主 agent」；subagent 的 header 带 delegationDepth 或 origin。 */
function isMainAgent(agent) {
  const header = agent?.session?.header
  if (!header) return false
  if (header.origin === 'subagent') return false
  return (header.delegationDepth ?? 0) === 0
}

function nudgeText(span, intervalSpan) {
  return [
    `【进度播报】本轮任务已连续执行约 ${span}，这期间你没有向用户汇报过进度。`,
    '请在本步回复正文的最前面，先用 1–2 句话说清：现在在做什么、已经完成了什么、有什么关键发现、下一步准备做什么，然后再继续调用工具推进任务。',
    '要求具体、有信息量，不要只写“继续处理中”这类空话。',
    `这是 DSH 主 agent 的例行进度提醒（每 ${intervalSpan} 一次，本轮任务结束即停止；间隔在「设置 → 插件 → progress-tick」里调整）。`,
  ].join('')
}

export function apply(ctx, config = {}) {
  /** sessionId -> { anchor, done, nudges } */
  const states = new Map()

  const warnOnce = (() => {
    let warned = false
    return (error) => {
      if (warned) return
      warned = true
      try {
        ctx.logger?.warn?.('[progress-tick] 设置读取/事件处理异常，任务执行不受影响：%s', error?.message ?? error)
      } catch {}
    }
  })()

  function fresh(anchor) {
    return { anchor, done: false, nudges: 0 }
  }

  function ensure(sessionId) {
    let state = states.get(sessionId)
    if (!state) {
      state = fresh(Date.now())
      states.set(sessionId, state)
      if (states.size > MAX_STATES) {
        let drop = states.size - MAX_STATES
        for (const key of states.keys()) {
          if (drop-- <= 0) break
          states.delete(key)
        }
      }
    }
    return state
  }

  // 一轮开始：从这一刻起计时；一轮结束：清零，等下一轮重新开始。
  ctx.on('agent/status', ({ agent, status } = {}) => {
    try {
      if (!agent?.session?.id || !isMainAgent(agent)) return
      const id = agent.session.id
      if (status === 'running') {
        const state = states.get(id)
        if (!state || state.done) states.set(id, fresh(Date.now()))
      } else if (status === 'idle') {
        const state = states.get(id)
        if (state) state.done = true
      }
    } catch (error) {
      warnOnce(error)
    }
  })

  // 模型只要有可见正文输出，就视为「刚刚汇报过」，重新锚定计时。
  ctx.on('agent/assistant-stream', ({ agent, frame } = {}) => {
    try {
      if (frame?.type !== 'chunk' || frame.chunk?.type !== 'text-delta') return
      if (!frame.chunk.text?.trim()) return
      const id = agent?.session?.id
      if (!id) return
      const state = states.get(id)
      if (!state || state.done) return
      state.anchor = Date.now()
    } catch (error) {
      warnOnce(error)
    }
  })

  ctx.on('agent/disposed', ({ agent } = {}) => {
    const id = agent?.session?.id
    if (id) states.delete(id)
  })
  ctx.on('session/disposed', (session) => {
    if (session?.id) states.delete(session.id)
  })

  ctx.on('agent/pre-step', async ({ agent, turn, step, messages: incoming = [], signal }, next) => {
    const decision = await next()
    try {
      if (!decision || decision.kind !== 'enter') return decision
      if (signal?.aborted) return decision
      if (!agent?.session?.id || !isMainAgent(agent)) return decision
      // 与宿主同款守卫：空的首批次不能被我们变成一次新请求。
      if (!decision.messages.length && (step === 1 || incoming.length > 0)) return decision

      // 每次现读，改 settings.json 立即生效。
      const { enabled, intervalMs } = resolveSettings(config)
      if (!enabled) return decision

      const session = agent.session
      const state = ensure(session.id)
      if (state.done) {
        // 状态事件丢失时的兜底：重新开始计时，而不是立刻打扰。
        states.set(session.id, fresh(Date.now()))
        return decision
      }

      const now = Date.now()
      if (now - state.anchor < intervalMs) return decision

      const message = {
        id: `progress-tick/${session.id}/${turn}/${step}/${randomUUID()}`,
        role: 'user',
        content: [{ type: 'text', text: nudgeText(formatSpan(now - state.anchor), formatSpan(intervalMs)) }],
        source: {
          kind: 'progress-tick',
          form: 'notice',
          summary: `进度播报提醒（已连续执行约 ${formatSpan(now - state.anchor)}）`,
        },
      }
      state.anchor = now
      state.nudges += 1
      return { ...decision, messages: [...decision.messages, message] }
    } catch (error) {
      warnOnce(error)
      return decision
    }
  })
}
