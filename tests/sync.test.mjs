import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { syncBranch, currentBranch } from '../scripts/sync-branch.mjs'

const exec = promisify(execFile)
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'westrock-sync-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const remote = join(dir, 'remote.git'),
    author = join(dir, 'author'),
    local = join(dir, 'local')
  const git = async (cwd, ...args) =>
    (await exec('git', args, { cwd })).stdout.trim()
  await git(dir, 'init', '--bare', '--initial-branch=main', remote)
  await git(dir, 'clone', remote, author)
  await git(author, 'config', 'user.name', 'Sync test')
  await git(author, 'config', 'user.email', 'sync@example.test')
  await writeFile(
    join(author, '.gitignore'),
    '.data/\n.env\n.npm-cache/\n.runtime/\nnode_modules/\n',
  )
  await writeFile(join(author, 'screen.txt'), 'Initial screen')
  await git(author, 'add', '.')
  await git(author, 'commit', '-m', 'Initial fixture')
  await git(author, 'push', 'origin', 'main')
  await git(dir, 'clone', remote, local)
  const publish = async (files) => {
    for (const [name, value] of Object.entries(files))
      await writeFile(join(author, name), value)
    await git(author, 'add', '.')
    await git(author, 'commit', '-m', 'Fixture update')
    await git(author, 'push', 'origin', 'main')
  }
  return { dir, remote, author, local, git, publish }
}

test('automatic sync fast-forwards while protecting local edits, data, branches, and commits', async (t) => {
  const f = await fixture(t)
  await mkdir(join(f.local, '.data'))
  await writeFile(
    join(f.local, '.data', 'record.txt'),
    'retained company record',
  )
  await writeFile(join(f.local, '.env'), 'TEST_SETTING=retained')
  assert.equal((await syncBranch(f.local)).status, 'current')
  await f.publish({ 'screen.txt': 'Updated screen' })
  assert.equal((await syncBranch(f.local)).status, 'updated')
  assert.equal(
    await readFile(join(f.local, 'screen.txt'), 'utf8'),
    'Updated screen',
  )
  assert.equal(
    await readFile(join(f.local, '.data', 'record.txt'), 'utf8'),
    'retained company record',
  )
  assert.equal(
    await readFile(join(f.local, '.env'), 'utf8'),
    'TEST_SETTING=retained',
  )
  await writeFile(join(f.local, 'screen.txt'), 'My local edits')
  await f.publish({ 'screen.txt': 'Another remote update' })
  assert.equal((await syncBranch(f.local)).status, 'paused')
  assert.equal(
    await readFile(join(f.local, 'screen.txt'), 'utf8'),
    'My local edits',
  )
  // Fixture explicitly restores its own test edit; the synchronizer never does this.
  await writeFile(join(f.local, 'screen.txt'), 'Updated screen')
  await writeFile(
    join(f.local, 'my-untracked-work.txt'),
    'Local untracked work',
  )
  assert.equal((await syncBranch(f.local)).status, 'paused')
  await rm(join(f.local, 'my-untracked-work.txt'))
  await f.git(f.local, 'switch', '-c', 'my-feature')
  assert.equal((await syncBranch(f.local)).status, 'paused')
  await f.git(f.local, 'switch', 'main')
  assert.equal((await syncBranch(f.local)).status, 'updated')
  await f.publish({ 'package.json': '{"name":"fixture","version":"1.0.0"}' })
  assert.equal((await syncBranch(f.local)).dependenciesChanged, true)
  await f.git(f.local, 'config', 'user.name', 'Local test')
  await f.git(f.local, 'config', 'user.email', 'local@example.test')
  await writeFile(join(f.local, 'my-work.txt'), 'My local commit')
  await f.git(f.local, 'add', 'my-work.txt')
  await f.git(f.local, 'commit', '-m', 'Local only')
  await f.publish({ 'screen.txt': 'Divergent remote update' })
  const before = await f.git(f.local, 'rev-parse', 'HEAD')
  assert.equal((await syncBranch(f.local)).status, 'paused')
  assert.equal(await f.git(f.local, 'rev-parse', 'HEAD'), before)
  await f.git(
    f.local,
    'remote',
    'set-url',
    'origin',
    join(f.dir, 'missing.git'),
  )
  assert.equal((await syncBranch(f.local)).status, 'unavailable')
})

