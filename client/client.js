/**
 * dsh-progress-tick — settings section.
 *
 * Registers a first-level section in the Settings panel (slot `settings.section`,
 * the same slot dshmarket itself uses) and renders a small form bound to this
 * plugin's own configuration namespace. Reads ride `remote.settings.describe()`,
 * writes go through `remote.settings.mutate(ns, ops, revision)` — the same
 * revision-fenced path the official settings form uses.
 *
 * 视觉上只依赖 currentColor 与 --dsw-radius-* token，不写死主题色，
 * 因此浅色/深色以及换肤时会自动跟随宿主外观。
 */
window.__ModuleLoader__.load({
  id: 'dsh-progress-tick',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const NS = 'progress-tick'

    function withTimeout(promise, ms) {
      return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`请求超时（${ms}ms）`)), ms)),
      ])
    }

    const ACCENT = 'rgb(17, 168, 155)'
    const LINE = 'color-mix(in oklab, currentColor 16%, transparent)'
    const SURFACE = 'color-mix(in oklab, currentColor 4%, transparent)'
    const FIELD_BG = 'color-mix(in oklab, currentColor 6%, transparent)'
    const INK = 'inherit'

    const STYLE_ID = 'dsh-progress-tick-style'

    /** 交互态（hover/focus）只能靠样式表，这里注入一次。 */
    function ensureStyle() {
      if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
      const el = document.createElement('style')
      el.id = STYLE_ID
      el.textContent = `
        .ptick-field {
          transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
        }
        .ptick-field:hover {
          border-color: color-mix(in oklab, currentColor 28%, transparent) !important;
        }
        .ptick-field:focus {
          border-color: ${ACCENT} !important;
          box-shadow: 0 0 0 3px color-mix(in oklab, ${ACCENT} 16%, transparent);
          background: transparent !important;
        }
        .ptick-btn {
          transition: background .15s ease, opacity .15s ease;
        }
        .ptick-btn:hover:not(:disabled) {
          background: color-mix(in oklab, currentColor 8%, transparent);
        }
        .ptick-btn-primary:hover:not(:disabled) {
          filter: brightness(1.06);
        }
        .ptick-btn:disabled, .ptick-btn-primary:disabled {
          opacity: .6;
          cursor: default;
        }
      `
      document.head.appendChild(el)
    }

    const styles = {
      root: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: '780px',
        color: INK,
        fontSize: '14px',
        lineHeight: 1.5,
        paddingBottom: '8px',
      },
      intro: {
        fontSize: '13px',
        lineHeight: 1.7,
        opacity: 0.72,
      },
      card: {
        border: `1px solid ${LINE}`,
        borderRadius: 'var(--dsw-radius-lg, 16px)',
        background: SURFACE,
        padding: '2px 18px',
      },
      group: {
        padding: '14px 0',
      },
      groupDivider: {
        borderTop: `1px solid ${LINE}`,
      },
      groupTitle: {
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        opacity: 0.5,
        marginBottom: '2px',
      },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        padding: '11px 0',
      },
      rowMain: {
        flex: '1 1 auto',
        minWidth: 0,
      },
      label: {
        fontSize: '14px',
      },
      hint: {
        fontSize: '12px',
        lineHeight: 1.55,
        opacity: 0.62,
        marginTop: '2px',
      },
      control: {
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      },
      input: {
        boxSizing: 'border-box',
        width: '120px',
        height: '32px',
        padding: '0 10px',
        font: 'inherit',
        fontSize: '13px',
        color: INK,
        background: FIELD_BG,
        border: `1px solid ${LINE}`,
        borderRadius: 'var(--dsw-radius-sm, 8px)',
        outline: 'none',
      },
      inputWide: {
        width: '360px',
      },
      select: {
        boxSizing: 'border-box',
        width: '120px',
        height: '32px',
        padding: '0 8px',
        font: 'inherit',
        fontSize: '13px',
        color: INK,
        background: FIELD_BG,
        border: `1px solid ${LINE}`,
        borderRadius: 'var(--dsw-radius-sm, 8px)',
        outline: 'none',
        cursor: 'pointer',
      },
      footer: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
      },
      btn: {
        height: '32px',
        padding: '0 16px',
        font: 'inherit',
        fontSize: '13px',
        color: INK,
        background: 'transparent',
        border: `1px solid ${LINE}`,
        borderRadius: 'var(--dsw-radius-sm, 8px)',
        cursor: 'pointer',
      },
      btnPrimary: {
        height: '32px',
        padding: '0 18px',
        font: 'inherit',
        fontSize: '13px',
        fontWeight: 500,
        color: '#fff',
        background: ACCENT,
        border: '1px solid transparent',
        borderRadius: 'var(--dsw-radius-sm, 8px)',
        cursor: 'pointer',
      },
      status: {
        fontSize: '12px',
        opacity: 0.7,
      },
      err: {
        fontSize: '12px',
        color: 'rgb(217, 83, 79)',
      },
    }

    /** DSH 同款开关：20px 高胶囊，开启时品牌青绿。 */
    function Switch(props) {
      const on = !!props.checked
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': on ? 'true' : 'false',
        'aria-label': props.label,
        disabled: props.disabled,
        onClick: () => props.onChange(!on),
        style: {
          boxSizing: 'border-box',
          width: '36px',
          height: '20px',
          padding: '2px',
          borderRadius: '999px',
          border: 'none',
          cursor: props.disabled ? 'default' : 'pointer',
          background: on ? ACCENT : 'color-mix(in oklab, currentColor 18%, transparent)',
          opacity: props.disabled ? 0.5 : 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: on ? 'flex-end' : 'flex-start',
          transition: 'background .18s ease',
        },
      }, h('span', {
        style: {
          display: 'block',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 2px rgba(0, 0, 0, .18)',
        },
      }))
    }

    const FIELDS = {
      enabled: ['启用', '关闭后不再注入任何进度提醒'],
      intervalMinutes: ['间隔（分钟）', '本轮任务连续执行这么久没有汇报就提醒一次'],
      minReportChars: ['最少正文字数', '回复正文少于这个字数不算“汇报过”'],
      reportMarkers: ['汇报关键词', '逗号分隔；出现任一词即视为汇报过'],
      maxNudgesPerTurn: ['每轮最多提醒次数', '0 = 不限制'],
      backoffAfter: ['退避起点', '同一轮里提醒超过这个次数后开始拉长间隔'],
      backoffFactor: ['退避倍数', '每次再乘这个倍数，最多 8 倍'],
      detailEvery: ['详细提醒频率', '每 N 次提醒带一次“最近动作”'],
      includeActions: ['附带最近动作', '提醒里列出最近调用的工具'],
      actionCount: ['附带动作条数', '最多列出几条'],
      stuckDetection: ['卡住检测', '连续重复同一动作时优先提醒'],
      stuckThreshold: ['卡住阈值', '同一动作连续出现几次算卡住'],
      subagentSummary: ['子 agent 汇总', '把子 agent 的动静并进提醒'],
      subagentStaleMinutes: ['子 agent 停滞（分钟）', '子 agent 这么久没动静就提示主 agent'],
      statusFile: ['写入状态文件', '在状态目录里记录每个会话的计时'],
      statusDir: ['状态目录', '留空用默认目录'],
      locale: ['语言', 'auto / zh / en'],
      commandEnabled: ['启用 /progress', '允许用 /progress 立即催一次'],
    }

    const GROUPS = [
      { title: '基础节奏', keys: ['enabled', 'intervalMinutes'] },
      { title: '汇报判定', keys: ['minReportChars', 'reportMarkers'] },
      { title: '提醒策略', keys: ['maxNudgesPerTurn', 'backoffAfter', 'backoffFactor', 'detailEvery', 'includeActions', 'actionCount'] },
      { title: '卡住与子 agent', keys: ['stuckDetection', 'stuckThreshold', 'subagentSummary', 'subagentStaleMinutes'] },
      { title: '存储与命令', keys: ['statusFile', 'statusDir', 'locale', 'commandEnabled'] },
    ]

    function text(value) {
      if (value === null || value === undefined) return ''
      if (typeof value === 'string') return value
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
      return JSON.stringify(value)
    }

    function Section(props) {
      const ctx = props.ctx
      const [state, setState] = React.useState({ phase: 'loading' })
      const [draft, setDraft] = React.useState({})
      const [saving, setSaving] = React.useState(false)
      const [notice, setNotice] = React.useState('')

      const load = React.useCallback(async (quiet) => {
        setState({ phase: 'loading' })
        if (!quiet) setNotice('')
        try {
          const reply = await withTimeout(ctx.remote.settings.describe(), 8000)
          if (!reply || !reply.ok) {
            setState({ phase: 'error', message: reply && reply.error ? reply.error.message : '读取配置失败' })
            return
          }
          const row = (reply.value.namespaces || []).find((item) => item.ns === NS)
          if (!row) {
            setState({ phase: 'missing' })
            return
          }
          setState({ phase: 'ready', row })
          setDraft(Object.assign({}, row.value))
        } catch (error) {
          setState({ phase: 'error', message: String((error && error.message) || error) })
        }
      }, [ctx])

      React.useEffect(() => { load() }, [load])

      React.useEffect(() => {
        try {
          const remote = ctx.remote
          const off = remote && remote.$on ? remote.$on('settings/document-updated', (ns) => {
            if (ns === NS) load()
          }) : undefined
          return typeof off === 'function' ? off : undefined
        } catch (error) {
          return undefined
        }
      }, [ctx, load])

      const change = (key, value) => setDraft((prev) => Object.assign({}, prev, { [key]: value }))

      const save = async () => {
        if (state.phase !== 'ready') return
        const ops = []
        for (const key of Object.keys(draft)) {
          if (draft[key] !== state.row.value[key]) {
            ops.push({ op: 'set', path: [key], value: draft[key] })
          }
        }
        if (ops.length === 0) { setNotice('没有改动'); return }
        setSaving(true)
        setNotice('')
        try {
          const reply = await withTimeout(ctx.remote.settings.mutate(NS, ops, state.row.revision), 8000)
          if (!reply || !reply.ok) {
            setState({ phase: 'error', message: (reply && reply.error && reply.error.message) || '保存失败' })
            return
          }
          await load(true)
          setNotice('已保存，立即生效')
        } catch (error) {
          setState({ phase: 'error', message: String((error && error.message) || error) })
        } finally {
          setSaving(false)
        }
      }

      const reset = async () => {
        if (state.phase !== 'ready') return
        const ops = Object.keys(state.row.user || {}).map((key) => ({ op: 'unset', path: [key] }))
        if (ops.length === 0) { setNotice('已经是默认值'); return }
        setSaving(true)
        try {
          const reply = await withTimeout(ctx.remote.settings.mutate(NS, ops, state.row.revision), 8000)
          if (reply && reply.ok) { await load(true); setNotice('已恢复默认值') }
          else setState({ phase: 'error', message: (reply && reply.error && reply.error.message) || '恢复失败' })
        } catch (error) {
          setState({ phase: 'error', message: String((error && error.message) || error) })
        } finally {
          setSaving(false)
        }
      }

      if (state.phase === 'loading') {
        return h('div', { style: styles.root }, h('div', { style: styles.intro }, '正在读取配置…'))
      }
      if (state.phase === 'missing') {
        return h('div', { style: styles.root },
          h('div', { style: styles.intro },
            '没有读到 progress-tick 的配置项。通常是因为宿主还在跑旧版本：完全退出并重新执行 dsh web 后，这一项就会出现。'))
      }
      if (state.phase === 'error') {
        return h('div', { style: styles.root },
          h('div', { style: styles.err }, state.message),
          h('div', { style: styles.footer }, h('button', { className: 'ptick-btn', style: styles.btn, onClick: load }, '重试')))
      }

      const field = (key) => {
        const meta = FIELDS[key]
        if (!meta) return null
        const label = meta[0]
        const hint = meta[1]
        const value = draft[key]
        let control
        if (typeof value === 'boolean') {
          control = h(Switch, {
            checked: !!value,
            label,
            disabled: saving,
            onChange: (next) => change(key, next),
          })
        } else if (typeof value === 'number') {
          control = h('input', {
            type: 'number',
            className: 'ptick-field',
            style: styles.input,
            value: String(value),
            disabled: saving,
            onChange: (event) => change(key, event.target.value === '' ? 0 : Number(event.target.value)),
          })
        } else if (key === 'locale') {
          const options = ['auto', 'zh', 'en']
          const current = text(value)
          if (!options.includes(current)) options.push(current)
          control = h('select', {
            className: 'ptick-field',
            style: styles.select,
            value: current,
            disabled: saving,
            onChange: (event) => change(key, event.target.value),
          }, options.map((option) => h('option', { key: option, value: option }, option)))
        } else {
          const wide = key === 'reportMarkers' || key === 'statusDir'
          control = h('input', {
            type: 'text',
            className: 'ptick-field',
            style: wide ? Object.assign({}, styles.input, styles.inputWide) : Object.assign({}, styles.input, { width: '220px' }),
            value: text(value),
            disabled: saving,
            onChange: (event) => change(key, event.target.value),
          })
        }
        return h('div', { key, style: styles.row },
          h('div', { style: styles.rowMain },
            h('div', { style: styles.label }, label),
            h('div', { style: styles.hint }, hint)),
          h('div', { style: styles.control }, control))
      }

      const groups = GROUPS.map((group, index) => {
        const rows = group.keys.filter((key) => key in state.row.value).map(field).filter(Boolean)
        if (rows.length === 0) return null
        return h('div', {
          key: group.title,
          style: index === 0 ? styles.group : Object.assign({}, styles.group, styles.groupDivider),
        },
        h('div', { style: styles.groupTitle }, group.title),
        rows)
      }).filter(Boolean)

      return h('div', { style: styles.root },
        h('div', { style: styles.intro },
          '主 agent 在一次任务里连续执行超过设定时长、又没有汇报进度时，会自动向它注入一条提醒（子 agent 不提醒）。改动保存后立即对本进程生效。'),
        h('div', { style: styles.card }, groups),
        h('div', { style: styles.footer },
          h('button', { className: 'ptick-btn ptick-btn-primary', style: styles.btnPrimary, disabled: saving, onClick: save }, saving ? '保存中…' : '保存'),
          h('button', { className: 'ptick-btn', style: styles.btn, disabled: saving, onClick: reset }, '恢复默认'),
          h('button', { className: 'ptick-btn', style: styles.btn, disabled: saving, onClick: load }, '重新读取'),
          notice ? h('span', { style: styles.status }, notice) : null))
    }

    function apply(ctx) {
      ensureStyle()
      // 客户端 ctx 是代理：未在 inject 里声明的属性（如 slots）读取即抛
      // `cannot get property "slots" without inject`，会让整个 client entry 激活失败。
      try {
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'progress-tick',
          order: 60,
          label: () => '进度播报',
        }, () => h(Section, { ctx })))
      } catch (error) {
        console.error('[progress-tick] settings section registration failed:', error)
      }
    }

    return { name: 'dsh-progress-tick', inject: ['slots', 'remote', 'remote.settings'], apply }
  },
})
