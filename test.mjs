// 零依赖自测：node test.mjs（需 NODE_PATH 指向 dsh profile 的 node_modules 以解析 schemastery）
import assert from 'node:assert/strict'
import * as moduleNamespace from './index.js'
import {
  Config,
  parseDuration,
  clampInterval,
  fmtDuration,
  resolveIntervalMs,
  effectiveIntervalMs,
  markerList,
  isInformative,
  pickLocale,
  actionTarget,
  trimTarget,
  summarizeAction,
  nudgeText,
  unwrapVolatile,
  statusSnapshot,
} from './index.js'

let passed = 0
function ok(name, fn) {
  try {
    fn()
    passed += 1
  } catch (error) {
    console.error(`✗ ${name}\n  ${error.message}`)
    process.exitCode = 1
  }
}

// ---- 时长解析
ok('parseDuration 分钟/秒/小时', () => {
  assert.equal(parseDuration('5m'), 300000)
  assert.equal(parseDuration('90s'), 90000)
  assert.equal(parseDuration('1.5h'), 5400000)
  assert.equal(parseDuration('300000ms'), 300000)
  assert.equal(parseDuration('5分钟'), 300000)
  assert.equal(parseDuration('5'), 300000)
  assert.equal(parseDuration(5), 300000)
})
ok('parseDuration 非法输入', () => {
  assert.equal(parseDuration(''), undefined)
  assert.equal(parseDuration('abc'), undefined)
  assert.equal(parseDuration(-3), undefined)
  assert.equal(parseDuration(0), undefined)
})
ok('clampInterval 边界', () => {
  assert.equal(clampInterval(1), 10000)
  assert.equal(clampInterval(25 * 3600_000), 24 * 3600_000)
  assert.equal(clampInterval(undefined), undefined)
})
ok('fmtDuration', () => {
  assert.equal(fmtDuration(300000), '5 分钟')
  assert.equal(fmtDuration(90000), '2 分钟')
  assert.equal(fmtDuration(300000, 'en'), '5 min')
  assert.equal(fmtDuration(5400000), '1 小时 30 分钟')
})
ok('resolveIntervalMs', () => {
  assert.equal(resolveIntervalMs({ intervalMinutes: 5 }), 300000)
  assert.equal(resolveIntervalMs({ intervalMinutes: 12 }), 12 * 60000)
  assert.equal(resolveIntervalMs({}), 300000)
})

// ---- 退避
ok('effectiveIntervalMs 指数退避', () => {
  const base = 300000
  const cfg = { backoffAfter: 3, backoffFactor: 2 }
  assert.equal(effectiveIntervalMs(base, 0, cfg), base)
  assert.equal(effectiveIntervalMs(base, 3, cfg), base)
  assert.equal(effectiveIntervalMs(base, 4, cfg), base * 2)
  assert.equal(effectiveIntervalMs(base, 5, cfg), base * 4)
  assert.equal(effectiveIntervalMs(base, 9, cfg), base * 8)
  assert.equal(effectiveIntervalMs(base, 99, cfg), base * 8) // 封顶 8×
})

// ---- 汇报判定
ok('markerList 分隔符', () => {
  assert.deepEqual(markerList({ reportMarkers: '完成,发现，结论' }), ['完成', '发现', '结论'])
  assert.ok(markerList({ reportMarkers: '' }).length > 0)
})
ok('isInformative 字数阈值', () => {
  const cfg = { minReportChars: 40 }
  assert.equal(isInformative('好的，我继续处理', 8, cfg), false)
  assert.equal(isInformative('x'.repeat(39), 39, cfg), false)
  assert.equal(isInformative('x'.repeat(40), 40, cfg), true)
})
ok('isInformative 关键词', () => {
  const cfg = { minReportChars: 1000, reportMarkers: '完成,发现,下一步' }
  assert.equal(isInformative('已经完成 A 模块', 9, cfg), true)
  assert.equal(isInformative('马上就好', 4, cfg), false)
})
ok('pickLocale', () => {
  assert.equal(pickLocale('帮我优化插件', { locale: 'auto' }), 'zh')
  assert.equal(pickLocale('please optimize the plugin', { locale: 'auto' }), 'en')
  assert.equal(pickLocale('中文', { locale: 'en' }), 'en')
  assert.equal(pickLocale('english', { locale: 'zh' }), 'zh')
})