test('development syncing never updates main or consumes main-only commits', async (t) => {
  const f = await fixture(t)
  const originalMain = await f.git(f.local, 'rev-parse', 'refs/heads/main')
  await f.git(f.author, 'switch', '-c', 'development')
  await f.git(f.author, 'push', 'origin', 'development')
  await f.git(
    f.local,
    'fetch',
    'origin',
    'refs/heads/development:refs/remotes/origin/development',
  )
  await f.git(
    f.local,
    'switch',
    '--no-track',
    '-c',
    'development',
    'refs/remotes/origin/development',
  )
  assert.equal(await currentBranch(f.local), 'development')
  await writeFile(join(f.author, 'screen.txt'), 'Development preview')
  await f.git(f.author, 'add', 'screen.txt')
  await f.git(f.author, 'commit', '-m', 'Preview on development')
  await f.git(f.author, 'push', 'origin', 'development')
  const updated = await syncBranch(f.local, 'development')
  assert.equal(updated.status, 'updated')
  assert.match(updated.message, /GitHub development/)
  assert.equal(
    await readFile(join(f.local, 'screen.txt'), 'utf8'),
    'Development preview',
  )
  assert.equal(
    await f.git(f.local, 'rev-parse', 'refs/heads/main'),
    originalMain,
  )
  assert.equal((await syncBranch(f.local, 'main')).status, 'paused')
  await f.git(f.author, 'switch', 'main')
  await f.publish({ 'screen.txt': 'Main-only update' })
  assert.equal((await syncBranch(f.local, 'development')).status, 'current')
  assert.equal(
    await readFile(join(f.local, 'screen.txt'), 'utf8'),
    'Development preview',
  )
  for (const invalid of [
    '--force',
    'main:other',
    '../main',
    '@{-1}',
    'bad name',
  ])
    assert.equal((await syncBranch(f.local, invalid)).status, 'paused')
  await f.git(f.local, 'switch', 'main')
  assert.equal((await syncBranch(f.local, 'development')).status, 'paused')
  assert.equal(await f.git(f.local, 'rev-parse', 'HEAD'), originalMain)
})

test(
  'sync development mode installs changed dependencies and restarts only its own app',
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t)
    const originalMain = await f.git(f.local, 'rev-parse', 'refs/heads/main')
    await f.git(f.author, 'switch', '-c', 'development')
    const npmCli = process.env.npm_execpath
    assert.ok(npmCli, 'Run through npm test')
    await mkdir(join(f.author, 'scripts'))
    await cp(
      new URL('../scripts/dev-sync.mjs', import.meta.url),
      join(f.author, 'scripts/dev-sync.mjs'),
    )
    await cp(
      new URL('../scripts/sync-branch.mjs', import.meta.url),
      join(f.author, 'scripts/sync-branch.mjs'),
    )
    const pkg = {
      name: 'sync-fixture',
      version: '1.0.0',
      private: true,
      scripts: { dev: 'node fixture-app.mjs' },
    }
    await writeFile(join(f.author, 'package.json'), JSON.stringify(pkg))
    await writeFile(
      join(f.author, 'fixture-app.mjs'),
      "import{mkdirSync,appendFileSync}from'node:fs';mkdirSync('.runtime',{recursive:true});appendFileSync('.runtime/launches','started\\n');setInterval(()=>{},1000)",
    )
    await exec(
      process.execPath,
      [
        npmCli,
        'install',
        '--package-lock-only',
        '--ignore-scripts',
        '--cache',
        '.npm-cache',
      ],
      { cwd: f.author },
    )
    await f.git(f.author, 'add', '.')
    await f.git(f.author, 'commit', '-m', 'Add fixture app')
    await f.git(f.author, 'push', 'origin', 'development')
    await f.git(
      f.local,
      'fetch',
      'origin',
      'refs/heads/development:refs/remotes/origin/development',
    )
    await f.git(
      f.local,
      'switch',
      '--no-track',
      '-c',
      'development',
      'refs/remotes/origin/development',
    )
    const child = spawn(process.execPath, ['scripts/dev-sync.mjs'], {
      cwd: f.local,
      env: { ...process.env, npm_execpath: npmCli },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let logs = ''
    child.stdout.on('data', (d) => {
      logs += d
    })
    child.stderr.on('data', (d) => {
      logs += d
    })
    t.after(async () => {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        delay(7000),
      ])
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL')
    })
    async function launched(times) {
      for (let n = 0; n < 160; n++) {
        try {
          if (
            (await readFile(join(f.local, '.runtime/launches'), 'utf8'))
              .trim()
              .split('\n').length >= times
          )
            return
        } catch {}
        if (child.exitCode !== null) throw new Error(logs)
        await delay(100)
      }
      throw new Error('App did not restart: ' + logs)
    }
    await launched(1)
    pkg.version = '1.0.1'
    await writeFile(join(f.author, 'package.json'), JSON.stringify(pkg))
    await exec(
      process.execPath,
      [
        npmCli,
        'install',
        '--package-lock-only',
        '--ignore-scripts',
        '--cache',
        '.npm-cache',
      ],
      { cwd: f.author },
    )
    await f.git(f.author, 'add', '.')
    await f.git(f.author, 'commit', '-m', 'Update dependency metadata')
    await f.git(f.author, 'push', 'origin', 'development')
    await launched(2)
    assert.match(logs, /Installing locked dependencies/)
    assert.equal(
      JSON.parse(await readFile(join(f.local, 'package-lock.json'), 'utf8'))
        .version,
      '1.0.1',
    )
    assert.equal((await syncBranch(f.local, 'development')).status, 'current')
    assert.match(logs, /Watching GitHub development/)
    assert.equal(
      await f.git(f.local, 'rev-parse', 'refs/heads/main'),
      originalMain,
    )
  },
)
