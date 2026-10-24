/**
 * progress-tick — 让主 agent 在长任务执行期间定期向用户汇报进度。
 *
 * 由 @deepseek-ai/dsh-agent-loop 的 `agent/pre-step` 注入一条 user 角色的
 * 播报提醒；计时从「本轮执行开始」起算，本轮结束归零，下一轮重新计时。
 * 子 agent（origin=subagent / delegationDepth>0）永不注入。
 *
 * 关键机制：
 *  - Host 侧没有 tool 事件，最近动作取自 `session/event` 的 tool/call / tool/result。
 *  - 「汇报过」的判定不是「吐了任何正文」，而是正文达到 minReportChars 字数
 *    或命中 reportMarkers 之一（避免用「好的我继续」骗过计时器）。
 *  - 连续重复同一动作达到 stuckThreshold 时，改发「你是不是卡住了」提醒。
 *
 * @module @linxin666/dsh-progress-tick
 */
import Schema from '@deepseek-ai/schemastery'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import { randomUUID } from 'node:crypto'

export const name = 'progress-tick'

const MIN_INTERVAL_MS = 10_000 // 10s
const MAX_INTERVAL_MS = 24 * 60 * 60_000
const MAX_STATES = 200
/** 版本号（供 /api 与启动标记使用）。 */
const VERSION = '0.4.2'
const MAX_NUDGE_CHARS = 700
const MAX_ACTIONS = 8
const MAX_BACKOFF_EXPONENT = 3 // 间隔最多放大 8×（factor 默认 2）
const DEFAULT_STATUS_DIR = join(homedir(), '.dsh', 'progress-tick', 'status')
const CJK = /[\u4e00-\u9fff]/

const DEFAULT_MARKERS = '完成,已完成,发现,下一步,阻塞,卡住,结论,问题,失败,已修复,搞定,待定'

/**
 * 所有字段都 `.volatile()`：设置 → 插件 → progress-tick → 详情页可即时修改，
 * 且不触发 remount（因此插件每一步都从 `ctx.config` 读活值）。
 */
export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('总开关').volatile(),
  intervalMinutes: Schema.number().default(5).min(10 / 60000).max(24 * 60).description('提醒间隔（分钟）').volatile(),
  minReportChars: Schema.number().default(40).min(0).max(4000).description('正文至少多少字才算“已汇报过”').volatile(),
  reportMarkers: Schema.string().default(DEFAULT_MARKERS).description('命中任一关键词即算“已汇报过”（英文逗号分隔）').volatile(),
  maxNudgesPerTurn: Schema.number().default(0).min(0).max(1000).description('每轮最多提醒次数，0 = 不限').volatile(),
  backoffAfter: Schema.number().default(3).min(0).max(100).description('第几条提醒后开始拉长间隔').volatile(),
  backoffFactor: Schema.number().default(2).min(1).max(8).description('拉长倍数（×2、×3 …）').volatile(),
  locale: Schema.union(['auto', 'zh', 'en']).default('auto').description('提醒文案语言；auto = 跟随用户消息语种').volatile(),
  includeActions: Schema.boolean().default(true).description('提醒里附带最近动作摘要').volatile(),
  actionCount: Schema.number().default(3).min(0).max(MAX_ACTIONS).description('附带几条最近动作').volatile(),
  detailEvery: Schema.number().default(2).min(1).max(50).description('每第 N 条提醒为详版（带动作摘要）').volatile(),
  stuckDetection: Schema.boolean().default(true).description('连续重复同一动作时改发“卡住了？”提醒').volatile(),
  stuckThreshold: Schema.number().default(3).min(2).max(50).description('同一动作连续几次算卡住').volatile(),
  subagentSummary: Schema.boolean().default(true).description('提醒里附带子 agent 情况').volatile(),
  subagentStaleMinutes: Schema.number().default(10).min(1).max(600).description('子 agent 多少分钟无产出算停滞').volatile(),
  statusFile: Schema.boolean().default(true).description('把每个 session 的计时状态写成 JSON 文件').volatile(),
  statusDir: Schema.string().default('').description('状态文件目录，留空 = ~/.dsh/progress-tick/status').volatile(),
  commandEnabled: Schema.boolean().default(true).description('注册 /progress 命令，随时让 agent 立即汇报').volatile(),
})