// ---- 动作摘要
ok('actionTarget', () => {
  assert.equal(actionTarget('bash', { command: 'npm test' }), 'npm test')
  assert.equal(actionTarget('edit', { file_path: '/a/b.ts' }), '/a/b.ts')
  assert.equal(actionTarget('grep', { pattern: 'foo' }), 'foo')
  assert.equal(actionTarget('read', {}), '')
})
ok('actionTarget 解析 JSON 字符串参数', () => {
  // 真实会话里 tool/call 的 arguments 是 JSON 字符串，不是对象。
  assert.equal(actionTarget('bash', '{"command":"npm test"}'), 'npm test')
  assert.equal(actionTarget('bash', '{"command":"cd /a && ls","description":"列目录"}'), 'cd /a && ls')
  assert.equal(actionTarget('write', '{"file_path":"/a/b.ts","content":"x"}'), '/a/b.ts')
  assert.equal(actionTarget('bash', '  {"command":"npm run build"}  '), 'npm run build')
  // 非法 JSON 退回原文，至少能看出调用了什么
  assert.equal(actionTarget('bash', 'not-json'), 'not-json')
  assert.equal(actionTarget('bash', ''), '')
  assert.equal(actionTarget('bash', undefined), '')
})
ok('trimTarget', () => {
  assert.equal(trimTarget('a\nb   c'), 'a b c')
  assert.ok(trimTarget('x'.repeat(80)).endsWith('…'))
})
ok('summarizeAction', () => {
  assert.equal(summarizeAction({ name: 'bash', target: 'ls' }), 'bash(ls)')
  assert.equal(summarizeAction({ name: 'bash', target: 'ls', failed: true }), 'bash(ls)（失败）')
  assert.equal(summarizeAction({ name: 'bash', target: 'ls', failed: true }, 'en'), 'bash(ls) (failed)')
})

// ---- 文案
ok('nudgeText 中文短版', () => {
  const text = nudgeText({ locale: 'zh', elapsedMs: 5 * 60000, intervalMs: 5 * 60000 })
  assert.ok(text.includes('【进度播报】'))
  assert.ok(text.includes('5 分钟'))
  assert.ok(text.length <= 700)
})
ok('nudgeText 英文短版', () => {
  const text = nudgeText({ locale: 'en', elapsedMs: 12 * 60000, intervalMs: 5 * 60000 })
  assert.ok(text.startsWith('[progress]'))
  assert.ok(text.includes('12 min'))
})
ok('nudgeText 详版带动作', () => {
  const text = nudgeText({
    locale: 'zh',
    elapsedMs: 10 * 60000,
    intervalMs: 5 * 60000,
    detail: true,
    actions: [{ name: 'bash', target: 'npm test' }, { name: 'edit', target: 'src/a.ts' }],
    actionCount: 3,
  })
  assert.ok(text.includes('npm test'))
  assert.ok(text.includes('src/a.ts'))
})
ok('nudgeText 卡住版', () => {
  const text = nudgeText({
    locale: 'zh',
    elapsedMs: 60000,
    intervalMs: 300000,
    stuck: { key: 'bash:npm test', repeat: 4, action: { name: 'bash', target: 'npm test' } },
  })
  assert.ok(text.includes('卡在哪'))
  assert.ok(text.includes('4 次'))
})
ok('nudgeText 子 agent 情况', () => {
  const text = nudgeText({ locale: 'zh', elapsedMs: 60000, intervalMs: 300000, subagents: ['2 个已结束'] })
  assert.ok(text.includes('子 agent 情况'))
})
ok('nudgeText 超长截断', () => {
  const actions = Array.from({ length: 8 }, (_, i) => ({ name: 'bash', target: `command-${i}-${'x'.repeat(50)}` }))
  const text = nudgeText({ locale: 'zh', elapsedMs: 60000, intervalMs: 300000, detail: true, actions, actionCount: 8 })
  assert.ok(text.length <= 700)
  assert.ok(text.endsWith('…'))
})

