import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  apply,
  valueOf,
  Config,
  parseDuration,
  clampInterval,
  formatSpan,
  resolveSettings,
  MIN_INTERVAL_MS,
  MAX_INTERVAL_MS,
} from '/Users/yyq/.dsh/plugins/progress-tick/index.js'

const results = []
const check = (label, ok) => { results.push([label, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`) }

// ── 时长解析 ────────────────────────────────────────────────
check('5m = 300000ms', parseDuration('5m') === 300_000)
check('90s = 90000ms', parseDuration('90s') === 90_000)
check('1.5h = 5400000ms', parseDuration('1.5h') === 5_400_000)
check('中文单位：5分钟/90秒', parseDuration('5分钟') === 300_000 && parseDuration('90秒') === 90_000)
check('显式毫秒 300000ms', parseDuration('300000ms') === 300_000)
check('裸数字视作分钟', parseDuration('5') === 300_000 && parseDuration(5) === 300_000)
check('非法输入返回 undefined', parseDuration('nope') === undefined && parseDuration('') === undefined)
check('下限钳制 10 秒', clampInterval(1000) === MIN_INTERVAL_MS)
check('上限钳制 24 小时', clampInterval(1e12) === MAX_INTERVAL_MS)
check('展示格式', formatSpan(300_000) === '5 分钟' && formatSpan(45_000) === '45 秒')

// ── 设置页表单（schemastery Config）────────────────────────
const defaults = Config({})
check('Config 默认值：开 / 5 分钟', valueOf(defaults.enabled) === true && valueOf(defaults.intervalMinutes) === 5)
check('volatile 字段可读活值', valueOf(Config({ intervalMinutes: 3 }).intervalMinutes) === 3)
const dirProbe = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-tick-probe-'))
check(
  '超范围间隔在运行时被夹紧',
  resolveSettings({ intervalMinutes: 9999, settingsFile: path.join(dirProbe, 'none.json') }).intervalMs === MAX_INTERVAL_MS,
)
fs.rmSync(dirProbe, { recursive: true, force: true })

// ── settings.json 热改 ─────────────────────────────────────
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-tick-'))
const settingsFile = path.join(dir, 'settings.json')
const writeSettings = (obj, bump = 1) => {
  fs.writeFileSync(settingsFile, JSON.stringify(obj))
  const t = Date.now() / 1000 + bump
  fs.utimesSync(settingsFile, t, t)
}

check('无 settings 文件 → 用 config', resolveSettings({ intervalMs: 300_000, settingsFile }).intervalMs === 300_000)

check('config.intervalMinutes 生效（3 分钟）', resolveSettings({ intervalMinutes: 3, settingsFile }).intervalMs === 180_000)

writeSettings({ interval: '10s' })
check('settings.json 覆盖 config（10s）', resolveSettings({ intervalMs: 300_000, settingsFile }).intervalMs === 10_000)

writeSettings({ interval: '2m' }, 2)
check('改文件即时生效（2m）', resolveSettings({ intervalMs: 300_000, settingsFile }).intervalMs === 120_000)

writeSettings({ intervalMs: 600_000 }, 3)
check('intervalMs 写法（10 分钟）', resolveSettings({ settingsFile }).intervalMs === 600_000)

writeSettings({ minutes: 3 }, 4)
check('minutes 写法（3 分钟）', resolveSettings({ settingsFile }).intervalMs === 180_000)

fs.writeFileSync(settingsFile, '{ 坏掉的 json')
check('坏 JSON 不炸，回落到 config', resolveSettings({ intervalMs: 300_000, settingsFile }).intervalMs === 300_000)

// ── 事件语义 ────────────────────────────────────────────────
const listeners = {}
const ctx = {
  on(name, fn) { (listeners[name] ||= []).push(fn) },
  logger: { warn: (...a) => console.warn('[warn]', ...a) },
}

let now = 1_000_000
const realNow = Date.now
Date.now = () => now
const advance = (ms) => { now += ms }

writeSettings({ enabled: true, interval: '5m' }, 5)
apply(ctx, { intervalMs: 5 * 60 * 1000, settingsFile })

const emit = (name, payload) => (listeners[name] || []).forEach((fn) => fn(payload))
const main = { session: { id: 'S-main', header: {} } }
const child = { session: { id: 'S-child', header: { delegationDepth: 1, origin: 'subagent' } } }

async function preStep(agent, turn = 1, step = 1, messages = [{ role: 'user' }]) {
  let out
  for (const fn of listeners['agent/pre-step'] || []) {
    out = await fn({ agent, turn, step, messages: [], signal: { aborted: false } }, async () => ({ kind: 'enter', messages }))
  }
  return out
}

emit('agent/status', { agent: main, status: 'running' })
advance(60_000)
let d = await preStep(main)
check('1 分钟时不注入', d.messages.length === 1)

advance(5 * 60 * 1000)
d = await preStep(main)
const injected = d.messages[d.messages.length - 1]
check('满 5 分钟注入一条', d.messages.length === 2 && injected.source?.kind === 'progress-tick')
check('注入内容为进度提醒', /进度播报/.test(injected.content[0].text) && /约 6 分钟/.test(injected.content[0].text))

d = await preStep(main, 1, 2)
check('同一时刻不重复注入', d.messages.length === 1)

emit('agent/assistant-stream', { agent: main, frame: { type: 'chunk', chunk: { type: 'text-delta', text: '进度：已完成 A' } } })
advance(4 * 60 * 1000)
d = await preStep(main, 1, 3)
check('汇报后 4 分钟不再催', d.messages.length === 1)

advance(90_000)
d = await preStep(main, 1, 4)
check('再次满 5 分钟再注入', d.messages.length === 2)

emit('agent/status', { agent: child, status: 'running' })
advance(10 * 60 * 1000)
d = await preStep(child)
check('子 agent 不注入', d.messages.length === 1)

emit('agent/status', { agent: main, status: 'idle' })
emit('agent/status', { agent: main, status: 'running' })
advance(60_000)
d = await preStep(main, 2, 1)
check('新一轮不足 5 分钟不注入', d.messages.length === 1)

advance(5 * 60 * 1000)
d = await preStep(main, 2, 2)
check('新一轮满 5 分钟注入', d.messages.length === 2)

emit('agent/status', { agent: main, status: 'idle' })
emit('agent/status', { agent: main, status: 'running' })
d = await preStep(main, 3, 1)
check('短任务结束后新一轮不残留计时', d.messages.length === 1)

// 运行中把间隔改成 30 秒 → 立刻按新间隔催
writeSettings({ enabled: true, interval: '30s' }, 6)
emit('agent/status', { agent: main, status: 'idle' })
emit('agent/status', { agent: main, status: 'running' })
advance(31_000)
d = await preStep(main, 4, 1)
check('改 settings 后按新间隔生效（30 秒）', d.messages.length === 2 && /约 31 秒|约 30 秒/.test(d.messages[1].content[0].text))

// 关掉开关 → 不再注入
writeSettings({ enabled: false, interval: '30s' }, 7)
emit('agent/status', { agent: main, status: 'idle' })
emit('agent/status', { agent: main, status: 'running' })
advance(10 * 60 * 1000)
d = await preStep(main, 5, 1)
check('enabled:false 时不注入', d.messages.length === 1)

Date.now = realNow
fs.rmSync(dir, { recursive: true, force: true })
const failed = results.filter(([, ok]) => !ok)
console.log(failed.length ? `\n${failed.length} FAILED` : `\nALL PASS (${results.length})`)
process.exit(failed.length ? 1 : 0)
