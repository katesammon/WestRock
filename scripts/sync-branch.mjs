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

export async function syncBranch(cwd, branch = 'main') {
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
  const cleanBranch = async () => {
    if ((await git('branch', '--show-current')) !== branch)
      return `Sync paused: switch to ${branch} to receive GitHub updates.`
    if (await git('status', '--porcelain=v1', '--untracked-files=all'))
      return 'Sync paused: you have local edits. Commit or move them before automatic updates can resume.'
    return null
  }
  try {
    // Validate before constructing a refspec; never accept Git shorthand or options.
    if (
      typeof branch !== 'string' ||
      !branch ||
      branch.startsWith('-') ||
      branch.startsWith('@')
    )
      return { status: 'paused', message: 'Sync paused: invalid branch name.' }
    try {
      if ((await git('check-ref-format', '--branch', branch)) !== branch)
        return {
          status: 'paused',
          message: 'Sync paused: invalid branch name.',
        }
    } catch {
      return { status: 'paused', message: 'Sync paused: invalid branch name.' }
    }
    const blocked = await cleanBranch()
    if (blocked) return { status: 'paused', message: blocked }
    await git(
      'fetch',
      '--quiet',
      'origin',
      `refs/heads/${branch}:refs/remotes/origin/${branch}`,
    )
    const blockedAfterFetch = await cleanBranch()
    if (blockedAfterFetch)
      return { status: 'paused', message: blockedAfterFetch }
    const before = await git('rev-parse', 'HEAD')
    const target = await git('rev-parse', `refs/remotes/origin/${branch}`)
    if (before === target)
      return {
        status: 'current',
        message: `Watching GitHub ${branch} for updates every 10 seconds.`,
      }
    try {
      await git('merge-base', '--is-ancestor', before, target)
    } catch {
      return {
        status: 'paused',
        message: `Sync paused: local history differs from GitHub ${branch}. Resolve it manually; no files were replaced.`,
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
      message: `Updated to GitHub ${branch} (${target.slice(0, 7)}).`,
    }
  } catch {
    return {
      status: 'unavailable',
      message:
        'Automatic sync is unavailable. Check your internet connection, Git installation, and GitHub sign-in. Local development can continue; sync will retry.',
    }
  }
}

export async function currentBranch(cwd) {
  const { stdout } = await exec('git', ['branch', '--show-current'], {
    cwd,
    timeout: 5000,
  })
  const branch = stdout.trim()
  if (!branch)
    throw new Error('Choose a local branch before starting automatic sync.')
  return branch
}