// ---------------------------------------------------------------- 纯函数（可测）

/** 解析时长：'5m' / '90s' / '1.5h' / '300000ms' / '5分钟' / 裸数字(=分钟)。 */
export function parseDuration(input) {
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? input * 60_000 : undefined
  if (typeof input !== 'string') return undefined
  const text = input.trim().toLowerCase()
  if (!text) return undefined
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(ms|毫秒|s|sec|secs|seconds|秒|m|min|mins|minute|minutes|分|分钟|h|hr|hrs|hour|hours|小时)?$/)
  if (!match) return undefined
  const value = Number.parseFloat(match[1])
  if (!Number.isFinite(value) || value <= 0) return undefined
  const unit = match[2] ?? 'm'
  if (unit === 'ms' || unit === '毫秒') return value
  if (['s', 'sec', 'secs', 'seconds', '秒'].includes(unit)) return value * 1000
  if (['m', 'min', 'mins', 'minute', 'minutes', '分', '分钟'].includes(unit)) return value * 60_000
  return value * 60 * 60_000
}

export function clampInterval(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(ms)))
}

/** 秒级格式化：'5 分钟' / '90 秒'；英文 '5 min' / '90 s'。 */
export function fmtDuration(ms, locale = 'zh') {
  const zh = locale !== 'en'
  const sec = ms / 1000
  if (sec < 60) return zh ? `${Math.max(1, Math.round(sec))} 秒` : `${Math.max(1, Math.round(sec))} s`
  const min = Math.round(sec / 60)
  if (min < 60) return zh ? `${min} 分钟` : `${min} min`
  const hour = Math.floor(min / 60)
  const rest = min % 60
  if (zh) return rest ? `${hour} 小时 ${rest} 分钟` : `${hour} 小时`
  return rest ? `${hour} h ${rest} min` : `${hour} h`
}

/** 从配置里读出规范化后的间隔（毫秒）。 */
export function resolveIntervalMs(config) {
  const raw = config?.intervalMinutes
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    const minutes = Math.min(24 * 60, Math.max(MIN_INTERVAL_MS / 60_000, raw))
    return Math.round(minutes * 60_000)
  }
  const parsed = parseDuration(raw)
  return clampInterval(parsed) ?? 5 * 60_000
}

/** 退避后的实际间隔：第 backoffAfter 条之后按 factor 指数放大，最多 8×。 */
export function effectiveIntervalMs(baseMs, nudges, config) {
  const after = Math.max(0, Number(config?.backoffAfter ?? 3))
  const factor = Math.min(8, Math.max(1, Number(config?.backoffFactor ?? 2)))
  const extra = Math.max(0, nudges - after)
  const exp = Math.min(MAX_BACKOFF_EXPONENT, extra)
  return Math.round(baseMs * Math.pow(factor, exp))
}

export function markerList(config) {
  const raw = config?.reportMarkers
  const list = (typeof raw === 'string' ? raw : DEFAULT_MARKERS)
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
  return list.length ? list : DEFAULT_MARKERS.split(',')
}

/** 这段正文算不算“汇报过”：字数够，或命中结构关键词。 */
export function isInformative(text, pendingChars, config) {
  const chars = Math.max(0, Number(pendingChars) || 0)
  const threshold = Math.max(0, Number(config?.minReportChars ?? 40))
  if (chars >= threshold) return true
  if (chars === 0) return false
  const body = String(text ?? '')
  return markerList(config).some((marker) => body.includes(marker))
}

