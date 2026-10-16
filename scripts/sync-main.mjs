import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const dependencyFiles = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  '.npmrc',
  '.nvmrc',
])

export async function syncMain(cwd) {
  const git = async (...args) =>
    (
      await exec('git', args, {
        cwd,
        timeout: 25000,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GCM_INTERACTIVE: 'never',
        },
      })
    ).stdout.trim()
  const cleanMain = async () => {
    if ((await git('branch', '--show-current')) !== 'main')
      return 'Sync paused: switch to main to receive GitHub updates.'
    if (await git('status', '--porcelain=v1', '--untracked-files=all'))
      return 'Sync paused: you have local edits. Commit or move them before automatic updates can resume.'
    return null
  }
  try {
    const blocked = await cleanMain()
    if (blocked) return { status: 'paused', message: blocked }
    await git(
      'fetch',
      '--quiet',
      'origin',
      'refs/heads/main:refs/remotes/origin/main',
    )
    const blockedAfterFetch = await cleanMain()
    if (blockedAfterFetch)
      return { status: 'paused', message: blockedAfterFetch }
    const before = await git('rev-parse', 'HEAD')
    const target = await git('rev-parse', 'refs/remotes/origin/main')
    if (before === target)
      return {
        status: 'current',
        message: 'Watching GitHub main for updates every 10 seconds.',
      }
    try {
      await git('merge-base', '--is-ancestor', before, target)
    } catch {
      return {
        status: 'paused',
        message:
          'Sync paused: local history differs from GitHub main. Resolve it manually; no files were replaced.',
      }
    }
    const changed = (await git('diff', '--name-only', '-z', before, target))
      .split('\0')
      .filter(Boolean)
    await git('merge', '--ff-only', '--no-edit', target)
    return {
      status: 'updated',
      commit: target,
      dependenciesChanged: changed.some((file) => dependencyFiles.has(file)),
      message: `Updated to GitHub main (${target.slice(0, 7)}).`,
    }
  } catch {
    return {
      status: 'unavailable',
      message:
        'Automatic sync is unavailable. Check your internet connection, Git installation, and GitHub sign-in. Local development can continue; sync will retry.',
    }
  }
}
