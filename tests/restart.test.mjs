import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import {
  buildHelperSource,
  buildTargets,
  collectBusySessions,
  detectHost,
  spawnRestartHelper,
} from '../restart.js'

const WINDOWS_EXE = 'C:\\Program Files\\DeepSeek Harness\\DeepSeek Harness.exe'

function desktopHost() {
  return detectHost({
    platform: 'win32',
    env: { ELECTRON_RUN_AS_NODE: '1' },
    ppid: 4242,
    pid: 4243,
    execPath: WINDOWS_EXE,
  })
}

function fakeChild() {
  const child = new EventEmitter()
  child.pid = 999
  child.exitCode = null
  child.signalCode = null
  child.unref = () => {}
  return child
}

test('detectHost accepts the Windows desktop Host', () => {
  const host = desktopHost()
  assert.equal(host.ok, true)
  assert.equal(host.exe, WINDOWS_EXE)
  assert.equal(host.mainPid, 4242)
  assert.equal(host.hostPid, 4243)
})

test('detectHost rejects other platforms', () => {
  const host = detectHost({
    platform: 'darwin',
    env: { ELECTRON_RUN_AS_NODE: '1' },
    ppid: 1,
    pid: 2,
    execPath: '/Applications/DeepSeek Harness.app',
  })
  assert.equal(host.ok, false)
  assert.equal(host.code, 'unsupported-platform')
})

test('detectHost rejects a plain Node Host', () => {
  const host = detectHost({ platform: 'win32', env: {}, ppid: 1, pid: 2, execPath: WINDOWS_EXE })
  assert.equal(host.ok, false)
  assert.equal(host.code, 'unsupported-host')
})

test('detectHost rejects an unusable parent process', () => {
  const host = detectHost({
    platform: 'win32',
    env: { ELECTRON_RUN_AS_NODE: '1' },
    ppid: 0,
    pid: 2,
    execPath: WINDOWS_EXE,
  })
  assert.equal(host.ok, false)
  assert.equal(host.code, 'unsupported-host')
})

test('detectHost rejects a non-executable target', () => {
  const host = detectHost({
    platform: 'win32',
    env: { ELECTRON_RUN_AS_NODE: '1' },
    ppid: 1,
    pid: 2,
    execPath: 'node',
  })
  assert.equal(host.ok, false)
  assert.equal(host.code, 'unsupported-host')
})

test('collectBusySessions counts running Agents only', () => {
  assert.deepEqual(collectBusySessions([]), { count: 0 })
  assert.deepEqual(collectBusySessions([
    { sessionId: 'a', running: true },
    { sessionId: 'b', running: false },
    { sessionId: 'c', running: true },
  ]), { count: 2 })
})

test('collectBusySessions tolerates malformed input', () => {
  assert.deepEqual(collectBusySessions(undefined), { count: 0 })
  assert.deepEqual(collectBusySessions(null), { count: 0 })
  assert.deepEqual(collectBusySessions({ items: [] }), { count: 0 })
  assert.deepEqual(collectBusySessions([null, 1, 'x', { running: 'yes' }]), { count: 0 })
})

test('buildTargets fills the working directory and log path', () => {
  const host = desktopHost()
  const targets = buildTargets(host, { cwd: 'C:\\work', logPath: 'C:\\tmp\\dsh-restart.log' })
  assert.deepEqual(targets, {
    exe: WINDOWS_EXE,
    mainPid: 4242,
    hostPid: 4243,
    cwd: 'C:\\work',
    logPath: 'C:\\tmp\\dsh-restart.log',
  })
})

test('buildHelperSource embeds its targets and stays parseable', () => {
  const targets = {
    exe: WINDOWS_EXE,
    mainPid: 42,
    hostPid: 43,
    cwd: 'C:\\work',
    logPath: 'C:\\tmp\\dsh-restart.log',
  }
  const source = buildHelperSource(targets)
  assert.match(source, /const MAIN_PID = 42/u)
  assert.match(source, /const HOST_PID = 43/u)
  assert.ok(source.includes(JSON.stringify(WINDOWS_EXE)))
  assert.ok(source.includes(JSON.stringify('C:\\tmp\\dsh-restart.log')))
  assert.doesNotThrow(() => new Function(source))
})

test('the helper relaunches without ELECTRON_RUN_AS_NODE', () => {
  const source = buildHelperSource({
    exe: WINDOWS_EXE,
    mainPid: 42,
    hostPid: 43,
    cwd: 'C:\\work',
    logPath: 'C:\\tmp\\dsh-restart.log',
  })
  assert.match(source, /delete env\.ELECTRON_RUN_AS_NODE/u)
  assert.match(source, /spawn\(EXE, \[\], \{/u)
})

test('spawnRestartHelper runs the helper as Electron-as-Node', async () => {
  const targets = buildTargets(desktopHost(), { cwd: 'C:\\work', logPath: 'C:\\tmp\\dsh-restart.log' })
  const child = fakeChild()
  let seen
  const result = await spawnRestartHelper(targets, {
    probeMs: 0,
    spawn: (exe, args, options) => {
      seen = { exe, args, options }
      setImmediate(() => child.emit('spawn'))
      return child
    },
  })
  assert.equal(result.helperPid, 999)
  assert.equal(seen.exe, WINDOWS_EXE)
  assert.equal(seen.args[0], '-e')
  assert.equal(seen.args[1], buildHelperSource(targets))
  assert.equal(seen.options.env.ELECTRON_RUN_AS_NODE, '1')
  assert.equal(seen.options.detached, true)
  assert.equal(seen.options.cwd, 'C:\\work')
})

test('spawnRestartHelper rejects when the helper cannot start', async () => {
  const targets = buildTargets(desktopHost())
  const child = fakeChild()
  await assert.rejects(
    spawnRestartHelper(targets, {
      probeMs: 0,
      spawn: () => {
        setImmediate(() => child.emit('error', new Error('spawn ENOENT')))
        return child
      },
    }),
    /spawn ENOENT/u,
  )
})
