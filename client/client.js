/**
 * dsh-progress-tick — settings section.
 *
 * Registers a first-level section in the Settings panel (slot `settings.section`,
 * the same slot dshmarket itself uses) and renders a small form bound to this
 * plugin's own configuration namespace. Reads ride `remote.settings.describe()`,
 * writes go through `remote.settings.mutate(ns, ops, revision)` — the same
 * revision-fenced path the official settings form uses.
 */
window.__ModuleLoader__.load({
  id: 'dsh-progress-tick',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const NS = 'progress-tick'

    /** Field presentation: label and hint, in display order. */
    const FIELDS = [
      ['enabled', '启用', '关闭后不再注入任何进度提醒'],
      ['intervalMinutes', '间隔（分钟）', '本轮任务连续执行这么久没有汇报就提醒一次'],
      ['minReportChars', '最少正文字数', '回复正文少于这个字数不算“汇报过”'],
      ['reportMarkers', '汇报关键词', '逗号分隔；出现任一词即视为汇报过'],
      ['maxNudgesPerTurn', '每轮最多提醒次数', '0 = 不限制'],
      ['backoffAfter', '退避起点', '同一轮里提醒超过这个次数后开始拉长间隔'],
      ['backoffFactor', '退避倍数', '每次再乘这个倍数，最多 8 倍'],
      ['detailEvery', '详细提醒频率', '每 N 次提醒带一次“最近动作”'],
      ['includeActions', '附带最近动作', '提醒里列出最近调用的工具'],
      ['actionCount', '附带动作条数', '最多列出几条'],
      ['stuckDetection', '卡住检测', '连续重复同一动作时优先提醒'],
      ['stuckThreshold', '卡住阈值', '同一动作连续出现几次算卡住'],
      ['subagentSummary', '子 agent 汇总', '把子 agent 的动静并进提醒'],
      ['subagentStaleMinutes', '子 agent 停滞（分钟）', '子 agent 这么久没动静就提示主 agent'],
      ['statusFile', '写入状态文件', '在状态目录里记录每个会话的计时'],
      ['statusDir', '状态目录', '留空用默认目录'],
      ['locale', '语言', 'auto / zh / en'],
      ['commandEnabled', '启用 /progress', '允许用 /progress 立即催一次'],
    ]

    const styles = {
      wrap: { display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '720px' },
      hint: { fontSize: '12px', opacity: 0.7, lineHeight: 1.6 },
      grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 22px' },
      row: { display: 'flex', flexDirection: 'column', gap: '4px' },
      label: { fontSize: '13px', fontWeight: 600 },
      note: { fontSize: '11px', opacity: 0.6, lineHeight: 1.5 },
      input: { width: '100%', boxSizing: 'border-box', padding: '6px 8px', font: 'inherit' },
      actions: { display: 'flex', gap: '8px', alignItems: 'center' },
      btn: { padding: '6px 14px', font: 'inherit', cursor: 'pointer' },
      status: { fontSize: '12px', opacity: 0.75 },
      err: { fontSize: '12px', color: '#d9534f' },
    }

    function text(value) {
      if (value === null || value === undefined) return ''
      if (typeof value === 'string') return value
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
      return JSON.stringify(value)
    }

    function Section(props) {
      const ctx = props.ctx
      const remote = ctx.get('remote')
      const [state, setState] = React.useState({ phase: 'loading' })
      const [draft, setDraft] = React.useState({})
      const [saving, setSaving] = React.useState(false)
      const [notice, setNotice] = React.useState('')

      const load = React.useCallback(async () => {
        setState({ phase: 'loading' })
        try {
          const reply = await remote.settings.describe()
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
      }, [remote])

      React.useEffect(() => { load() }, [load])

      React.useEffect(() => {
        try {
          const off = remote.$on('settings/document-updated', (ns) => {
            if (ns === NS) load()
          })
          return typeof off === 'function' ? off : undefined
        } catch (error) {
          return undefined
        }
      }, [remote, load])

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
          const reply = await remote.settings.mutate(NS, ops, state.row.revision)
          if (!reply || !reply.ok) {
            setNotice('')
            setState({ phase: 'error', message: (reply && reply.error && reply.error.message) || '保存失败' })
            await load()
            return
          }
          setNotice('已保存，下一轮任务起生效')
          await load()
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
          const reply = await remote.settings.mutate(NS, ops, state.row.revision)
          if (reply && reply.ok) { setNotice('已恢复默认值'); await load() }
          else setState({ phase: 'error', message: (reply && reply.error && reply.error.message) || '恢复失败' })
        } finally {
          setSaving(false)
        }
      }

      if (state.phase === 'loading') {
        return h('div', { style: styles.wrap }, h('div', { style: styles.hint }, '正在读取配置…'))
      }
      if (state.phase === 'missing') {
        return h('div', { style: styles.wrap },
          h('div', { style: styles.label }, '进度播报'),
          h('div', { style: styles.note },
            '没有读到 progress-tick 的配置项。通常是因为宿主还在跑旧版本：完全退出并重新执行 dsh web 后，这一项就会出现。'))
      }
      if (state.phase === 'error') {
        return h('div', { style: styles.wrap },
          h('div', { style: styles.label }, '进度播报'),
          h('div', { style: styles.err }, state.message),
          h('div', { style: styles.actions }, h('button', { style: styles.btn, onClick: load }, '重试')))
      }

      const fields = FIELDS.filter(([key]) => key in state.row.value)
      const rows = fields.map(([key, label, note]) => {
        const value = draft[key]
        let control
        if (typeof value === 'boolean') {
          control = h('input', {
            type: 'checkbox',
            checked: !!value,
            onChange: (event) => change(key, event.target.checked),
          })
        } else if (typeof value === 'number') {
          control = h('input', {
            type: 'number',
            style: styles.input,
            value: String(value),
            onChange: (event) => change(key, event.target.value === '' ? 0 : Number(event.target.value)),
          })
        } else {
          control = h('input', {
            type: 'text',
            style: styles.input,
            value: text(value),
            onChange: (event) => change(key, event.target.value),
          })
        }
        return h('div', { key, style: styles.row },
          h('label', { style: styles.label }, label),
          control,
          h('div', { style: styles.note }, note))
      })

      return h('div', { style: styles.wrap },
        h('div', { style: styles.hint },
          '主 agent 在一次任务里连续执行超过设定时长、又没有汇报进度时，会自动向它注入一条提醒（子 agent 不提醒）。改动保存后立即对本进程生效。'),
        h('div', { style: styles.grid }, rows),
        h('div', { style: styles.actions },
          h('button', { style: styles.btn, disabled: saving, onClick: save }, saving ? '保存中…' : '保存'),
          h('button', { style: styles.btn, disabled: saving, onClick: reset }, '恢复默认'),
          h('button', { style: styles.btn, disabled: saving, onClick: load }, '重新读取')),
        notice ? h('div', { style: styles.status }, notice) : null)
    }

    function apply(ctx) {
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'progress-tick',
        order: 60,
        label: () => '进度播报',
      }, () => h(Section, { ctx })))
    }

    return { name: 'dsh-progress-tick', inject: [], apply }
  }
})