// ---- 活引用拆包
ok('unwrapVolatile 拆开 cosmokit 活引用', () => {
  const ref = { get: () => 300000 }
  assert.equal(unwrapVolatile(ref), 300000)
  assert.equal(unwrapVolatile(42), 42)
  assert.equal(unwrapVolatile(undefined), undefined)
  assert.deepEqual(unwrapVolatile({ a: 1 }), { a: 1 })
})

// ---- 配置
ok('Config 字段齐全', () => {
  const required = [
    'enabled',
    'intervalMinutes',
    'minReportChars',
    'reportMarkers',
    'maxNudgesPerTurn',
    'backoffAfter',
    'backoffFactor',
    'locale',
    'includeActions',
    'actionCount',
    'detailEvery',
    'stuckDetection',
    'stuckThreshold',
    'subagentSummary',
    'subagentStaleMinutes',
    'statusFile',
    'statusDir',
    'commandEnabled',
  ]
  const dict = Config.dict ?? {}
  for (const key of required) assert.ok(dict[key], `missing ${key}`)
  for (const key of required) assert.equal(dict[key].meta?.volatile, true, `${key} 未标记 volatile`)
})

// ---- 模块形状：决定设置页能不能拿到 Config
ok('模块无 default export，且命名空间带 apply + Config', () => {
  assert.equal('default' in moduleNamespace, false, 'default export 会让 loader unwrap 成函数，Config 丢失')
  assert.equal(typeof moduleNamespace.apply, 'function')
  assert.equal(typeof moduleNamespace.Config?.toJSON, 'function')
})

// ---- 回归：真实 cordis 的 ctx 是代理，未 inject 的属性访问即抛
// `cannot get property "config" without inject`。0.3.1 曾在 apply 里读 ctx.config，
// 导致整插件 boot 失败（“web boot: 1 entry did not activate”）。
{
  const events = []
  const fakeCtx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'on') return (name, fn) => { events.push(name) }
      if (prop === 'remote') return { settings: { describe: async () => ({ ok: false, error: { message: 'test' } }), mutate: async () => ({ ok: false }) }, $on: () => () => {} }
      if (prop === 'get') return () => undefined
      if (prop === 'logger') return () => ({ info() {}, warn() {}, error() {}, debug() {} })
      if (prop === 'inject') return undefined
      throw new Error(`cannot get property "${String(prop)}" without inject`)
    },
  })
  await moduleNamespace.apply(fakeCtx, { statusFile: false, intervalMinutes: 7 })
  assert.ok(events.includes('agent/pre-step'), 'apply 应注册 agent/pre-step')
  assert.ok(events.includes('agent/status'), 'apply 应注册 agent/status')
  passed += 1
}

// ---- 客户端 entry：ctx 同样是代理，未 inject 的属性读取即抛
{
  let plugin = null
  globalThis.window = {
    __ModuleLoader__: {
      load: ({ id, factory }) => { plugin = factory(() => ({ createElement: (...args) => ({ args }) })) },
    },
  }
  await import('./client/client.js')
  for (const dep of ['slots', 'remote', 'remote.settings']) {
    assert.equal(plugin.inject.includes(dep), true, `client entry 必须 inject ${dep}`)
  }
  const calls = []
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'slots') return {
        inject: (name, fn) => { calls.push(['inject', name]); return fn() },
        register: (meta, render) => { calls.push(['register', meta.name, meta.id]); return () => {} },
      }
      if (prop === 'get') return () => undefined
      if (prop === 'effect') return () => {}
      throw new Error(`cannot get property "${String(prop)}" without inject`)
    },
  })
  plugin.apply(ctx)
  assert.deepEqual(calls[1], ['register', 'settings.section', 'progress-tick'])
  passed += 1
  delete globalThis.window
}

