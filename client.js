/**
 * Browser half of dsh-restart.
 *
 * Adds one row to the sidebar's More menu. The row posts to the Host entry
 * point; the Host performs the guarded restart and the app comes back by itself.
 * Every user-facing string flows through the locale service, so the row follows
 * the UI language like the shipped client plugins do.
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
    const LANGUAGE_ROUTE = '/api/dsh-restart/locale'

    /**
     * Copy for the More-menu row in every locale the web client ships
     * (en, zh, ja, es, fr, de, ru, pt). `zh` and `en` are the required baseline
     * dictionaries; the locale service checks every other one against the same keys.
     */
    const dictionaries = {
      en: {
        row: 'Restart',
        busy: 'Restarting…',
        failed: 'Restart failed: ',
        errorBusy: '{count} running task(s); restart cancelled. Try again after they finish.',
        errorAlready: 'A restart is already in progress.',
        errorUnsupportedHost: 'This is not the DeepSeek Harness desktop app, so it cannot restart itself.',
        errorUnsupportedPlatform: 'Restart is only implemented for the Windows desktop app.',
        errorSpawn: 'Could not start the restart helper: {detail}',
      },
      zh: {
        row: '重启',
        busy: '正在重启…',
        failed: '重启失败：',
        errorBusy: '有 {count} 个任务正在运行，已取消重启。请等待任务结束后重试。',
        errorAlready: '重启已在进行中。',
        errorUnsupportedHost: '当前不是 DeepSeek Harness 桌面版进程，无法重启应用。',
        errorUnsupportedPlatform: '重启目前只支持 Windows 桌面版。',
        errorSpawn: '无法启动重启助手：{detail}',
      },
      ja: {
        row: '再起動',
        busy: '再起動中…',
        failed: '再起動に失敗しました：',
        errorBusy: '{count} 件のタスクが実行中です。再起動を中止しました。完了後に再試行してください。',
        errorAlready: '再起動はすでに実行中です。',
        errorUnsupportedHost: 'DeepSeek Harness デスクトップ版ではないため、再起動できません。',
        errorUnsupportedPlatform: '再起動は Windows デスクトップ版のみ対応しています。',
        errorSpawn: '再起動ヘルパーを起動できませんでした：{detail}',
      },
      es: {
        row: 'Reiniciar',
        busy: 'Reiniciando…',
        failed: 'Error al reiniciar: ',
        errorBusy: 'Hay {count} tarea(s) en ejecución; reinicio cancelado. Inténtalo de nuevo cuando terminen.',
        errorAlready: 'Ya hay un reinicio en curso.',
        errorUnsupportedHost: 'No es la aplicación de escritorio de DeepSeek Harness, así que no puede reiniciarse.',
        errorUnsupportedPlatform: 'El reinicio solo está implementado para la aplicación de escritorio de Windows.',
        errorSpawn: 'No se pudo iniciar el asistente de reinicio: {detail}',
      },
      fr: {
        row: 'Redémarrer',
        busy: 'Redémarrage…',
        failed: 'Échec du redémarrage : ',
        errorBusy: '{count} tâche(s) en cours ; redémarrage annulé. Réessayez une fois terminées.',
        errorAlready: 'Un redémarrage est déjà en cours.',
        errorUnsupportedHost: "Ce n'est pas l'application de bureau DeepSeek Harness ; elle ne peut pas se redémarrer.",
        errorUnsupportedPlatform: "Le redémarrage n'est pris en charge que pour l'application de bureau Windows.",
        errorSpawn: "Impossible de démarrer l'assistant de redémarrage : {detail}",
      },
      de: {
        row: 'Neustart',
        busy: 'Neustart läuft…',
        failed: 'Neustart fehlgeschlagen: ',
        errorBusy: '{count} laufende Aufgabe(n); Neustart abgebrochen. Versuchen Sie es nach dem Ende erneut.',
        errorAlready: 'Ein Neustart läuft bereits.',
        errorUnsupportedHost: 'Dies ist nicht die DeepSeek Harness-Desktop-App; sie kann sich nicht selbst neu starten.',
        errorUnsupportedPlatform: 'Der Neustart ist nur in der Windows-Desktop-App implementiert.',
        errorSpawn: 'Der Neustart-Helfer konnte nicht gestartet werden: {detail}',
      },
      ru: {
        row: 'Перезапуск',
        busy: 'Перезапуск…',
        failed: 'Не удалось перезапустить: ',
        errorBusy: 'Выполняется задач: {count}; перезапуск отменён. Повторите попытку после завершения.',
        errorAlready: 'Перезапуск уже выполняется.',
        errorUnsupportedHost: 'Это не настольное приложение DeepSeek Harness, перезапуск невозможен.',
        errorUnsupportedPlatform: 'Перезапуск реализован только в настольном приложении для Windows.',
        errorSpawn: 'Не удалось запустить помощник перезапуска: {detail}',
      },
      pt: {
        row: 'Reiniciar',
        busy: 'Reiniciando…',
        failed: 'Falha ao reiniciar: ',
        errorBusy: 'Há {count} tarefa(s) em execução; reinício cancelado. Tente novamente após terminarem.',
        errorAlready: 'Já existe um reinício em andamento.',
        errorUnsupportedHost: 'Este não é o aplicativo de desktop do DeepSeek Harness, então não pode reiniciar.',
        errorUnsupportedPlatform: 'O reinício só está implementado no aplicativo de desktop para Windows.',
        errorSpawn: 'Não foi possível iniciar o assistente de reinício: {detail}',
      },
    }

    /**
     * Ask the Host to restart.
     * @returns {Promise<{ ok: true } | { ok: false, status: number, error: unknown }>}
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
      return { ok: false, status: response.status, error: envelope?.error ?? null }
    }

    /**
     * Translate the Host failure envelope into the active UI language.
     * Unknown codes fall back to the Host's own message.
     *
     * @param {(key: string, params?: Record<string, string | number>) => string} t
     * @param {{ ok: false, status: number, error: unknown }} outcome
     * @returns {string}
     */
    function describeFailure(t, outcome) {
      const error = outcome.error !== null && typeof outcome.error === 'object' ? outcome.error : null
      const code = typeof error?.code === 'string' ? error.code : ''
      const count = typeof error?.count === 'number' ? error.count : undefined
      const detail = typeof error?.message === 'string' ? error.message : ''
      if (code === 'busy' && count !== undefined) return t('errorBusy', { count })
      if (code === 'already-restarting') return t('errorAlready')
      if (code === 'unsupported-host') return t('errorUnsupportedHost')
      if (code === 'unsupported-platform') return t('errorUnsupportedPlatform')
      if (code === 'spawn-failed') return t('errorSpawn', { detail })
      return detail.length > 0 ? `${t('failed')}${detail}` : `${t('failed')}HTTP ${outcome.status}`
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
            setState({ busy: false, error: describeFailure(t, outcome) })
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
          ? state.error
          : t('row')

      return h(MenuItemButton, {
        icon: h(IconRefreshOutlineRegular, { size: 16 }),
        separatorBefore: true,
        onSelect: select,
      }, label)
    }

    /**
     * Report the active UI language so the Host can re-register `/restart` with
     * matching copy: a third-party command's catalog row is not localized by the
     * browser, only first-party commands get a localized face.
     */
    function reportLanguage(ctx) {
      const locale = ctx.locale
      if (locale === undefined || locale === null || typeof locale.getLocale !== 'function') return

      let reported = ''
      let attempts = 0
      let disposed = false

      const send = async (language) => {
        if (disposed) return
        try {
          const response = await fetch(LANGUAGE_ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ language }),
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
        } catch {
          if (disposed) return
          attempts += 1
          // The Host may still be starting; retry a few times, then leave it to the next switch.
          if (attempts <= 3) setTimeout(() => { void send(language) }, 1000 * attempts)
        }
      }

      const report = () => {
        const active = locale.getLocale()?.active
        if (typeof active !== 'string' || active.length === 0 || active === reported) return
        reported = active
        attempts = 0
        void send(active)
      }

      ctx.effect(() => {
        report()
        const unsubscribe = typeof locale.subscribe === 'function'
          ? locale.subscribe(() => { report() })
          : undefined
        return () => {
          disposed = true
          if (typeof unsubscribe === 'function') unsubscribe()
        }
      }, 'dsh-restart: language report')
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-restart: locale')
      reportLanguage(ctx)
      ctx.slots.inject('sidebar.panellist.actions', () => ctx.slots.register({
        name: 'sidebar.panellist.actions',
        id: NS,
        locale: NS,
      }, RestartRow))
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
