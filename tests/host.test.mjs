import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../index.js'

/**
 * Minimal Cordis-shaped context: the plugin only needs `effect`, `get`,
 * `commands.register`, and the optional `connection` injection.
 *
 * The restart route is never invoked here — it would spawn the real helper.
 */
function createContext() {
  const state = { registrations: [], routes: new Map(), cleanups: [] }

  const ctx = {
    effect(fn) {
      const cleanup = fn()
      if (typeof cleanup === 'function') state.cleanups.push(cleanup)
      return cleanup
    },
    // No sessionController in this fixture, so the busy guard reports zero.
    get() {
      return undefined
    },
    commands: {
      register(definition) {
        state.registrations.push(definition)
        return () => {}
      },
    },
    inject(deps, callback) {
      if (deps[0] !== 'connection') return
      const connection = {
        fetch: {
          register(route) {
            state.routes.set(route.path, route)
            return () => {}
          },
        },
      }
      callback({
        get(name) {
          return name === 'connection' ? connection : undefined
        },
        connection,
        effect(fn) {
          const cleanup = fn()
          return cleanup
        },
      })
    },
  }

  return { ctx, state }
}

function postJson(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('apply registers the fallback command and both browser routes', () => {
  const { ctx, state } = createContext()
  apply(ctx)

  assert.equal(state.registrations.length, 1)
  assert.equal(state.registrations[0].name, 'restart')
  assert.equal(state.registrations[0].description, 'Restart the DeepSeek Harness desktop app')
  assert.deepEqual([...state.routes.keys()].sort(), [
    '/api/dsh-restart/locale',
    '/api/dsh-restart/restart',
  ])
})

test('a locale report re-registers the command in that language', async () => {
  const { ctx, state } = createContext()
  apply(ctx)

  const route = state.routes.get('/api/dsh-restart/locale')
  const response = await route.fetch(postJson('http://localhost/api/dsh-restart/locale', { language: 'zh-CN' }))
  assert.deepEqual(await response.json(), { ok: true, value: { language: 'zh' } })
  assert.equal(state.registrations.length, 2)
  assert.equal(state.registrations[1].name, 'restart')
  assert.equal(state.registrations[1].description, '重启 DeepSeek Harness 桌面版')
})

test('reporting the current language keeps one registration', async () => {
  const { ctx, state } = createContext()
  apply(ctx)

  const route = state.routes.get('/api/dsh-restart/locale')
  await route.fetch(postJson('http://localhost/api/dsh-restart/locale', { language: 'en' }))
  await route.fetch(postJson('http://localhost/api/dsh-restart/locale', { language: 'en-US' }))
  assert.equal(state.registrations.length, 1)
})

test('an unsupported language falls back to English', async () => {
  const { ctx, state } = createContext()
  apply(ctx)

  const route = state.routes.get('/api/dsh-restart/locale')
  const response = await route.fetch(postJson('http://localhost/api/dsh-restart/locale', { language: 'ko-KR' }))
  assert.deepEqual(await response.json(), { ok: true, value: { language: 'en' } })
  assert.equal(state.registrations.length, 1)
})

test('a malformed locale body answers with a bad-json envelope', async () => {
  const { ctx, state } = createContext()
  apply(ctx)

  const route = state.routes.get('/api/dsh-restart/locale')
  const response = await route.fetch(new Request('http://localhost/api/dsh-restart/locale', {
    method: 'POST',
    body: '{not json',
  }))
  const body = await response.json()
  assert.equal(body.ok, false)
  assert.equal(body.error.code, 'bad-json')
})