export function pickLocale(text, config) {
  const mode = config?.locale
  if (mode === 'zh' || mode === 'en') return mode
  return CJK.test(String(text ?? '')) ? 'zh' : 'en'
}

function clampText(text, max = MAX_NUDGE_CHARS) {
  const value = String(text ?? '')
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

// ---------------------------------------------------------------- 动作摘要

const TARGET_KEYS = ['file_path', 'filePath', 'path', 'command', 'pattern', 'url', 'query', 'prompt', 'name', 'selector']

/**
 * `tool/call` 的 `arguments` 在真实会话里是 JSON 字符串（不是对象）。
 * 不解析的话摘要会变成 `bash({"command":"…`，`lastKey` 也会被几 KB 的原始
 * JSON 撑大，卡住检测还会因为参数里任何空白差异而失效。
 */
function parseActionArgs(args) {
  if (args && typeof args === 'object') return args
  if (typeof args !== 'string') return undefined
  const text = args.trim()
  if (!text) return undefined
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return JSON.parse(text)
    } catch {
      // 非法 JSON：退回原文，至少还能看出调用了什么。
      return text
    }
  }
  return text
}

export function actionTarget(name, args) {
  const parsed = parseActionArgs(args)
  if (typeof parsed === 'string') return parsed.trim()
  if (!parsed || typeof parsed !== 'object') return ''
  for (const key of TARGET_KEYS) {
    const value = parsed[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function trimTarget(text, max = 60) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

export function summarizeAction(action, locale = 'zh') {
  if (!action) return undefined
  const target = trimTarget(action.target)
  const failed = action.failed ? (locale === 'en' ? ' (failed)' : '（失败）') : ''
  return target ? `${action.name}(${target})${failed}` : `${action.name}${failed}`
}

// ---------------------------------------------------------------- 文案

export function nudgeText(options) {
  const {
    locale = 'zh',
    elapsedMs,
    intervalMs,
    detail = false,
    actions = [],
    stuck = null,
    subagents = [],
    cap = MAX_NUDGE_CHARS,
  } = options
  const zh = locale !== 'en'
  const elapsed = fmtDuration(elapsedMs, locale)
  const every = fmtDuration(intervalMs, locale)
  const intervalWord = zh ? `约每 ${every} 一次` : `about every ${every}`

  if (stuck) {
    const where = summarizeAction(stuck.action, locale) ?? stuck.key
    return clampText(
      zh
        ? `【进度播报】检测到你在反复执行同一个操作（${where} 已连续 ${stuck.repeat} 次）。请在本步回复正文的最前面先说明：现在卡在哪、已经试过什么、是否该换一种做法，然后再继续。这是 DSH 主 agent 的例行进度提醒（本轮任务结束即停止）。`
        : `[progress] You have repeated the same action (${where}, ${stuck.repeat}× in a row). At the very start of your next visible reply, state where you are stuck, what you already tried, and whether to change approach — then continue. Routine progress check for the DSH main agent (stops when this turn ends).`,
      cap,
    )
  }

  const head = zh
    ? `【进度播报】本轮任务已连续执行约 ${elapsed}，这期间你没有向用户汇报过进度。`
    : `[progress] This turn has been running for about ${elapsed} without any update to the user.`
  const ask = zh
    ? '请在本步回复正文的最前面，先用 1–2 句话说清：现在在做什么、已经完成了什么、有什么关键发现、下一步准备做什么，然后再继续调用工具推进任务。要求具体、有信息量，不要只写“继续处理中”这类空话。'
    : 'At the very start of your next visible reply, spend 1–2 sentences on: what you are doing now, what is already done, key findings, and what comes next — then continue working. Be concrete; do not write filler like "still working".'
  const foot = zh
    ? `这是 DSH 主 agent 的例行进度提醒（${intervalWord}，本轮任务结束即停止）。`
    : `Routine progress check for the DSH main agent (${intervalWord}; stops when this turn ends).`

  const parts = [head, ask]
  if (detail && actions.length) {
    const list = actions
      .slice(-Math.max(1, Number(options.actionCount ?? 3)))
      .map((action) => summarizeAction(action, locale))
      .filter(Boolean)
      .join(' → ')
    if (list) {
      parts.push(zh ? `最近的动作（供参考，不必逐条复述）：${list}。` : `Recent actions (for reference, no need to repeat them one by one): ${list}.`)
    }
  }
  if (subagents.length) {
    parts.push(zh ? `子 agent 情况：${subagents.join('；')}。` : `Subagent status: ${subagents.join('; ')}.`)
  }
  parts.push(foot)
  return clampText(parts.filter(Boolean).join(''), cap)
}

// ---------------------------------------------------------------- 插件

function defaultConfig() {
  const merged = {}
  const dict = Config.dict ?? {}
  for (const [key, schema] of Object.entries(dict)) {
    if (schema && 'default' in schema) merged[key] = schema.default
  }
  return merged
}

/**
 * volatile 字段在 `ctx.config` 里不是原始值，而是 cosmokit 的活引用
 * `{ get: () => current, [write]() }`（设置页改字段时改写的是同一个引用）。
 * 取值必须拆开，否则 `typeof x === 'number'` 永远不成立、设置形同虚设。
 */
export function unwrapVolatile(value) {
  if (value && typeof value === 'object' && typeof value.get === 'function' && !(value instanceof Date)) {
    try {
      return value.get()
    } catch {
      return undefined
    }
  }
  return value
}

/** 每一步都读活配置：volatile 提交不 remount，apply 里的快照会过期。 */
function liveConfig(rawConfig) {
  const merged = defaultConfig()
  const current = rawConfig
  if (current && typeof current === 'object') {
    for (const [key, value] of Object.entries(current)) merged[key] = unwrapVolatile(value)
  }
  return merged
}

function isSubagent(agent) {
  const header = agent?.session?.header
  if (!header) return false
  const depth = typeof header.delegationDepth === 'number' ? header.delegationDepth : 0
  return header.origin === 'subagent' || depth > 0 || Boolean(header.parentSession)
}

function isMainAgent(agent) {
  return Boolean(agent?.session?.id) && !isSubagent(agent)
}

const states = new Map()

function getState(sessionId) {
  const existing = states.get(sessionId)
  if (existing) {
    // 真 LRU：命中后挪到队尾，避免活跃 session 被淘汰后计时重置
    states.delete(sessionId)
    states.set(sessionId, existing)
    return existing
  }
  if (states.size >= MAX_STATES) {
    const oldest = states.keys().next().value
    if (oldest !== undefined) states.delete(oldest)
  }
  const fresh = {
    sessionId,
    anchor: 0,
    done: true,
    turnStartedAt: 0,
    lastNudgeAt: 0,
    title: '',
    cwd: '',
    nudges: 0,
    pendingChars: 0,
    actions: [],
    lastKey: '',
    repeat: 0,
    locale: 'zh',
    force: false,
    subagents: new Map(),
    updatedAt: Date.now(),
    writtenAt: 0,
  }
  states.set(sessionId, fresh)
  return fresh
}

function noteAction(state, name, target) {
  // 事件流里 target 可能很长：落状态前统一压到 160 字，避免状态文件/内存被撑大。
  const clean = trimTarget(target, 160)
  const key = `${name}:${clean}`
  if (key && key === state.lastKey) state.repeat += 1
  else {
    state.repeat = 1
    state.lastKey = key
  }
  state.actions.push({ name, target: clean, failed: false, at: Date.now() })
  if (state.actions.length > MAX_ACTIONS) state.actions.shift()
  state.updatedAt = Date.now()
}

function markFailed(state) {
  const last = state.actions[state.actions.length - 1]
  if (last) {
    last.failed = true
    last.at = Date.now()
  }
}

function sanitizeId(id) {
  return String(id ?? 'unknown').replace(/[^A-Za-z0-9._-]/g, '_')
}

const ctxLog = {
  info() {},
  warn() {},
}
let loggerReady = false
function bindLogger(ctx) {
  if (loggerReady) return
  loggerReady = true
  ctxLog.info = (msg) => ctx.logger?.info?.(msg)
  ctxLog.warn = (msg) => ctx.logger?.warn?.(msg)
}

async function writeBootMarker(config) {
  if (!config.statusFile) return
  const dir = (config.statusDir ?? '').trim() || DEFAULT_STATUS_DIR
  try {
    await fsp.mkdir(dir, { recursive: true })
    await fsp.writeFile(join(dir, '_boot.json'), `${JSON.stringify({
      pid: process.pid,
      at: new Date().toISOString(),
      version: VERSION,
      intervalMinutes: config.intervalMinutes,
      enabled: config.enabled,
    }, null, 2)}\n`, 'utf8')
  } catch (error) {
    ctxLog.warn?.(`boot marker failed: ${error?.message ?? error}`)
  }
}

async function writeStatusFile(state, config) {
  if (!config.statusFile) return
  const dir = (config.statusDir ?? '').trim() || DEFAULT_STATUS_DIR
  const file = join(dir, `${sanitizeId(state.sessionId)}.json`)
  const payload = {
    sessionId: state.sessionId,
    updatedAt: new Date().toISOString(),
    running: !state.done,
    nudges: state.nudges,
    pendingChars: state.pendingChars,
    repeat: state.repeat,
    lastActionKey: state.lastKey,
    actions: state.actions,
    subagents: [...state.subagents.entries()].map(([id, value]) => ({ id, ...value })),
  }
  try {
    await fsp.mkdir(dir, { recursive: true })
    await fsp.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    state.writtenAt = Date.now()
  } catch (error) {
    state.writtenAt = Date.now()
    ctxLog.warn?.(`status file failed: ${error?.message ?? error}`)
  }
}

function subagentNotes(state, config, locale) {
  if (!config.subagentSummary || state.subagents.size === 0) return []
  const staleMs = (Number(config.subagentStaleMinutes ?? 10) || 10) * 60_000
  const now = Date.now()
  const notes = []
  let done = 0
  let stale = 0
  for (const value of state.subagents.values()) {
    if (value.done) done += 1
    else if (now - (value.lastEventAt ?? value.startedAt ?? now) >= staleMs) stale += 1
  }
  const zh = locale !== 'en'
  if (done) notes.push(zh ? `${done} 个已结束` : `${done} finished recently`)
  if (stale) notes.push(zh ? `${stale} 个已超过 ${config.subagentStaleMinutes} 分钟无产出` : `${stale} silent for over ${config.subagentStaleMinutes} min`)
  return notes
}

function buildMessage(state, config, options = {}) {
  const locale = state.locale ?? 'zh'
  const intervalMs = resolveIntervalMs(config)
  const elapsedMs = Math.max(0, Date.now() - (options.anchor ?? state.anchor))
  const actions = config.includeActions ? state.actions.slice(-MAX_ACTIONS) : []
  const stuck =
    options.stuck === true
      ? {
          key: state.lastKey,
          repeat: state.repeat,
          action: state.actions[state.actions.length - 1],
        }
      : null
  return nudgeText({
    locale,
    elapsedMs,
    intervalMs,
    detail: options.detail === true,
    actions,
    actionCount: config.actionCount,
    stuck,
    subagents: subagentNotes(state, config, locale),
  })
}

function appendNotice(decision, text) {
  decision.messages.push({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: 'progress-tick',
      form: 'notice',
      summary: text.split('\n')[0].slice(0, 120),
    },
  })
}

/*
 * 关键：本模块**不能**再有 `export default`。
 * cordis-plugin-loader 的 unwrapExports 是 `exports.default ?? exports`，
 * 一旦有 default，runtime 就变成那个函数，`fiber.runtime.Config` 不存在，
 * dsh-settings 的 schema(entry) 返回 undefined —— 设置页就不会出现表单。
 * 保持「命名空间即插件」（apply + Config + name）才能被设置页识别。
 */

/** 从一条 user message 里抽纯文本（content 可能是字符串或 block 数组）。 */
function messageText(message) {
  if (!message) return ''
  if (typeof message === 'string') return message
  const content = message.content ?? message
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : part?.text ?? '')).join(' ')
  }
  return ''
}

