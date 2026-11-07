import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/**
 * Load the browser bundle exactly the way the page's module loader does:
 * evaluate the script with a `window` that captures the registered factory.
 */
function loadBundle() {
  let spec
  const window = { __ModuleLoader__: { load(value) { spec = value } } }
  // eslint-disable-next-line no-new-func -- the bundle is a plain page script.
  new Function('window', SOURCE)(window)
  return spec
}

/** Fake React shared by the component under test. */
function makeReact() {
  const react = {
    state: null,
    setStateCalls: [],
    createElement(type, props, children) {
      return { type, props: props ?? {}, children }
    },
    useState(initial) {
      react.state = initial
      react.setStateCalls.push(initial)
      return [initial, (next) => {
        react.state = typeof next === 'function' ? next(react.state) : next
        react.setStateCalls.push(react.state)
      }]
    },
  }
  return react
}

/** Build the client module and the slot registration it produced. */
function boot() {
  const spec = loadBundle()
  assert.equal(spec.id, 'dsh-restart')

  const react = makeReact()
  const requireStub = (id) => {
    if (id === 'react') return react
    if (id === '@deepseek-ai/dsh-client-ui-primitives') {
      return { MenuItemButton: 'MenuItemButton', IconRefreshOutlineRegular: 'IconRefreshOutlineRegular' }
    }
    throw new Error(`unexpected require: ${id}`)
  }
  const created = spec.factory(requireStub)
  const registrations = []
  const localeRegistrations = []
  const ctx = {
    effect(fn) { fn() },
    locale: {
      register(namespace, dictionaries) {
        localeRegistrations.push({ namespace, dictionaries })
        return () => {}
      },
    },
    slots: {
      inject(name, callback) {
        assert.equal(name, 'sidebar.panellist.actions')
        callback()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }
  created.apply(ctx)
  return { spec, react, created, registrations, localeRegistrations }
}

test('the bundle registers one localized More-menu row', () => {
  const { spec, created, registrations, localeRegistrations } = boot()
  assert.deepEqual(created.inject, ['slots', 'locale'])
  assert.equal(localeRegistrations.length, 1)
  assert.equal(localeRegistrations[0].namespace, 'dsh-restart')
  assert.deepEqual(Object.keys(localeRegistrations[0].dictionaries).sort(), ['en', 'zh'])
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].options.name, 'sidebar.panellist.actions')
  assert.equal(registrations[0].options.id, 'dsh-restart')
  assert.equal(registrations[0].options.locale, 'dsh-restart')
  assert.equal(typeof registrations[0].component, 'function')
})

test('the row renders the restart label with the refresh icon', () => {
  const { registrations } = boot()
  const row = registrations[0].component({ t: (key) => `t:${key}`, onDismiss: () => {} })
  assert.equal(row.type, 'MenuItemButton')
  assert.equal(row.props.icon.type, 'IconRefreshOutlineRegular')
  assert.equal(row.children, 't:row')
})

test('a successful request dismisses the menu', async () => {
  const { registrations } = boot()
  let dismissed = 0
  globalThis.fetch = async () => ({
    status: 200,
    text: async () => JSON.stringify({ ok: true, value: { scheduled: true } }),
  })
  const row = registrations[0].component({ t: (key) => key, onDismiss: () => { dismissed += 1 } })
  row.props.onSelect()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(dismissed, 1)
})

test('a refused restart keeps the menu open and shows the Host message', async () => {
  const { react, registrations } = boot()
  let dismissed = 0
  globalThis.fetch = async () => ({
    status: 200,
    text: async () => JSON.stringify({
      ok: false,
      error: { code: 'busy', message: '有 1 个任务正在运行，已取消重启。' },
    }),
  })
  const row = registrations[0].component({ t: (key) => key, onDismiss: () => { dismissed += 1 } })
  row.props.onSelect()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(dismissed, 0)
  assert.equal(react.state.busy, false)
  assert.equal(react.state.error, '有 1 个任务正在运行，已取消重启。')
})

test('a dropped response counts as the restart having started', async () => {
  const { registrations } = boot()
  let dismissed = 0
  globalThis.fetch = async () => { throw new Error('connection reset') }
  const row = registrations[0].component({ t: (key) => key, onDismiss: () => { dismissed += 1 } })
  row.props.onSelect()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(dismissed, 1)
})