// ---- 回归（A4）：用户刚插话的 step 不再注入“你没汇报”
// 真实宿主会把 decision.messages 一起 append 成 user/message，所以这里断言：
// 带 source.kind==='user' 的 step 不塞 progress-tick 提醒，且计时重锚。
{
  const handlers = new Map()
  const fakeCtx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'on') return (name, fn) => { handlers.set(name, fn) }
      if (prop === 'get') return () => undefined
      if (prop === 'logger') return () => ({ info() {}, warn() {} })
      if (prop === 'inject') return undefined
      throw new Error(`cannot get property "${String(prop)}" without inject`)
    },
  })
  const config = { statusFile: false, intervalMinutes: 0.17, backoffAfter: 99, detailEvery: 1 }
  await moduleNamespace.apply(fakeCtx, config)

  const realNow = Date.now
  let clock = realNow()
  Date.now = () => clock
  try {
    const agent = { session: { id: 'session-a4', header: {} } }
    handlers.get('agent/status')({ agent, status: 'running' })
    clock += 11_000

    const first = { kind: 'enter', messages: [] }
    await handlers.get('agent/pre-step')({ agent }, async () => first)
    assert.equal(first.messages.filter((m) => m.source?.kind === 'progress-tick').length, 1, '静默超时应提醒一次')

    clock += 11_000
    const second = {
      kind: 'enter',
      messages: [{ id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '现在怎么样？' }] }],
    }
    await handlers.get('agent/pre-step')({ agent }, async () => second)
    assert.equal(second.messages.length, 1, '用户插话时不应再注入提醒')

    const row = statusSnapshot(config).sessions.find((item) => item.id === 'session-a4')
    assert.ok(row, '状态快照里应能看到该会话')
    assert.ok(row.sinceReportMs < 1000, '用户插话后应重锚计时')
    passed += 1
  } finally {
    Date.now = realNow
    // 清掉本用例留下的会话状态，后面「状态页空快照」的断言才成立
    handlers.get('dispose')?.()
  }
}

// ---- 回归（P0）：tool 参数是 JSON 字符串、isError 失败、标题来源
{
  const handlers = new Map()
  const fakeCtx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'on') return (name, fn) => { handlers.set(name, fn) }
      if (prop === 'get') return () => undefined
      if (prop === 'logger') return () => ({ info() {}, warn() {} })
      if (prop === 'inject') return undefined
      throw new Error(`cannot get property "${String(prop)}" without inject`)
    },
  })
  const config = { statusFile: false, intervalMinutes: 5 }
  await moduleNamespace.apply(fakeCtx, config)
  try {
    const session = { id: 'session-p0', header: { cwd: '/tmp/demo' } }
    const bigArgs = JSON.stringify({
      command: 'curl -H "Authorization: Bearer SECRET" https://example.test',
      description: 'x'.repeat(800),
    })
    handlers.get('session/event')(session, { type: 'tool/call', data: { name: 'bash', arguments: bigArgs } })
    handlers.get('session/event')(session, { type: 'tool/result', data: { message: { isError: true } } })

    const row = () => statusSnapshot(config).sessions.find((item) => item.id === 'session-p0')
    assert.equal(row().lastAction.name, 'bash')
    assert.ok(row().lastAction.target.startsWith('curl -H'), '应取解析后的 command，而不是原始 JSON')
    assert.ok(!row().lastAction.target.includes('"command"'), '不应把原始 JSON 当摘要')
    assert.ok(row().lastAction.target.length <= 81, 'lastAction.target 应被截断')
    assert.equal(row().lastAction.failed, true, 'message.isError 应计为失败')

    // 本插件注入的提醒也是 user/message，但不能影响语言判定或标题
    handlers.get('session/event')(session, {
      type: 'user/message',
      data: { role: 'user', source: { kind: 'progress-tick' }, content: [{ type: 'text', text: '【进度播报】请汇报' }] },
    })
    assert.equal(row().title, '', '插件自己的提醒不应被当成用户消息')
    passed += 1

    // 自动标题 / 用户重命名都走 session/title
    handlers.get('session/event')(session, { type: 'session/title', data: { title: '真实会话标题' } })
    assert.equal(row().title, '真实会话标题')
    passed += 1
  } finally {
    handlers.get('dispose')?.()
  }
}