function isLoopbackRequest(req) {
  const address = req?.socket?.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address === ''
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

/** 汇总所有被跟踪会话的运行时长与下次提醒倒计时。 */
export function statusSnapshot(config) {
  const now = Date.now()
  const base = resolveIntervalMs(config)
  const threshold = Math.max(2, Number(config.stuckThreshold ?? 3))
  const sessions = []
  for (const state of states.values()) {
    const interval = effectiveIntervalMs(base, state.nudges, config)
    const nextAt = state.anchor ? state.anchor + interval : 0
    const max = Number(config.maxNudgesPerTurn ?? 0) || 0
    // 已达本轮上限时倒计时不会再兑现，不能继续显示“待提醒 0:00”。
    const capped = max > 0 && state.nudges >= max
    const last = state.actions.length ? state.actions[state.actions.length - 1] : null
    sessions.push({
      id: state.sessionId,
      short: String(state.sessionId).replace(/^session-/, '').slice(0, 8),
      title: state.title ?? '',
      cwd: state.cwd ?? '',
      running: !state.done,
      nudges: state.nudges,
      capped,
      intervalMs: interval,
      elapsedMs: state.turnStartedAt ? Math.max(0, now - state.turnStartedAt) : 0,
      sinceReportMs: state.anchor ? Math.max(0, now - state.anchor) : 0,
      nextInMs: capped || !nextAt ? 0 : Math.max(0, nextAt - now),
      overdue: !capped && Boolean(nextAt) && now >= nextAt && !state.done,
      stuck: state.repeat >= threshold,
      // 只回展示需要的字段：完整 target 可能包含命令里的凭证，而且每 4 秒轮询一次。
      lastAction: last ? { name: last.name, target: trimTarget(last.target, 80), failed: Boolean(last.failed), at: last.at } : null,
      lastNudgeAt: state.lastNudgeAt || 0,
      updatedAt: state.updatedAt || 0,
    })
  }
  sessions.sort((a, b) => Number(b.running) - Number(a.running) || b.elapsedMs - a.elapsedMs)
  return {
    version: VERSION,
    now,
    enabled: config.enabled !== false,
    intervalMinutes: Math.round((base / 60_000) * 10) / 10,
    maxNudgesPerTurn: Number(config.maxNudgesPerTurn ?? 0) || 0,
    sessions,
  }
}

function registerStatusRoute(ctx, baseConfig) {
  // webServer 是可选服务：用 ctx.inject 起一个子 fiber，没有 web server 的宿主上直接跳过。
  if (typeof ctx.inject !== 'function') return
  const route = {
    kind: 'exact',
    path: '/api/progress-tick/status',
    handler: (req, res) => {
      try {
        if (!isLoopbackRequest(req)) return sendJson(res, 403, { ok: false, error: 'forbidden: loopback-only' })
        const config = liveConfig(baseConfig)
        sendJson(res, 200, { ok: true, value: statusSnapshot(config) })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: String(error?.message ?? error) })
      }
    },
  }
  try {
    ctx.inject(['webServer'], (scope) => {
      scope.effect(() => scope.webServer.register(route), 'progress-tick: status route')
    })
  } catch (error) {
    ctxLog.warn?.(`status route skipped: ${error?.message ?? error}`)
  }
}

