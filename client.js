/**
 * Browser half of dsh-restart.
 *
 * Adds one row to the sidebar's More menu. The row posts to the Host entry
 * point; the Host performs the guarded restart and the app comes back by itself.
 * No new panel, no duplicate restart logic on the client.
 *
 * This file must keep the `window.__ModuleLoader__.load({ id, factory })` contract:
 * the id is the package name, and baseline platform modules arrive through `require`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-restart',
  factory(require) {
    const React = require('react')
    const { MenuItemButton, IconRefreshOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')

    const h = React.createElement
    const NS = 'dsh-restart'
    const ROUTE = '/api/dsh-restart/restart'

    /** Copy for the More-menu row; the missing locales fall back to English. */
    const dictionaries = {
      en: {
        row: 'Restart DSH',
        busy: 'Restarting DSH…',
        failed: 'Restart failed: ',
      },
      zh: {
        row: '重启 DSH',
        busy: '正在重启…',
        failed: '重启失败：',
      },
    }

    /**
     * Ask the Host to restart.
     * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
     */
    async function postRestart() {
      const response = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      const text = await response.text()
      let envelope = null
      if (text.length > 0) {
        try { envelope = JSON.parse(text) } catch { envelope = null }
      }
      if (envelope !== null && envelope.ok === true) return { ok: true }
      const message = envelope?.error?.message
      return {
        ok: false,
        message: typeof message === 'string' && message.length > 0 ? message : `HTTP ${response.status}`,
      }
    }

    /**
     * One More-menu row. `t` is bound by the registration's `locale` option and
     * `onDismiss` is supplied by the sidebar owner.
     */
    function RestartRow(props) {
      const { t, onDismiss } = props
      const [state, setState] = React.useState({ busy: false, error: '' })

      const dismiss = () => {
        if (typeof onDismiss === 'function') onDismiss()
      }

      const select = () => {
        if (state.busy) return
        setState({ busy: true, error: '' })
        postRestart().then(
          (outcome) => {
            if (outcome.ok) {
              dismiss()
              return
            }
            setState({ busy: false, error: outcome.message })
          },
          () => {
            // A restart tears the Host down mid-response, which is the success path.
            dismiss()
          },
        )
      }

      const label = state.busy
        ? t('busy')
        : state.error !== ''
          ? `${t('failed')}${state.error}`
          : t('row')

      return h(MenuItemButton, {
        icon: h(IconRefreshOutlineRegular, { size: 16 }),
        separatorBefore: true,
        onSelect: select,
      }, label)
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-restart: locale')
      ctx.slots.inject('sidebar.panellist.actions', () => ctx.slots.register({
        name: 'sidebar.panellist.actions',
        id: NS,
        locale: NS,
      }, RestartRow))
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
