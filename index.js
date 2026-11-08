/**
 * Host half of dsh-restart.
 *
 * Registers the HTTP entry points the browser half uses: one restart request
 * and one locale report. The `/restart` slash command itself is a **client
 * contribution** (see client.js), because only client contributions can carry
 * the icon + localized label + alias + description face that built-in commands
 * show; third-party host commands can only carry a plain name and description.
 * The restart itself lives in `restart.js`.
 *
 * @module dsh-restart/index
 */

import { FALLBACK_LANGUAGE, messageFor, normalizeLanguage } from './messages.js'
import {
  HOST_EXIT_DELAY_MS,
  buildTargets,
  collectBusySessions,
  detectHost,
  spawnRestartHelper,
} from './restart.js'

/** Package name; the bundle row id in cordis.patch.yml is `dsh-restart` too. */
export const name = 'dsh-restart'

/** Browser half's entry points. */
const RESTART_ROUTE = '/api/dsh-restart/restart'
const LANGUAGE_ROUTE = '/api/dsh-restart/locale'

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
  /**
   * Plugin state: one restart at a time, one pending exit timer, and the
   * language the browser last reported (route errors are localized from it).
   */
  const state = {
    active: false,
    timer: undefined,
    language: FALLBACK_LANGUAGE,
  }

  /** Localized copy in the language the browser last reported. */
  const copy = (key, ...args) => messageFor(state.language, key, ...args)

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
   * @returns {Promise<{ ok: true, helperPid?: number } | { ok: false, code: string, message: string, count?: number }>}
   */
  const requestRestart = async () => {
    if (state.active) return { ok: false, code: 'already-restarting', message: copy('already') }

    const host = detectHost()
    if (host.ok !== true) {
      const key = host.code === 'unsupported-platform' ? 'unsupportedPlatform' : 'unsupportedHost'
      return { ok: false, code: host.code, message: copy(key) }
    }

    const running = await runningSessions()
    if (running > 0) {
      return { ok: false, code: 'busy', count: running, message: copy('busy', running) }
    }

    const targets = buildTargets(host)
    try {
      const { helperPid } = await spawnRestartHelper(targets)
      state.active = true
      state.timer = setTimeout(() => { process.exit(0) }, HOST_EXIT_DELAY_MS)
      console.warn(`[dsh-restart] restart scheduled (helper pid=${String(helperPid)}); log: ${targets.logPath}`)
      return { ok: true, helperPid }
    } catch (error) {
      return { ok: false, code: 'spawn-failed', message: copy('spawn', messageOf(error)) }
    }
  }

  ctx.inject(['connection'], (scope) => {
    const connection = scope.get?.('connection') ?? scope.connection
    const register = connection?.fetch?.register
    if (typeof register !== 'function') {
      console.warn('[dsh-restart] connection.fetch.register is unavailable; the browser half cannot reach the Host')
      return
    }

    const readBody = async (request) => {
      try {
        const text = await request.text()
        return { ok: true, value: text.length > 0 ? JSON.parse(text) : null }
      } catch {
        return { ok: false, value: null }
      }
    }

    scope.effect(() => register({
      path: RESTART_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const body = await readBody(request)
        if (body.ok !== true) {
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

    scope.effect(() => register({
      path: LANGUAGE_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const body = await readBody(request)
        if (body.ok !== true) {
          return json({ ok: false, error: { code: 'bad-json', message: 'the request body is not valid JSON' } })
        }
        const language = normalizeLanguage(body.value?.language)
        if (language !== state.language) state.language = language
        return json({ ok: true, value: { language } })
      },
    }), 'dsh-restart: language route')
  })
}

