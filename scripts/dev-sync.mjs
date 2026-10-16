import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { syncMain } from './sync-main.mjs'

const cwd = fileURLToPath(new URL('../', import.meta.url))
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Start this mode with npm run dev:sync.')
let dev = null
let stopping = false
let intentionalStop = false
let lastMessage = ''
const controller = new AbortController()
const log = (message) => console.log(`[sync] ${message}`)

function npm(args, detached = false) {
  return spawn(process.execPath, [npmCli, ...args], {
    cwd,
    stdio: 'inherit',
    detached: detached && process.platform !== 'win32',
  })
}
function startDev() {
  if (stopping) return
  intentionalStop = false
  dev = npm(['run', 'dev'], true)
  dev.on('exit', (code) => {
    if (!intentionalStop && !stopping) {
      log(
        'The development server stopped. Fix the reported error and start npm run dev:sync again.',
      )
      void shutdown(code || 1)
    }
  })
}
async function stopDev() {
  if (!dev || dev.exitCode !== null || dev.signalCode !== null) return
  intentionalStop = true
  const child = dev
  const exited = new Promise((resolve) => child.once('exit', resolve))
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn(
        'taskkill',
        ['/pid', String(child.pid), '/T', '/F'],
        { stdio: 'ignore' },
      )
      killer.once('exit', resolve)
      killer.once('error', resolve)
    })
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  await Promise.race([exited, delay(5000)])
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform !== 'win32') {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
    } else child.kill()
  }
  dev = null
}
async function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  controller.abort()
  await stopDev()
  process.exitCode = code
}
async function installDependencies() {
  log(
    'Dependency files changed. Installing locked dependencies and restarting the app…',
  )
  await stopDev()
  if (stopping) return false
  const child = npm(['ci', '--cache', resolve(cwd, '.npm-cache')])
  const code = await new Promise((resolve) => child.once('exit', resolve))
  if (code !== 0) {
    log(
      'Dependency installation failed. Resolve the error, then run npm ci --cache .npm-cache before restarting.',
    )
    await shutdown(1)
    return false
  }
  return true
}
async function check() {
  const result = await syncMain(cwd)
  if (result.message !== lastMessage) {
    log(result.message)
    lastMessage = result.message
  }
  if (result.status === 'updated' && result.dependenciesChanged) {
    if (!(await installDependencies())) return
    startDev()
  }
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
await check()
if (!dev && !stopping) startDev()
while (!stopping) {
  try {
    await delay(10000, undefined, { signal: controller.signal })
  } catch {
    break
  }
  if (!stopping) await check()
}
