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

console.log(`✓ ${passed} 项断言通过`)
