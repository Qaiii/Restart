/**
 * Host half of dsh-restart.
 *
 * Registers one human `/restart` command and one HTTP entry point for the
 * sidebar row. Both call the same guard-then-orchestrate path so the UI and the
 * command can never drift apart. The restart itself lives in `restart.js`.
 *
 * @module dsh-restart/index
 */

import {
  HOST_EXIT_DELAY_MS,
  buildTargets,
  collectBusySessions,
  detectHost,
  spawnRestartHelper,
} from './restart.js'

/** Package name; the bundle row id in cordis.patch.yml is `dsh-restart` too. */
export const name = 'dsh-restart'

/** The slash-command registry must exist before the command can be offered. */
export const inject = ['commands']

/** Browser half's only Host entry point. */
const ROUTE_PATH = '/api/dsh-restart/restart'

function json(value) {
  return Response.json(value, { headers: { 'cache-control': 'no-store' } })
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  /** Scheduled-restart state: one restart at a time, one pending exit timer. */
  const state = { active: false, timer: undefined }

  ctx.effect(() => () => {
    if (state.timer !== undefined) {
      clearTimeout(state.timer)
      state.timer = undefined
    }
  }, 'dsh-restart: pending exit timer')

  /** Sessions whose Agent is mid-turn; a restart would interrupt them. */
  const runningSessions = async () => {
    const controller = ctx.get('sessionController')
    if (controller === undefined || controller === null || typeof controller.list !== 'function') return 0
    try {
      const summary = await controller.list({})
      return collectBusySessions(summary?.items).count
    } catch (error) {
      // The guard is advisory: a failed inspection must not lock the user out.
      console.warn(`[dsh-restart] could not inspect running sessions: ${messageOf(error)}`)
      return 0
    }
  }

  /**
   * Shared operation for the command and the sidebar row.
   *
   * @returns {Promise<{ ok: true, helperPid?: number } | { ok: false, code: string, message: string }>}
   */
  const requestRestart = async () => {
    if (state.active) {
      return {
        ok: false,
        code: 'already-restarting',
        message: '重启已在进行中。/ A restart is already in progress.',
      }
    }

    const host = detectHost()
    if (host.ok !== true) return { ok: false, code: host.code, message: host.message }

    const running = await runningSessions()
    if (running > 0) {
      return {
        ok: false,
        code: 'busy',
        count: running,
        // Host strings reach the conversation verbatim, so they carry both baseline locales.
        message: `有 ${running} 个任务正在运行，已取消重启。请等待任务结束后重试。`
          + ` / ${running} running task(s); restart cancelled. Try again after they finish.`,
      }
    }

    const targets = buildTargets(host)
    try {
      const { helperPid } = await spawnRestartHelper(targets)
      state.active = true
      state.timer = setTimeout(() => { process.exit(0) }, HOST_EXIT_DELAY_MS)
      console.warn(`[dsh-restart] restart scheduled (helper pid=${String(helperPid)}); log: ${targets.logPath}`)
      return { ok: true, helperPid }
    } catch (error) {
      const detail = messageOf(error)
      return {
        ok: false,
        code: 'spawn-failed',
        message: `无法启动重启助手：${detail} / Could not start the restart helper: ${detail}`,
      }
    }
  }

  ctx.effect(() => ctx.commands.register({
    name: 'restart',
    // Third-party commands have no first-party i18n identity, so the copy is bilingual.
    description: '重启 DeepSeek Harness 桌面版 / Restart the DeepSeek Harness desktop app',
    // Direct human control: the command line and its result never become a model message.
    handler: async () => {
      const outcome = await requestRestart()
      // An admitted success carries no text: the chat renders its own localized copy.
      return outcome.ok === true ? { kind: 'success' } : { kind: 'error', text: outcome.message }
    },
  }), 'dsh-restart: /restart command')

  ctx.inject(['connection'], (scope) => {
    const connection = scope.get?.('connection') ?? scope.connection
    const register = connection?.fetch?.register
    if (typeof register !== 'function') {
      console.warn('[dsh-restart] connection.fetch.register is unavailable; the sidebar row cannot reach the Host')
      return
    }
    scope.effect(() => register({
      path: ROUTE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const text = await request.text()
          if (text.length > 0) JSON.parse(text)
        } catch {
          return json({ ok: false, error: { code: 'bad-json', message: 'the request body is not valid JSON' } })
        }
        const outcome = await requestRestart()
        return outcome.ok === true
          ? json({ ok: true, value: { scheduled: true } })
          : json({
            ok: false,
            error: {
              code: outcome.code,
              message: outcome.message,
              ...outcome.count === undefined ? {} : { count: outcome.count },
            },
          })
      },
    }), 'dsh-restart: restart route')
  })
}
