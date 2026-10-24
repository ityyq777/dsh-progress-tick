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
    // 样式表随版本换代：旧版本注入的 <style> 仍在页面里时按 rev 替换，
    // 否则新加的类名没有规则，控件会退回浏览器默认样式（0.5.0 升级时踩过）。
    const STYLE_REV = '0.5.1'

    function ensureStyle() {
      if (typeof document === 'undefined') return
      const current = document.getElementById(STYLE_ID)
      if (current && current.getAttribute('data-rev') === STYLE_REV) return
      if (current) current.remove()
      const el = document.createElement('style')
      el.id = STYLE_ID
      el.setAttribute('data-rev', STYLE_REV)
      el.textContent = `
    .ptick-page{--ptick-accent:rgb(17,168,155);--ptick-line:var(--dsw-alias-border-l2,color-mix(in oklab,currentColor 16%,transparent));--ptick-surface:var(--dsw-alias-bg-layer-3,color-mix(in oklab,currentColor 4%,transparent));display:flex;flex-direction:column;height:100%;box-sizing:border-box;overflow:auto;color:inherit;font-size:13px;background:var(--dsw-alias-bg-layer-2,color-mix(in oklab,currentColor 4%,transparent));padding:24px 28px}
    .ptick-inner{display:flex;flex-direction:column;gap:16px;width:100%;max-width:1040px;margin:0 auto}
    .ptick-page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .ptick-page-title{font-size:18px;font-weight:650;letter-spacing:.2px}
    .ptick-page-sub{margin-top:4px;font-size:12px;opacity:.62;line-height:1.5}
    .ptick-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;font-size:12px;border:1px solid var(--ptick-line);background:color-mix(in oklab,currentColor 5%,transparent)}
    .ptick-pill b{font-weight:650}
    .ptick-list{display:flex;flex-direction:column;gap:10px}
    .ptick-card2{border:1px solid var(--ptick-line);background:color-mix(in oklab,currentColor 4%,transparent);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;transition:border-color .15s ease,background .15s ease}
    .ptick-card2:hover{border-color:color-mix(in oklab,currentColor 26%,transparent)}
    .ptick-card2-top{display:flex;align-items:center;gap:10px;min-width:0}
    .ptick-dot{width:8px;height:8px;border-radius:999px;flex:none;background:color-mix(in oklab,currentColor 30%,transparent)}
    .ptick-dot.is-live{background:var(--ptick-accent);box-shadow:0 0 0 0 color-mix(in oklab,var(--ptick-accent) 55%,transparent);animation:ptick-pulse 1.8s ease-out infinite}
    @keyframes ptick-pulse{0%{box-shadow:0 0 0 0 color-mix(in oklab,var(--ptick-accent) 50%,transparent)}100%{box-shadow:0 0 0 7px color-mix(in oklab,var(--ptick-accent) 0%,transparent)}}
    .ptick-card2-title{font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
    .ptick-card2-where{font-size:11.5px;opacity:.5;font-family:var(--dsw-font-family,inherit);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:38%}
    .ptick-card2-meta{display:flex;gap:18px;flex-wrap:wrap;font-size:12px;opacity:.78}
    .ptick-card2-meta span{white-space:nowrap}
    .ptick-card2-meta b{font-weight:650;font-variant-numeric:tabular-nums}
    .ptick-bar{height:5px;border-radius:999px;background:color-mix(in oklab,currentColor 10%,transparent);overflow:hidden}
    .ptick-bar-fill{height:100%;border-radius:999px;background:var(--ptick-accent);transition:width .5s linear}
    .ptick-card2-foot{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;opacity:.55;flex-wrap:wrap}
    .ptick-empty{border:1px dashed var(--ptick-line);border-radius:12px;padding:34px 20px;text-align:center;opacity:.7;font-size:12.5px;background:color-mix(in oklab,currentColor 3%,transparent)}
    .ptick-badge{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--ptick-line);background:color-mix(in oklab,currentColor 8%,transparent);opacity:.85}
    .ptick-badge.warn{color:rgb(196,120,26);border-color:color-mix(in oklab,rgb(196,120,26) 45%,transparent)}
    .ptick-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px}
    .ptick-search{flex:1 1 220px;min-width:170px;height:32px;padding:0 11px;border-radius:9px;border:1px solid var(--ptick-line);background:color-mix(in oklab,currentColor 5%,transparent);color:inherit;font:inherit;font-size:12.5px;outline:none;transition:border-color .15s ease,box-shadow .15s ease}
    .ptick-search::placeholder{color:currentColor;opacity:.4}
    .ptick-search:focus{border-color:var(--ptick-accent);box-shadow:0 0 0 3px color-mix(in oklab,var(--ptick-accent) 15%,transparent)}
    .ptick-chips{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--ptick-line);border-radius:10px;background:color-mix(in oklab,currentColor 4%,transparent);flex-wrap:wrap}
    .ptick-chip{border:0;border-radius:7px;padding:5px 10px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;opacity:.72;transition:background .15s ease,opacity .15s ease}
    .ptick-chip:hover{background:color-mix(in oklab,currentColor 9%,transparent);opacity:1}
    .ptick-chip.is-active{background:color-mix(in oklab,var(--ptick-accent) 18%,transparent);opacity:1;font-weight:600}
    .ptick-hint{border:1px dashed var(--ptick-line);border-radius:10px;padding:9px 12px;font-size:12px;opacity:.75;background:color-mix(in oklab,currentColor 3%,transparent)}
    .ptick-live{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;opacity:.6;white-space:nowrap}
    .ptick-card2-actions{display:flex;gap:8px;margin-left:auto;flex:none}
    .ptick-mini{height:26px;padding:0 10px;font-size:12px;border-radius:7px;border:1px solid var(--ptick-line);background:transparent;color:inherit;cursor:pointer;white-space:nowrap}
    .ptick-mini:disabled{opacity:.45;cursor:default}
    .ptick-mini.is-primary{color:#fff;background:var(--ptick-accent);border-color:transparent}
    .ptick-detail{width:100%;max-width:1040px;margin:0 auto;box-sizing:border-box;padding:20px 28px 48px;display:flex;flex-direction:column;gap:16px}
    .ptick-detail-actions{display:flex;justify-content:flex-end;gap:8px}
    .ptick-detail-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:10px}
    .ptick-meta{display:flex;flex-direction:column;gap:2px;min-width:0}
    .ptick-meta span{font-size:11px;opacity:.55}
    .ptick-meta b{font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ptick-now{display:flex;flex-direction:column;gap:3px;border:1px solid color-mix(in oklab,var(--ptick-accent) 35%,transparent);background:color-mix(in oklab,var(--ptick-accent) 8%,transparent);border-radius:10px;padding:10px 12px;font-size:12.5px}
    .ptick-now code{font-family:var(--dsw-font-family,monospace);font-size:11px;opacity:.75;word-break:break-all}
    .ptick-actions{display:flex;gap:8px;flex-wrap:wrap}
    .ptick-sec h4{margin:0 0 8px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.5;font-weight:600}
    .ptick-sec-empty{font-size:12px;opacity:.5}
    .ptick-log,.ptick-tl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
    .ptick-log li{display:flex;align-items:center;gap:8px;font-size:12px;flex-wrap:wrap}
    .ptick-tl li{display:flex;align-items:center;gap:8px;font-size:12px;min-width:0}
    .ptick-tl-time{font-variant-numeric:tabular-nums;opacity:.6;font-size:11.5px;white-space:nowrap}
    .ptick-tl-dot{width:6px;height:6px;border-radius:99px;background:color-mix(in oklab,currentColor 45%,transparent);flex:none}
    .ptick-tl-dot.is-bad{background:rgb(217,83,79)}
    .ptick-tl-name{font-weight:600;white-space:nowrap}
    .ptick-tl-target{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.7;font-size:11.5px;font-family:var(--dsw-font-family,monospace)}
    .ptick-tl-ms{font-size:11px;opacity:.5;white-space:nowrap}
    .ptick-log-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.65}
    .ptick-log-elapsed{font-size:11.5px;opacity:.55;white-space:nowrap}
    .ptick-badge.ok{color:var(--ptick-accent);border-color:color-mix(in oklab,var(--ptick-accent) 45%,transparent)}
    .ptick-sub{border-left:2px solid var(--ptick-line);padding:4px 0 4px 10px;display:flex;flex-direction:column;gap:3px}
    .ptick-sub-line{display:flex;align-items:center;gap:8px;font-size:12px;flex-wrap:wrap}
    .ptick-sub-title{font-weight:600}
    .ptick-sub-meta{opacity:.55;font-size:11.5px}
    .ptick-sub-tool{font-family:var(--dsw-font-family,monospace);font-size:11px;opacity:.7;word-break:break-all}
    .ptick-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:rgba(24,24,24,.92);color:#fff;border-radius:10px;padding:9px 16px;font-size:12.5px;z-index:70;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:80vw}
    @media (prefers-reduced-motion: reduce){.ptick-dot.is-live{animation:none}}
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


    //#region 任务驾驶舱
    const REASON_LABEL = { timer: '计时', stuck: '卡住', manual: '手动' }
    const FILTERS = [
      ['all', '全部'],
      ['running', '运行中'],
      ['nudged', '已提醒'],
      ['stuck', '疑似卡住'],
      ['muted', '已静音'],
      ['idle', '已结束'],
    ]

    function pad2(value) {
      return String(value).padStart(2, '0')
    }

    function formatDuration(ms) {
      const total = Math.max(0, Math.round((Number(ms) || 0) / 1000))
      const hours = Math.floor(total / 3600)
      const minutes = Math.floor((total % 3600) / 60)
      const seconds = total % 60
      if (hours > 0) return `${hours} 小时 ${minutes} 分`
      if (minutes > 0) return `${minutes} 分 ${pad2(seconds)} 秒`
      return `${seconds} 秒`
    }

    function formatCountdown(ms) {
      const total = Math.max(0, Math.round((Number(ms) || 0) / 1000))
      const minutes = Math.floor(total / 60)
      const seconds = total % 60
      return `${minutes}:${pad2(seconds)}`
    }

    function clockText(at) {
      if (!at) return '—'
      const date = new Date(at)
      return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
    }

    /** 宿主版本至少为 major.minor（用于对旧宿主隐藏需要新端点的控件）。 */
    function versionAtLeast(version, major, minor) {
      const parts = String(version || '').split('.').map((part) => parseInt(part, 10) || 0)
      const majorPart = parts[0] || 0
      if (majorPart !== major) return majorPart > major
      return (parts[1] || 0) >= minor
    }

    function basename(path) {
      const value = String(path || '')
      const parts = value.split(/[\\/]/).filter(Boolean)
      return parts.length ? parts[parts.length - 1] : ''
    }

    /** 每秒重渲染一次，让“当前工具已耗时”在没有新快照时也继续走。 */
    function useNow(intervalMs) {
      const [now, setNow] = React.useState(Date.now())
      React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), intervalMs)
        return () => clearInterval(timer)
      }, [intervalMs])
      return now
    }

    async function postJson(action, body) {
      const response = await fetch(`api/progress-tick/${action}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-progress-tick': '1',
        },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload || !payload.ok) {
        throw new Error((payload && payload.error) || `HTTP ${response.status}`)
      }
      return payload.value
    }

    /**
     * 快照流：优先 SSE（`api/progress-tick/events`），首帧到之前以及断线期间用 5s 轮询兜底。
     * 两者读到的是同一份 `statusSnapshot()`，所以切换时不会跳变。
     */
    function useStatusStream() {
      const [state, setState] = React.useState({ phase: 'loading', value: null, live: false, message: '' })
      React.useEffect(() => {
        let alive = true
        let source = null
        let polling = 0
        let sawStream = false

        const apply = (value, live) => {
          if (!alive || !value) return
          setState({ phase: 'ready', value, live: Boolean(live), message: '' })
        }
        const fail = (message) => {
          if (!alive) return
          setState((prev) => ({ phase: prev.value ? 'ready' : 'error', value: prev.value, live: prev.live, message }))
        }
        const pollOnce = async () => {
          try {
            const response = await fetch('api/progress-tick/status', { headers: { accept: 'application/json' } })
            const payload = await response.json().catch(() => null)
            if (!alive) return
            if (!response.ok || !payload || !payload.ok) {
              fail((payload && payload.error) || `HTTP ${response.status}`)
              return
            }
            apply(payload.value, sawStream)
          } catch (error) {
            fail(String((error && error.message) || error))
          }
        }
        const startPolling = () => {
          if (polling) return
          polling = setInterval(() => { void pollOnce() }, 5000)
        }
        const stopPolling = () => {
          if (!polling) return
          clearInterval(polling)
          polling = 0
        }

        void pollOnce()
        startPolling()

        if (typeof window !== 'undefined' && typeof window.EventSource === 'function') {
          try {
            source = new window.EventSource('api/progress-tick/events')
            source.addEventListener('snapshot', (event) => {
              try {
                const value = JSON.parse(event.data)
                sawStream = true
                stopPolling() // 推送正常时不需要轮询，省掉每 5s 一次的全量快照
                apply(value, true)
              } catch (error) {
                // 帧格式异常：忽略这一帧，轮询仍在兜底。
              }
            })
            source.addEventListener('error', () => {
              // EventSource 自带重连；断开期间恢复轮询，直到下一帧推送到达。
              sawStream = false
              startPolling()
              setState((prev) => (prev.live ? { ...prev, live: false } : prev))
            })
          } catch (error) {
            // 浏览器禁用 EventSource：只走轮询。
          }
        }

        return () => {
          alive = false
          if (source) source.close()
          stopPolling()
        }
      }, [])
      return state
    }

    function StatusIcon({ size }) {
      return h('svg', {
        'data-dsh-panel-entry': 'progress-tick',
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
      h('circle', { cx: 8, cy: 8, r: 6.2 }),
      h('path', { d: 'M8 4.6v3.6l2.6 1.5' }),
      h('path', { d: 'M2.2 8a5.8 5.8 0 0 1 1.6-4' }))
    }

    function Meta({ label, value }) {
      return h('div', { className: 'ptick-meta' },
        h('span', null, label),
        h('b', { title: typeof value === 'string' ? value : undefined }, value))
    }

    function ActionRow({ action }) {
      return h('li', null,
        h('span', { className: action.failed ? 'ptick-tl-dot is-bad' : 'ptick-tl-dot' }),
        h('span', { className: 'ptick-tl-time' }, clockText(action.at)),
        h('span', { className: 'ptick-tl-name' }, action.name || 'tool'),
        action.target ? h('code', { className: 'ptick-tl-target', title: action.target }, action.target) : null,
        h('span', { className: 'ptick-tl-ms' }, action.ms ? formatDuration(action.ms) : ''))
    }

    function SubagentNode({ node, depth }) {
      return h('div', { className: 'ptick-sub', style: { marginLeft: depth * 12 } },
        h('div', { className: 'ptick-sub-line' },
          h('i', { className: node.done ? 'ptick-dot' : 'ptick-dot is-live' }),
          h('span', { className: 'ptick-sub-title' }, node.name || node.short),
          node.stale ? h('span', { className: 'ptick-badge warn' }, '停滞') : null,
          h('span', { className: 'ptick-sub-meta' },
            node.done ? '已完成' : `${formatDuration(node.elapsedMs)} · 静默 ${formatDuration(node.silentMs)}`)),
        node.currentTool
          ? h('div', { className: 'ptick-sub-tool' },
            `正在 ${node.currentTool.name} · ${formatDuration(node.currentTool.elapsedMs)}${node.currentTool.target ? ` · ${node.currentTool.target}` : ''}`)
          : null,
        (node.children || []).map((child) => h(SubagentNode, { key: child.id, node: child, depth: depth + 1 })))
    }

    /** 单会话进度详情：会话视图「进度」标签页的正文（不再用浮层）。 */
    function SessionDetail({ item, now, busy, onNudge, onMute }) {
      const tool = item.currentTool
      const logs = Array.isArray(item.nudgeLog) ? item.nudgeLog.slice().reverse() : []
      const actions = Array.isArray(item.actions) ? item.actions.slice().reverse() : []
      const subagents = Array.isArray(item.subagents) ? item.subagents : []
      return h('div', { className: 'ptick-detail' },
        h('div', { className: 'ptick-detail-actions' },
          h('button', {
            className: 'ptick-btn ptick-btn-primary',
            disabled: !item.running || busy,
            onClick: () => onNudge(item),
          }, busy ? '发送中…' : '立即催一次'),
          h('button', {
            className: 'ptick-btn',
            disabled: busy,
            onClick: () => onMute(item),
          }, item.muted ? '取消静音' : '本会话静音')),

        h('div', { className: 'ptick-detail-meta' },
          h(Meta, { label: '状态', value: item.running ? '运行中' : '已结束' }),
          h(Meta, { label: '已运行', value: item.running ? formatDuration(item.elapsedMs) : '—' }),
          h(Meta, { label: '本轮提醒', value: `${item.nudges || 0} 次` }),
          h(Meta, { label: item.capped ? '提醒上限' : '下次提醒', value: item.capped ? '已用完' : item.running ? formatCountdown(item.nextInMs) : '—' }),
          h(Meta, { label: '最近汇报', value: item.sinceReportMs ? `${formatDuration(item.sinceReportMs)} 前` : '—' }),
          h(Meta, { label: '节奏', value: `${Math.round(((item.intervalMs || 0) / 60000) * 10) / 10} 分钟` })),

        tool
          ? h('div', { className: 'ptick-now' },
            h('span', null, '当前工具 · ', h('b', null, `${tool.name} · ${formatDuration(Math.max(0, now - tool.at))}`)),
            tool.target ? h('code', null, tool.target) : null)
          : h('div', { className: 'ptick-sec-empty' }, item.running ? '当前没有正在执行的工具' : '任务已结束'),

        h('section', { className: 'ptick-sec' },
          h('h4', null, '提醒记录'),
          logs.length === 0
            ? h('div', { className: 'ptick-sec-empty' }, '本轮还没有提醒')
            : h('ul', { className: 'ptick-log' }, logs.map((entry, index) => h('li', { key: `${entry.at}-${index}` },
              h('span', { className: 'ptick-tl-time' }, clockText(entry.at)),
              h('span', { className: entry.reason === 'manual' ? 'ptick-badge ok' : entry.reason === 'stuck' ? 'ptick-badge warn' : 'ptick-badge' },
                REASON_LABEL[entry.reason] || entry.reason || '提醒'),
              h('span', { className: 'ptick-log-elapsed' }, `已运行 ${formatDuration(entry.elapsedMs)}`),
              h('span', { className: 'ptick-log-text', title: entry.text }, entry.text || ''))))),

        h('section', { className: 'ptick-sec' },
          h('h4', null, `最近动作${actions.length ? ` · ${actions.length}` : ''}`),
          actions.length === 0
            ? h('div', { className: 'ptick-sec-empty' }, '还没有工具动作')
            : h('ul', { className: 'ptick-tl' }, actions.map((action, index) => h(ActionRow, { key: `${action.at}-${index}`, action })))),

        h('section', { className: 'ptick-sec' },
          h('h4', null, `子 agent${subagents.length ? ` · ${subagents.length}` : ''}`),
          subagents.length === 0
            ? h('div', { className: 'ptick-sec-empty' }, '没有子 agent')
            : subagents.map((node) => h(SubagentNode, { key: node.id, node, depth: 0 }))))
    }

    function StatusCard({ item, now, busy, onOpen, onNudge, onMute }) {
      const interval = Math.max(1, Number(item.intervalMs) || 1)
      const ratio = Math.min(1, Math.max(0, (Number(item.sinceReportMs) || 0) / interval))
      const where = basename(item.cwd) || item.short
      const tool = item.currentTool
      const open = () => onOpen(item)
      return h('div', {
        className: 'ptick-card2',
        role: 'button',
        tabIndex: 0,
        onClick: open,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            open()
          }
        },
      },
      h('div', { className: 'ptick-card2-top' },
        h('i', { className: item.running ? 'ptick-dot is-live' : 'ptick-dot' }),
        h('div', { className: 'ptick-card2-title', title: item.title || item.id }, item.title || `会话 ${item.short}`),
        h('div', { className: 'ptick-card2-where' }, where),
        h('div', { className: 'ptick-card2-actions' },
          h('button', {
            className: 'ptick-mini is-primary',
            disabled: !item.running || busy,
            onClick: (event) => { event.stopPropagation(); onNudge(item) },
          }, busy ? '…' : '催一次'),
          h('button', {
            className: 'ptick-mini',
            disabled: busy,
            onClick: (event) => { event.stopPropagation(); onMute(item) },
          }, item.muted ? '取消静音' : '静音'))),
      h('div', { className: 'ptick-card2-meta' },
        h('span', null, '已运行 ', h('b', null, item.running ? formatDuration(item.elapsedMs) : '已结束')),
        h('span', null, item.running ? (item.capped ? '提醒上限 ' : '下次提醒 ') : '最后提醒 ', h('b', null, item.running ? (item.capped ? '已用完' : formatCountdown(item.nextInMs)) : item.nudges > 0 ? '—' : '未触发')),
        h('span', null, '本轮提醒 ', h('b', null, String(item.nudges || 0)))),
      tool
        ? h('div', { className: 'ptick-card2-foot' }, h('span', null, `当前工具 · ${tool.name} · ${formatDuration(Math.max(0, now - tool.at))}`))
        : null,
      item.running ? h('div', { className: 'ptick-bar' }, h('div', { className: 'ptick-bar-fill', style: { width: `${Math.round(ratio * 100)}%` } })) : null,
      h('div', { className: 'ptick-card2-foot' },
        h('div', { style: { display: 'flex', gap: 6 } },
          item.muted ? h('span', { className: 'ptick-badge' }, '已静音') : null,
          item.stuck ? h('span', { className: 'ptick-badge warn' }, '疑似卡住') : null,
          item.capped ? h('span', { className: 'ptick-badge' }, '本轮已提醒满额') : null,
          item.overdue ? h('span', { className: 'ptick-badge warn' }, '待提醒') : null,
          h('span', { className: 'ptick-badge' }, `${Math.round((interval / 60000) * 10) / 10} 分钟节奏`))))
    }

    /** 催一次 / 静音的交互状态，状态页与「进度」标签页共用。 */
    function useControls(flash) {
      const [busyId, setBusyId] = React.useState('')
      const nudge = async (item) => {
        setBusyId(item.id)
        try {
          await postJson('nudge', { sessionId: item.id })
          flash('已排队：下一个 step 会收到一次手动提醒')
        } catch (error) {
          flash(`催一次失败：${error.message}`)
        } finally {
          setBusyId('')
        }
      }
      const mute = async (item) => {
        setBusyId(item.id)
        try {
          const result = await postJson('mute', { sessionId: item.id, muted: !item.muted })
          flash(result && result.muted ? '本会话已静音（只挡自动提醒）' : '已取消静音')
        } catch (error) {
          flash(`操作失败：${error.message}`)
        } finally {
          setBusyId('')
        }
      }
      return { busyId, nudge, mute }
    }

    function useToast() {
      const [toast, setToast] = React.useState('')
      const timer = React.useRef(0)
      React.useEffect(() => () => clearTimeout(timer.current), [])
      const flash = React.useCallback((message) => {
        setToast(message)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setToast(''), 2600)
      }, [])
      return { toast, flash }
    }

    /** 会话视图里的「进度」标签页：当前会话的提醒记录 / 动作时间线 / 子 agent。 */
    function ProgressView({ sessionId }) {
      const stream = useStatusStream()
      const now = useNow(1000)
      const { toast, flash } = useToast()
      const { busyId, nudge, mute } = useControls(flash)
      const sessions = Array.isArray(stream.value && stream.value.sessions) ? stream.value.sessions : []
      const item = sessions.find((entry) => entry.id === sessionId)
      return h(React.Fragment, null,
        item
          ? h(SessionDetail, { item, now, busy: busyId === item.id, onNudge: nudge, onMute: mute })
          : h('div', { className: 'ptick-detail' },
            h('div', { className: 'ptick-empty' },
              stream.phase === 'loading' && !stream.value
                ? '正在读取…'
                : stream.phase === 'error'
                  ? `读取失败：${stream.message}`
                  : '这个会话还没有进度数据。主 agent 开始执行后，这里会显示提醒记录、动作时间线和子 agent 树。')),
        toast ? h('div', { className: 'ptick-toast', role: 'status' }, toast) : null)
    }

    function StatusPage({ openSession }) {
      const stream = useStatusStream()
      const now = useNow(1000)
      const [query, setQuery] = React.useState('')
      const [filter, setFilter] = React.useState('all')
      const { toast, flash } = useToast()
      const { busyId, nudge, mute } = useControls(flash)

      const value = stream.value
      const sessions = Array.isArray(value && value.sessions) ? value.sessions : []
      const running = sessions.filter((item) => item.running)
      const needle = query.trim().toLowerCase()

      const filtered = sessions.filter((item) => {
        if (needle) {
          const haystack = `${item.title || ''} ${item.id || ''} ${item.cwd || ''}`.toLowerCase()
          if (!haystack.includes(needle)) return false
        }
        if (filter === 'running') return item.running
        if (filter === 'nudged') return (item.nudges || 0) > 0
        if (filter === 'stuck') return Boolean(item.stuck)
        if (filter === 'muted') return Boolean(item.muted)
        if (filter === 'idle') return !item.running
        return true
      })
      const ordered = filtered.slice().sort((a, b) => Number(b.running) - Number(a.running) || (b.elapsedMs || 0) - (a.elapsedMs || 0)).slice(0, 50)

      return h('div', { className: 'ptick-page' },
        h('div', { className: 'ptick-inner' },
          h('div', { className: 'ptick-page-head' },
            h('div', null,
              h('div', { className: 'ptick-page-title' }, '进度播报'),
              h('div', { className: 'ptick-page-sub' },
                value
                  ? `主 agent 连续执行且没有汇报时，每 ${value.intervalMinutes} 分钟收到一次提醒。点会话卡片进入该会话，在「进度」标签页查看提醒记录、动作时间线、当前工具耗时和子 agent 树。`
                  : '主 agent 在连续执行且没有汇报时，会按设定间隔自动收到进度提醒。')),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
              h('div', { className: 'ptick-pill' },
                h('i', { className: running.length > 0 ? 'ptick-dot is-live' : 'ptick-dot' }),
                '运行中 ', h('b', null, String(running.length)), ' 个会话'),
              h('span', { className: 'ptick-live' },
                h('i', { className: stream.live ? 'ptick-dot is-live' : 'ptick-dot', style: { width: 6, height: 6 } }),
                stream.live ? '实时推送' : '轮询兜底'))),

          h('div', { className: 'ptick-toolbar' },
            h('input', {
              className: 'ptick-search',
              type: 'search',
              placeholder: '搜索标题 / 会话 ID / 目录',
              value: query,
              onChange: (event) => setQuery(event.target.value),
            }),
            h('div', { className: 'ptick-chips' }, FILTERS.map(([key, label]) => h('button', {
              key,
              className: filter === key ? 'ptick-chip is-active' : 'ptick-chip',
              onClick: () => setFilter(key),
            }, label)))),
          stream.phase === 'loading' && !value ? h('div', { className: 'ptick-empty' }, '正在读取…') : null,
          stream.phase === 'error' ? h('div', { className: 'ptick-empty' }, `读取失败：${stream.message}`) : null,
          ordered.length === 0
            ? (stream.phase === 'ready'
              ? h('div', { className: 'ptick-empty' }, needle || filter !== 'all' ? '没有匹配的会话。' : '当前没有正在执行的会话。发起一个任务后，这里会显示它的运行时长、提醒记录与子 agent。')
              : null)
            : h('div', { className: 'ptick-list' }, ordered.map((item) => h(StatusCard, {
              key: item.id,
              item,
              now,
              busy: busyId === item.id,
              onOpen: (target) => (typeof openSession === 'function' ? openSession(target.id) : null),
              onNudge: nudge,
              onMute: mute,
            }))),

          h('div', { className: 'ptick-card2-foot', style: { paddingLeft: 2, opacity: 0.45 } },
            h('span', null, value ? `dsh-progress-tick v${value.version} · ${stream.live ? 'SSE 推送' : '每 5 秒轮询'}` : ''),
            h('span', null, '仅主 agent 会被提醒；子 agent 只计入父会话的摘要'))),

        toast ? h('div', { className: 'ptick-toast', role: 'status' }, toast) : null)
    }
    //#endregion

    function apply(ctx) {
      ensureStyle()
      // 会话导航服务：ctx.get 不受 inject 限制；服务缺失时降级为不可跳转。
      let uiWorkspace = null
      try {
        uiWorkspace = ctx.get('uiWorkspace') || null
      } catch (error) {
        uiWorkspace = null
      }
      const openSession = (sessionId) => {
        try {
          if (uiWorkspace && typeof uiWorkspace.openSession === 'function') uiWorkspace.openSession(sessionId)
        } catch (error) {
          console.error('[progress-tick] openSession failed:', error)
        }
      }
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
      // 左侧栏一级入口 + 对应页面（与 SSH / 任务看板同一套 slot 契约）。
      try {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'progress-tick',
          order: 60,
          label: () => '进度播报',
        }, StatusIcon))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'progress-tick',
        }, () => h(StatusPage, { openSession })))
      } catch (error) {
        console.error('[progress-tick] sidebar page registration failed:', error)
      }
      // 会话视图里的「进度」标签页：紧挨着「对话」之后（chat order 0，轨迹 order 10）。
      try {
        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'progress-tick',
          order: 5,
          label: () => '进度',
        }, ProgressView))
      } catch (error) {
        console.error('[progress-tick] conversation view registration failed:', error)
      }
    }

    return { name: 'dsh-progress-tick', inject: ['slots', 'remote', 'remote.settings'], apply }
  },
})
