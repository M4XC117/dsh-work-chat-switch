/**
 * @local/work-chat-switch — Client half.
 *
 * The sidebar's New Session button is shipped UI with no plugin seat, so the
 * switch measures that button, hides it, and draws its own Chat / Work pair in
 * exactly the same place (the shipped button keeps its layout box, so nothing
 * below it moves). If the button cannot be found — another build, another
 * shell, the collapsed rail — the original is left untouched and this plugin
 * renders nothing.
 *
 * Work creates the workspace's next blank session and selects the API-key
 * provider (`deepseek-official`), then shows the Conversation.
 *
 * Chat switches the central column to a `main` panel that embeds the official
 * free web chat in an Electron <webview>. The page sends
 * `Content-Security-Policy: frame-ancestors 'none'`, so an iframe is impossible;
 * the desktop app instead creates guests through its own lease-gated bridge
 * (`globalThis.dshDesktop.browser`), which is also what the built-in Browser tab
 * uses. The guest runs in a sandboxed, permissionless, process-lifetime
 * partition keyed by `CHAT_PARTITION`, so a login entered there persists for
 * this app run and is shared by every Chat panel in it.
 */
window.__ModuleLoader__.load({
  id: 'dsh-work-chat-switch',
  factory(require) {
    const React = require('react')
    const { useCallback, useEffect, useLayoutEffect, useRef, useState } = React
    const h = React.createElement

    const NS = 'work-chat-switch'
    const HIDE_ATTR = 'data-work-chat-switch-hidden'
    const CHAT_URL = 'https://chat.deepseek.com/'
    const CHAT_PANEL = 'chat-web'
    const CHAT_PARTITION = 'work-chat-switch:chat.deepseek.com'

    const DICT = {
      zh: {
        'group': '新建会话方式',
        'work': '工作',
        'chat': '聊天',
        'work.title': '使用API额度',
        'chat.title': '无限制使用',
        'busy': '正在创建会话…',
        'unavailable': '当前环境缺少会话接口，无法新建会话',
        'noApiKey': '未检测到 API Key 模型（可用：{list}）',
        'modelFailed': '模型切换失败：{msg}',
        'startFailed': '新建会话失败：{msg}',
        'desktopOnly': '网页聊天需要 DSH 桌面版的内嵌浏览器，当前环境不支持',
        'loadFailed': '网页加载失败：{msg}',
        'chatTitle': 'DeepSeek 网页聊天',
      },
      en: {
        'group': 'New session mode',
        'work': 'Work',
        'chat': 'Chat',
        'work.title': 'Uses API quota',
        'chat.title': 'Unlimited use',
        'busy': 'Creating a session…',
        'unavailable': 'This build has no session API, so a session cannot be created',
        'noApiKey': 'No API-key model found (available: {list})',
        'modelFailed': 'Model switch failed: {msg}',
        'startFailed': 'Session creation failed: {msg}',
        'desktopOnly': 'The web chat needs the desktop app’s embedded browser, which this environment lacks',
        'loadFailed': 'The page failed to load: {msg}',
        'chatTitle': 'DeepSeek web chat',
      },
    }

    function interpolate(text, params) {
      if (params === undefined) return text
      return text.replace(/\{(\w+)\}/g, (match, name) =>
        name in params ? String(params[name]) : match,
      )
    }

    let translate = null
    function t(key, params) {
      if (translate !== null) {
        try {
          const value = translate(key, params)
          if (typeof value === 'string' && value !== '') return value
        } catch {
          // Fall through to the local table.
        }
      }
      const fallback = DICT.en[key] ?? DICT.zh[key]
      return typeof fallback === 'string' ? interpolate(fallback, params) : key
    }

    function messageOf(error) {
      if (error === null || error === undefined) return ''
      if (typeof error === 'string') return error
      if (typeof error.message === 'string') return error.message
      return String(error)
    }

    /**
     * Remote calls on `remote.session` answer `{ ok, value }` or
     * `{ ok: false, error }`; plain Client services answer the value directly.
     */
    function remoteValue(result) {
      if (result !== null && typeof result === 'object' && typeof result.ok === 'boolean') {
        if (!result.ok) {
          const error = result.error
          const message = error !== undefined && error !== null && typeof error.message === 'string'
            ? error.message
            : 'remote call failed'
          const code = error !== undefined && error !== null && typeof error.code === 'string'
            ? `${error.code}: `
            : ''
          throw new Error(`${code}${message}`)
        }
        return result.value
      }
      return result
    }

    /** The workspace holding the most recently active session. */
    function recentWorkspaceId(workspace, sessions) {
      if (workspace === undefined || workspace === null || !Array.isArray(workspace.items)) return undefined
      if (sessions === undefined || sessions === null || sessions.byId === undefined) return undefined
      let selected
      let selectedTime = Number.NEGATIVE_INFINITY
      for (const item of workspace.items) {
        let latest = Number.NEGATIVE_INFINITY
        for (const sessionId of item.sessionIds ?? []) {
          const summary = sessions.byId[sessionId]
          if (summary !== undefined && typeof summary.updatedAt === 'number') {
            latest = Math.max(latest, summary.updatedAt)
          }
        }
        if (latest === Number.NEGATIVE_INFINITY) {
          const created = Date.parse(item.createdAt ?? '')
          if (!Number.isNaN(created)) latest = created
        }
        if (selected === undefined || latest > selectedTime) {
          selected = item.workspaceId
          selectedTime = latest
        }
      }
      return selected
    }

    /** The central column: everything right of the sidebar, below the title bar. */
    function mainAreaRect() {
      const button = document.querySelector('button[class*="_newSession"]')
      const root = button === null ? null : button.closest('[class*="_root"]')
      if (root === null) {
        return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
      }
      const box = root.getBoundingClientRect()
      return {
        left: box.right,
        top: box.top,
        width: Math.max(0, window.innerWidth - box.right),
        height: Math.max(0, box.bottom - box.top),
      }
    }

    const CSS = `
.wcs-anchor{position:fixed;z-index:958;pointer-events:none}
.wcs-group{display:flex;gap:6px;width:100%;height:100%;pointer-events:auto}
.wcs-btn{flex:1 1 0;min-width:0;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:100%;padding:0 8px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.35));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-button-elevated-fill,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#e6e6e6);font:inherit;font-size:14px;font-weight:500;line-height:22px;cursor:pointer;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.wcs-btn:hover{background:var(--dsw-alias-button-floating-hover,rgba(127,127,127,.2))}
.wcs-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary,#4d6bfe));outline-offset:-2px}
.wcs-btn[aria-busy="true"],.wcs-btn[disabled]{opacity:.6;cursor:default}
.wcs-notice{position:fixed;z-index:958;box-sizing:border-box;padding:6px 10px;border-radius:var(--dsw-radius-md,8px);border:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));background:var(--dsw-alias-bg-overlay,#1b1d21);color:var(--dsw-alias-label-secondary,#a8adb7);font-size:12px;line-height:18px;box-shadow:var(--dsw-elevation-floating,0 6px 20px rgba(0,0,0,.2));pointer-events:none;overflow-wrap:anywhere}
.wcs-veil{position:fixed;z-index:957;pointer-events:none;background:var(--dsw-alias-bg-base,#15161a);background:color-mix(in srgb,var(--dsw-alias-bg-base,#15161a) 90%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);opacity:1;transition:opacity 250ms ease}
.wcs-veil[data-phase="clear"]{opacity:0}
.wcw-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,#15161a)}
.wcw-host{display:flex;flex:1;min-height:0}
.wcw-view{flex:1;width:100%;height:100%;min-height:0;border:0;display:flex;background:var(--dsw-alias-bg-base,#15161a)}
.wcw-note{padding:8px 14px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#a8adb7);border-top:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25))}
.wcw-error{padding:8px 14px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#e5484d);border-top:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25))}
`

    /**
     * The main-column panel that hosts chat.deepseek.com.
     *
     * The Desktop guest is created through the app's own lease bridge: acquire a
     * lease, build the <webview> with exactly the lease name and partition the
     * main process approved, attach it, and only then navigate. Cleanup removes
     * the element and releases the lease.
     */
    function ChatPanel() {
      const hostRef = useRef(null)
      const [error, setError] = useState(null)

      useEffect(() => {
        const host = hostRef.current
        if (host === null) return undefined
        const bridge = globalThis.dshDesktop?.browser
        if (bridge === undefined || bridge === null) {
          setError(t('desktopOnly'))
          return undefined
        }

        let disposed = false
        let lease
        let element

        const start = async () => {
          try {
            const reservation = await bridge.acquire(CHAT_PARTITION)
            if (disposed) {
              bridge.release(reservation.lease).catch(() => {})
              return
            }
            lease = reservation.lease
            const view = document.createElement('webview')
            view.className = 'wcw-view'
            view.setAttribute('name', reservation.lease)
            view.setAttribute('partition', reservation.partition)
            view.setAttribute('src', 'about:blank#' + reservation.lease)
            view.addEventListener('dom-ready', () => {
              if (disposed) return
              try {
                const pending = view.loadURL(CHAT_URL)
                if (pending !== undefined && typeof pending.catch === 'function') {
                  pending.catch((reason) => {
                    if (!disposed) setError(t('loadFailed', { msg: messageOf(reason) }))
                  })
                }
              } catch (reason) {
                if (!disposed) setError(t('loadFailed', { msg: messageOf(reason) }))
              }
            }, { once: true })
            view.addEventListener('did-fail-load', (event) => {
              if (disposed || event.errorCode === -3) return
              setError(t('loadFailed', { msg: event.errorDescription ?? String(event.errorCode) }))
            })
            element = view
            host.appendChild(view)
          } catch (reason) {
            if (!disposed) setError(messageOf(reason))
          }
        }

        start()

        return () => {
          disposed = true
          if (element !== undefined) element.remove()
          element = undefined
          if (lease !== undefined) bridge.release(lease).catch(() => {})
          lease = undefined
        }
      }, [])

      return h(
        'div',
        { className: 'wcw-root' },
        h('div', { ref: hostRef, className: 'wcw-host' }),
        error === null
          ? null
          : h('div', { className: 'wcw-error', role: 'status' }, error),
      )
    }

    function useShippedButton() {
      const [rect, setRect] = useState(null)
      const hiddenRef = useRef(null)

      useLayoutEffect(() => {
        let stopped = false

        const showShipped = () => {
          const el = hiddenRef.current
          if (el !== null) {
            el.style.removeProperty('visibility')
            el.removeAttribute(HIDE_ATTR)
            hiddenRef.current = null
          }
        }

        const measure = () => {
          if (stopped) return
          const el = document.querySelector('button[class*="_newSession"]')
          if (el === null) {
            showShipped()
            setRect(null)
            return
          }
          const box = el.getBoundingClientRect()
          // The collapsed rail hides the label; leave the shipped icon alone.
          if (box.width < 80 || box.height < 20) {
            showShipped()
            setRect(null)
            return
          }
          if (hiddenRef.current !== el) {
            showShipped()
            hiddenRef.current = el
          }
          el.style.setProperty('visibility', 'hidden')
          el.setAttribute(HIDE_ATTR, '')
          setRect((prev) => {
            if (
              prev !== null &&
              Math.abs(prev.left - box.left) < 0.5 &&
              Math.abs(prev.top - box.top) < 0.5 &&
              Math.abs(prev.width - box.width) < 0.5 &&
              Math.abs(prev.height - box.height) < 0.5
            ) {
              return prev
            }
            return { left: box.left, top: box.top, width: box.width, height: box.height }
          })
        }

        measure()
        const timer = window.setInterval(measure, 300)
        window.addEventListener('resize', measure)
        return () => {
          stopped = true
          window.clearInterval(timer)
          window.removeEventListener('resize', measure)
          showShipped()
        }
      }, [])

      return rect
    }

    function ModeSwitch(props) {
      const { useWorkspaces, useSessions, onStart } = props
      const workspace = typeof useWorkspaces === 'function' ? useWorkspaces((snapshot) => snapshot) : undefined
      const sessions = typeof useSessions === 'function' ? useSessions((snapshot) => snapshot) : undefined
      const rect = useShippedButton()
      const [busy, setBusy] = useState(null)
      const [notice, setNotice] = useState(null)
      const [veil, setVeil] = useState(null)
      const veilFade = useRef(0)
      const veilRemove = useRef(0)

      useEffect(() => {
        if (notice === null) return undefined
        const timer = window.setTimeout(() => setNotice(null), 6000)
        return () => window.clearTimeout(timer)
      }, [notice])

      useEffect(() => () => {
        window.clearTimeout(veilFade.current)
        window.clearTimeout(veilRemove.current)
      }, [])

      const run = useCallback(async (mode) => {
        if (busy !== null) return
        setBusy(mode)

        // Frost the central column first, then swap underneath it and let the
        // frost clear: the view changes through the veil instead of cutting.
        setVeil({ ...mainAreaRect(), phase: 'cover' })
        await new Promise((resolve) => {
          window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
        })

        window.clearTimeout(veilFade.current)
        window.clearTimeout(veilRemove.current)
        veilFade.current = window.setTimeout(() => {
          setVeil((prev) => (prev === null ? null : { ...prev, phase: 'clear' }))
        }, 250)
        veilRemove.current = window.setTimeout(() => setVeil(null), 520)

        try {
          const workspaceId = recentWorkspaceId(workspace, sessions)
          const result = await onStart(mode, workspaceId)
          if (result !== undefined && typeof result.notice === 'string' && result.notice !== '') {
            setNotice(result.notice)
          }
        } catch (error) {
          setNotice(t('startFailed', { msg: messageOf(error) }))
        } finally {
          setBusy(null)
        }
      }, [busy, workspace, sessions, onStart])

      return h(
        React.Fragment,
        null,
        h('style', { key: 'style', 'data-dsh-plugin': 'dsh-work-chat-switch', children: CSS }),
        veil === null
          ? null
          : h('div', {
            key: 'veil',
            className: 'wcs-veil',
            'data-phase': veil.phase,
            style: { left: veil.left, top: veil.top, width: veil.width, height: veil.height },
          }),
        rect === null
          ? null
          : h(
            'div',
            {
              key: 'anchor',
              className: 'wcs-anchor',
              style: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            },
            h(
              'div',
              { className: 'wcs-group', role: 'group', 'aria-label': t('group') },
              h(
                'button',
                {
                  type: 'button',
                  className: 'wcs-btn',
                  title: t('chat.title'),
                  'aria-busy': busy === 'chat',
                  disabled: busy !== null,
                  onClick: () => run('chat'),
                },
                t('chat'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'wcs-btn',
                  title: t('work.title'),
                  'aria-busy': busy === 'work',
                  disabled: busy !== null,
                  onClick: () => run('work'),
                },
                t('work'),
              ),
            ),
          ),
        rect === null || notice === null
          ? null
          : h(
            'div',
            {
              key: 'notice',
              className: 'wcs-notice',
              role: 'status',
              style: {
                left: rect.left,
                top: rect.top + rect.height + 6,
                width: rect.width,
              },
            },
            notice,
          ),
      )
    }

    return {
      inject: ['slots', 'remote', 'remote.session', 'uiWorkspace', 'layout'],
      apply(ctx) {
        const locale = ctx.get('locale')
        if (
          locale !== undefined &&
          typeof locale.register === 'function' &&
          typeof locale.bind === 'function'
        ) {
          ctx.effect(
            () => locale.register(NS, { zh: DICT.zh, en: DICT.en }),
            'work-chat-switch: locale',
          )
          translate = locale.bind(NS)
        }

        // The central-column page. Registered once and selected by the Chat
        // button; the shell renders only the selected main panel.
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            { name: 'main', key: CHAT_PANEL, locale: NS },
            ChatPanel,
          ),
        )

        const startSession = async (mode, workspaceId) => {
          const layout = ctx.layout

          if (mode === 'chat') {
            layout.selectPanel(CHAT_PANEL)
            return {}
          }

          // Work goes back to the Conversation column first.
          try {
            layout.selectPanel(null)
          } catch {
            // Not registered in this shell; the session still opens.
          }

          const api = ctx.remote.session
          const uiWorkspace = ctx.uiWorkspace
          if (api === undefined || uiWorkspace === undefined) throw new Error(t('unavailable'))

          const catalog = remoteValue(await api.modelCatalog())
          const groups = catalog !== undefined && catalog !== null && Array.isArray(catalog.groups)
            ? catalog.groups
            : []
          const available = groups.map((entry) => entry.id).join(', ') || '无'
          const wanted = 'deepseek-official'
          const group = groups.find((entry) => entry.id === wanted)
          let selection
          let notice

          if (group !== undefined && group.models.length > 0) {
            const preferred = catalog.default !== undefined &&
              catalog.default !== null &&
              catalog.default.provider === wanted &&
              group.models.some((model) => model.id === catalog.default.model)
              ? catalog.default
              : undefined
            selection = preferred !== undefined
              ? { provider: wanted, model: preferred.model }
              : { provider: wanted, model: group.models[0].id }
          } else {
            notice = t('noApiKey', { list: available })
            if (catalog.default !== undefined && catalog.default !== null) {
              selection = { provider: catalog.default.provider, model: catalog.default.model }
            }
          }

          let sessionId
          if (workspaceId !== undefined) {
            try {
              sessionId = await uiWorkspace.connectWorkspace(workspaceId)
            } catch {
              sessionId = undefined
            }
          }
          if (sessionId === undefined) {
            const created = remoteValue(await api.create({}))
            sessionId = created.sessionId
          }

          if (selection !== undefined) {
            try {
              remoteValue(await api.selectModel({
                sessionId,
                provider: selection.provider,
                model: selection.model,
              }))
            } catch (error) {
              notice = t('modelFailed', { msg: messageOf(error) })
            }
          }

          uiWorkspace.openSession(sessionId)
          return { notice }
        }

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'work-chat-switch',
              order: 87,
              locale: NS,
            },
            (ownerProps) => h(ModeSwitch, { ...ownerProps, onStart: startSession }),
          ),
        )
      },
    }
  },
})