export async function apply(ctx, initialConfig) {
  bindLogger(ctx)
  // cordis 的 ctx 是代理：未 inject 的属性（含 ctx.config）访问即抛
  // `cannot get property "config" without inject`。配置一律走 apply 的第二个参数。
  const baseConfig = initialConfig ?? {}
  Promise.resolve()
    .then(() => writeBootMarker(liveConfig(baseConfig)))
    .catch((error) => ctxLog.warn?.(`boot marker failed: ${error?.message ?? error}`))

  ctx.on('agent/status', (payload) => {
    try {
      const agent = payload?.agent
      if (!isMainAgent(agent)) return
      const config = liveConfig(baseConfig)
      const state = getState(agent.session.id)
      if (payload.status === 'running') {
        state.done = false
        state.turnStartedAt = Date.now()
        state.anchor = Date.now()
        const cwd = agent.session.header?.cwd
        if (typeof cwd === 'string' && cwd) state.cwd = cwd
        state.nudges = 0
        state.pendingChars = 0
        state.actions = []
        state.repeat = 0
        state.lastKey = ''
        state.force = false
        state.updatedAt = Date.now()
      } else {
        state.done = true
        state.pendingChars = 0
        void writeStatusFile(state, config)
      }
    } catch (error) {
      ctxLog.warn?.(`agent/status failed: ${error?.message ?? error}`)
    }
  })

  ctx.on('agent/assistant-stream', (payload) => {
    try {
      const agent = payload?.agent
      if (!isMainAgent(agent)) return
      const frame = payload?.frame
      if (frame?.type !== 'chunk' || frame.chunk?.type !== 'text-delta') return
      const text = frame.chunk.text
      if (!text?.trim()) return
      const config = liveConfig(baseConfig)
      const state = getState(agent.session.id)
      if (state.done) return
      state.pendingChars += text.length
      state.updatedAt = Date.now()
      if (isInformative(text, state.pendingChars, config)) {
        state.anchor = Date.now()
        state.pendingChars = 0
      }
    } catch (error) {
      ctxLog.warn?.(`assistant-stream failed: ${error?.message ?? error}`)
    }
  })

  ctx.on('agent/pre-step', (payload, next) => {
    return (async () => {
      const decision = await next()
      try {
        if (decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision
        const agent = payload?.agent
        if (!isMainAgent(agent)) return decision
        const config = liveConfig(baseConfig)
        if (config.enabled === false) return decision
        const state = getState(agent.session.id)
        if (!state.writtenAt) writeStatusFile(state, config).catch(() => {})
        if (state.done && !state.force) return decision

        const now = Date.now()

        // 用户刚插话：本 step 已经带着新的人类消息，再塞一条“你 N 分钟没汇报”
        // 和用户刚说的话自相矛盾。重锚即可，并作废 /progress 的待发提醒。
        if (decision.messages.some((message) => message?.source?.kind === 'user')) {
          state.anchor = now
          state.pendingChars = 0
          state.force = false
          state.updatedAt = now
          return decision
        }

        const base = resolveIntervalMs(config)
        const interval = effectiveIntervalMs(base, state.nudges, config)
        const max = Number(config.maxNudgesPerTurn ?? 0) || 0
        const overLimit = max > 0 && state.nudges >= max
        const due = now - state.anchor >= interval
        if (!state.force && (!due || overLimit)) return decision

        const stuck = Boolean(config.stuckDetection) && state.repeat >= Math.max(2, Number(config.stuckThreshold ?? 3))
        const every = Math.max(1, Number(config.detailEvery ?? 2))
        const detail = (state.nudges + 1) % every === 0
        const text = buildMessage(state, config, { stuck, detail })
        appendNotice(decision, text)

        state.nudges += 1
        state.lastNudgeAt = now
        state.anchor = now
        state.pendingChars = 0
        state.force = false
        state.updatedAt = now
        if (stuck) state.repeat = 0
        void writeStatusFile(state, config)
        ctxLog.info?.(`progress-tick: nudged ${state.sessionId} (#${state.nudges}${stuck ? ', stuck' : ''})`)
      } catch (error) {
        ctxLog.warn?.(`pre-step failed: ${error?.message ?? error}`)
      }
      return decision
    })()
  })

  // 状态页数据源：GET /api/progress-tick/status（只读、仅回环地址）。
  registerStatusRoute(ctx, baseConfig)

  // session/event：Host 没有 tool 事件，最近动作 / 子 agent 状态都从这里取。
  ctx.on('session/event', (session, event) => {
    try {
      if (!session || !event) return
      const config = liveConfig(baseConfig)
      const header = session.header ?? {}
      const sessionId = session.id
      const parentId = header.parentSession

      if (header.origin === 'subagent' || (typeof header.delegationDepth === 'number' && header.delegationDepth > 0)) {
        // 子 agent 自身不提醒；只把它的动静记到父 session 上。
        if (!parentId) return
        const parent = states.get(parentId)
        if (!parent) return
        const entry = parent.subagents.get(sessionId) ?? { startedAt: Date.now(), lastEventAt: Date.now(), done: false }
        entry.lastEventAt = Date.now()
        if (event.type === 'turn/end') entry.done = true
        parent.subagents.set(sessionId, entry)
        parent.updatedAt = Date.now()
        return
      }

      const state = getState(sessionId)

      if (event.type === 'session/title') {
        // 自动标题 / 用户重命名都会发这个事件，优先用它（比截首条消息准）。
        const title = String(event.data?.title ?? '').replace(/\s+/g, ' ').trim()
        if (title) state.title = title.length > 80 ? `${title.slice(0, 80)}…` : title
        state.updatedAt = Date.now()
        return
      }
      if (event.type === 'user/message') {
        // 真实载荷：event.data 本身就是消息（含 content 数组），部分版本包在 data.message 里。
        const message = event.data?.message ?? event.data
        const sourceKind = message?.source?.kind
        // 只认真人消息：本插件自己注入的提醒（source.kind = progress-tick）、
        // goal / 系统消息都不该影响语言判定和标题。
        if (sourceKind !== 'user') return
        state.locale = pickLocale(JSON.stringify(message ?? ''), config)
        if (!state.title) {
          const text = messageText(message).replace(/\s+/g, ' ').trim()
          if (text) state.title = text.length > 60 ? `${text.slice(0, 60)}…` : text
        }
        return
      }
      if (event.type === 'tool/call') {
        const data = event.data ?? {}
        noteAction(state, data.name ?? 'tool', actionTarget(data.name, data.arguments))
        return
      }
      if (event.type === 'tool/result') {
        const data = event.data ?? {}
        // 失败结果有两种形状：显式 error，或 message.isError = true（常见）。
        if (data.error || data.message?.isError === true) markFailed(state)
        return
      }
      if (event.type === 'turn/end') {
        state.updatedAt = Date.now()
      }
    } catch (error) {
      ctxLog.warn?.(`session/event failed: ${error?.message ?? error}`)
    }
  })

  // /progress：用户随时让主 agent 立刻汇报一次（不依赖计时）。
  try {
    const commands = typeof ctx.get === 'function' ? ctx.get('commands') : undefined
    if (commands?.register && liveConfig(baseConfig).commandEnabled !== false) {
      commands.register({
        name: 'progress',
        description: '让主 agent 立刻汇报当前进度',
        recordInput: false,
        handler: ({ agent }) => {
          if (!isMainAgent(agent)) return { ok: false, error: '子 agent 不提供进度汇报' }
          const state = getState(agent.session.id)
          if (state.done) return { ok: false, error: '当前没有进行中的任务' }
          state.force = true
          return { ok: true, value: { queued: true } }
        },
      })
    }
  } catch (error) {
    ctxLog.warn?.(`command registration skipped: ${error?.message ?? error}`)
  }

  ctx.on('dispose', () => {
    states.clear()
  })
}