// ---- 回归（P0）：达到 maxNudgesPerTurn 后不再注入，快照也不显示倒计时
{
  const handlers = new Map()
  const fakeCtx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'on') return (name, fn) => { handlers.set(name, fn) }
      if (prop === 'get') return () => undefined
      if (prop === 'logger') return () => ({ info() {}, warn() {} })
      if (prop === 'inject') return undefined
      throw new Error(`cannot get property "${String(prop)}" without inject`)
    },
  })
  const config = { statusFile: false, intervalMinutes: 0.17, maxNudgesPerTurn: 1, backoffAfter: 99, detailEvery: 1 }
  await moduleNamespace.apply(fakeCtx, config)
  const realNow = Date.now
  let clock = realNow()
  Date.now = () => clock
  try {
    const agent = { session: { id: 'session-cap', header: {} } }
    handlers.get('agent/status')({ agent, status: 'running' })
    clock += 11_000
    const first = { kind: 'enter', messages: [] }
    await handlers.get('agent/pre-step')({ agent }, async () => first)
    assert.equal(first.messages.length, 1, '第一次超时应提醒')

    clock += 11_000
    const second = { kind: 'enter', messages: [] }
    await handlers.get('agent/pre-step')({ agent }, async () => second)
    assert.equal(second.messages.length, 0, '达到本轮上限后不再注入')

    const row = statusSnapshot(config).sessions.find((item) => item.id === 'session-cap')
    assert.equal(row.capped, true, '快照应标记 capped')
    assert.equal(row.nextInMs, 0, 'capped 时不应再给倒计时')
    assert.equal(row.overdue, false, 'capped 时不应显示待提醒')
    passed += 1
  } finally {
    Date.now = realNow
    handlers.get('dispose')?.()
  }
}

// ---- 回归（P0）：commandEnabled=false 时不注册 /progress
{
  let registered = 0
  const fakeCtx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'on') return () => {}
      if (prop === 'get') return (name) => (name === 'commands' ? { register: () => { registered += 1 } } : undefined)
      if (prop === 'logger') return () => ({ info() {}, warn() {} })
      if (prop === 'inject') return undefined
      throw new Error(`cannot get property "${String(prop)}" without inject`)
    },
  })
  await moduleNamespace.apply(fakeCtx, { statusFile: false, commandEnabled: false })
  assert.equal(registered, 0, 'commandEnabled=false 不应注册命令')
  passed += 1
}

console.log(`✓ ${passed} 项断言通过`)

// --- 状态页数据源（/api/progress-tick/status） ---
{
  const snapshot = statusSnapshot({ intervalMinutes: 5, stuckThreshold: 3 })
  assert.equal(typeof snapshot.now, 'number')
  assert.ok(snapshot.now > 0)
  assert.equal(Array.isArray(snapshot.sessions), true)
  assert.equal(snapshot.sessions.length, 0)
  assert.equal(snapshot.intervalMinutes, 5)
  assert.equal(snapshot.enabled, true)
  const disabled = statusSnapshot({ intervalMinutes: 5, enabled: false })
  assert.equal(disabled.enabled, false)
}
console.log('progress-tick: all assertions passed')
