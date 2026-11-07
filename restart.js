/**
 * Restart mechanics for the DSH desktop app.
 *
 * The desktop Host is an Electron-as-Node child of the Electron main process
 * (`spawn(process.execPath, [...], { env: { ...ELECTRON_RUN_AS_NODE: '1' } })`),
 * so `process.execPath` is the app executable and `process.ppid` is the process
 * that owns the window. DSH exposes no relaunch IPC or service to plugins, so a
 * restart is orchestrated here: a detached helper terminates the old process
 * tree and launches a fresh app instance once the single-instance lock is free.
 *
 * Everything in this module is pure or injectable so it can be unit tested
 * without touching a live desktop session.
 *
 * @module dsh-restart/restart
 */

import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Name of the diagnostic log the detached helper appends to. */
export const LOG_FILE_NAME = 'dsh-restart.log'

/** Host exit delay after a restart is scheduled; long enough for the reply to settle. */
export const HOST_EXIT_DELAY_MS = 1200

/** Timing knobs baked into the generated helper source. */
export const TIMINGS = Object.freeze({
  /** Grace period before the helper terminates the Electron main process. */
  killMainDelayMs: 500,
  /** Upper bound on waiting for the Electron main process to disappear. */
  mainDeadlineMs: 10_000,
  /** Upper bound on waiting for the Host child to disappear. */
  hostDeadlineMs: 5_000,
  /** Extra settle time before launching, so the single-instance lock is released. */
  launchDelayMs: 500,
  /** Launch attempts before the helper gives up and keeps the app closed. */
  launchAttempts: 3,
  /** Gap between launch attempts. */
  launchRetryDelayMs: 1_000,
  /** Liveness polling interval. */
  pollIntervalMs: 100,
})

/**
 * Decide whether this process can restart a DSH desktop app at all.
 *
 * @param {Record<string, unknown>} [options] - Overrides for tests.
 * @returns {{ ok: true, exe: string, mainPid: number, hostPid: number }
 *   | { ok: false, code: string, message: string }}
 */
export function detectHost(options = {}) {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const ppid = options.ppid ?? process.ppid
  const pid = options.pid ?? process.pid
  const execPath = options.execPath ?? process.execPath

  if (platform !== 'win32') {
    return {
      ok: false,
      code: 'unsupported-platform',
      message: '重启目前只支持 Windows 桌面版 DSH。',
    }
  }
  if (env === null || typeof env !== 'object' || env.ELECTRON_RUN_AS_NODE !== '1') {
    return {
      ok: false,
      code: 'unsupported-host',
      message: '当前不是 DSH 桌面版进程，无法重启应用。',
    }
  }
  if (!Number.isInteger(ppid) || ppid <= 0) {
    return {
      ok: false,
      code: 'unsupported-host',
      message: '无法定位桌面版主进程，已取消重启。',
    }
  }
  if (typeof execPath !== 'string' || !/\.exe$/iu.test(execPath)) {
    return {
      ok: false,
      code: 'unsupported-host',
      message: '无法定位 DSH 桌面版可执行文件，已取消重启。',
    }
  }
  return { ok: true, exe: execPath, mainPid: ppid, hostPid: pid }
}

/**
 * Count the sessions whose Agent is currently running a turn.
 *
 * @param {unknown} items - `sessionController.list()` items, or any malformed value.
 * @returns {{ count: number }}
 */
export function collectBusySessions(items) {
  if (!Array.isArray(items)) return { count: 0 }
  let count = 0
  for (const item of items) {
    if (item !== null && typeof item === 'object' && item.running === true) count += 1
  }
  return { count }
}

/**
 * Resolve the paths and identities the helper needs.
 *
 * @param {{ exe: string, mainPid: number, hostPid: number }} host
 * @param {{ cwd?: string, logPath?: string }} [overrides]
 * @returns {{ exe: string, mainPid: number, hostPid: number, cwd: string, logPath: string }}
 */
export function buildTargets(host, overrides = {}) {
  return {
    exe: host.exe,
    mainPid: host.mainPid,
    hostPid: host.hostPid,
    cwd: overrides.cwd ?? process.cwd(),
    logPath: overrides.logPath ?? join(tmpdir(), LOG_FILE_NAME),
  }
}

/**
 * Render the self-contained CommonJS program the detached helper runs.
 *
 * The helper kills the Electron main process, waits for this Host to exit, then
 * launches a fresh app instance with `ELECTRON_RUN_AS_NODE` removed. It never
 * launches while the old main process is still alive, so a failed termination
 * cannot leave two instances fighting over the single-instance lock.
 *
 * @param {{ exe: string, mainPid: number, hostPid: number, cwd: string, logPath: string }} targets
 * @returns {string}
 */
export function buildHelperSource(targets) {
  const exe = JSON.stringify(targets.exe)
  const mainPid = Number(targets.mainPid)
  const hostPid = Number(targets.hostPid)
  const cwd = JSON.stringify(targets.cwd)
  const logPath = JSON.stringify(targets.logPath)
  return `'use strict'
const { spawn } = require('node:child_process')
const fs = require('node:fs')

const EXE = ${exe}
const MAIN_PID = ${mainPid}
const HOST_PID = ${hostPid}
const CWD = ${cwd}
const LOG_PATH = ${logPath}
const KILL_MAIN_DELAY_MS = ${TIMINGS.killMainDelayMs}
const MAIN_DEADLINE_MS = ${TIMINGS.mainDeadlineMs}
const HOST_DEADLINE_MS = ${TIMINGS.hostDeadlineMs}
const LAUNCH_DELAY_MS = ${TIMINGS.launchDelayMs}
const LAUNCH_ATTEMPTS = ${TIMINGS.launchAttempts}
const LAUNCH_RETRY_DELAY_MS = ${TIMINGS.launchRetryDelayMs}
const POLL_INTERVAL_MS = ${TIMINGS.pollIntervalMs}

function log(line) {
  try { fs.appendFileSync(LOG_PATH, new Date().toISOString() + ' ' + line + '\\n') } catch {}
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms) })
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error !== null && typeof error === 'object' && error.code === 'EPERM'
  }
}

function terminate(pid, label) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return
  try {
    process.kill(pid, 'SIGKILL')
    log('sent SIGKILL to ' + label + ' pid=' + pid)
  } catch (error) {
    const code = error !== null && typeof error === 'object' ? error.code : undefined
    if (code !== 'ESRCH') log('kill ' + label + ' pid=' + pid + ' failed: ' + String(code || error))
  }
}

async function waitGone(pid, deadlineMs) {
  const startedAt = Date.now()
  while (alive(pid)) {
    if (Date.now() - startedAt > deadlineMs) return false
    await sleep(POLL_INTERVAL_MS)
  }
  return true
}

function cleanEnv() {
  const env = Object.assign({}, process.env)
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_NO_ATTACH_CONSOLE
  return env
}

function launchOnce() {
  return new Promise(function (resolve) {
    let settled = false
    const finish = function (outcome) {
      if (settled) return
      settled = true
      resolve(outcome)
    }
    let child
    try {
      child = spawn(EXE, [], { cwd: CWD, env: cleanEnv(), detached: true, stdio: 'ignore', windowsHide: false })
    } catch (error) {
      finish({ ok: false, error: String((error && error.message) || error) })
      return
    }
    child.once('error', function (error) {
      finish({ ok: false, error: String((error && error.message) || error) })
    })
    child.once('spawn', function () {
      try { child.unref() } catch {}
      finish({ ok: true, pid: child.pid })
    })
    setTimeout(function () {
      try { child.unref() } catch {}
      finish({ ok: true, pid: child.pid })
    }, 1500)
  })
}

async function main() {
  if (!Number.isInteger(MAIN_PID) || MAIN_PID <= 0) {
    log('abort: invalid electron main pid')
    return
  }
  log('helper start exe=' + EXE + ' main=' + MAIN_PID + ' host=' + HOST_PID)
  await sleep(KILL_MAIN_DELAY_MS)
  terminate(MAIN_PID, 'electron-main')
  const mainGone = await waitGone(MAIN_PID, MAIN_DEADLINE_MS)
  if (!mainGone) {
    log('abort: electron main pid=' + MAIN_PID + ' did not exit; not launching a second instance')
    return
  }
  log('electron main gone')
  terminate(HOST_PID, 'host')
  await waitGone(HOST_PID, HOST_DEADLINE_MS)
  await sleep(LAUNCH_DELAY_MS)
  for (let attempt = 1; attempt <= LAUNCH_ATTEMPTS; attempt += 1) {
    const outcome = await launchOnce()
    if (outcome.ok) {
      log('relaunched ' + EXE + ' pid=' + String(outcome.pid) + ' attempt=' + attempt)
      return
    }
    log('launch attempt ' + attempt + ' failed: ' + outcome.error)
    if (attempt < LAUNCH_ATTEMPTS) await sleep(LAUNCH_RETRY_DELAY_MS)
  }
  log('abort: could not relaunch ' + EXE + '; start the app manually')
}

main().catch(function (error) {
  log('helper crashed: ' + String((error && error.stack) || error))
  process.exitCode = 1
})
`
}

/** How long a freshly spawned helper must stay alive before a restart is scheduled. */
export const HELPER_PROBE_MS = 400

/**
 * Start the detached helper that performs the restart.
 *
 * The promise resolves only after the helper has stayed alive for
 * {@link HELPER_PROBE_MS}, so an Electron build that rejects `-e` fails the
 * request instead of leaving the app closed with no relaunch.
 *
 * @param {{ exe: string, mainPid: number, hostPid: number, cwd: string, logPath: string }} targets
 * @param {{ spawn?: typeof spawn, probeMs?: number }} [deps] - Overrides for tests.
 * @returns {Promise<{ helperPid: number | undefined }>}
 */
export async function spawnRestartHelper(targets, deps = {}) {
  const spawnChild = deps.spawn ?? spawn
  const probeMs = deps.probeMs ?? HELPER_PROBE_MS
  const source = buildHelperSource(targets)
  return await new Promise((resolve, reject) => {
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    const succeed = (child) => {
      if (settled) return
      settled = true
      try { child.unref() } catch { /* already detached */ }
      resolve({ helperPid: child.pid })
    }
    let child
    try {
      child = spawnChild(targets.exe, ['-e', source], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        cwd: targets.cwd,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
    } catch (error) {
      fail(error)
      return
    }
    child.once('error', fail)
    child.once('spawn', () => {
      if (probeMs <= 0) {
        succeed(child)
        return
      }
      setTimeout(() => {
        if (settled) return
        if (child.exitCode !== null || child.signalCode !== null) {
          fail(new Error(`restart helper exited immediately (code ${String(child.exitCode)})`))
          return
        }
        succeed(child)
      }, probeMs)
    })
  })
}
