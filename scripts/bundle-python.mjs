#!/usr/bin/env node
/**
 * Downloads a self-contained Python runtime (python-build-standalone) for macOS
 * and/or Windows and installs the backend's dependencies into it, producing a
 * fully standalone runtime that electron-builder bundles via extraResources.
 * python-manager.ts looks for it at resourcesPath/python/{bin/python3,python.exe}.
 *
 * Usage: node scripts/bundle-python.mjs [mac|win|all]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const RUNTIME_DIR = join(ROOT, 'python-runtime')
const CACHE_DIR = join(RUNTIME_DIR, '.cache')
const REQUIREMENTS = join(ROOT, 'backend', 'requirements.txt')

// Pinned python-build-standalone release. Bump the tag/version together when updating.
// https://github.com/astral-sh/python-build-standalone/releases
const PBS_RELEASE = '20260623'
const PBS_PYTHON_VERSION = '3.12.13'

const TARGETS = {
  mac: {
    triple: 'aarch64-apple-darwin',
    dir: join(RUNTIME_DIR, 'mac', 'python'),
    pythonBin: (dir) => join(dir, 'bin', 'python3'),
    sitePackages: (dir) => join(dir, 'lib', 'python3.12', 'site-packages')
  },
  win: {
    triple: 'x86_64-pc-windows-msvc',
    dir: join(RUNTIME_DIR, 'win', 'python'),
    pythonBin: (dir) => join(dir, 'python.exe'),
    sitePackages: (dir) => join(dir, 'Lib', 'site-packages')
  }
}

// uvicorn[standard]'s extras are marker-conditional (sys_platform). pip's
// --platform cross-install resolves wheel *tags* for the target but evaluates
// markers using the *host* platform, so building the Windows runtime from
// macOS would wrongly pull in uvloop (Unix-only) and skip colorama
// (Windows-only). Install uvicorn bare, then add the right extras explicitly.
const WIN_UVICORN_STANDARD_EXTRAS = [
  'colorama>=0.4',
  'httptools>=0.6.3',
  'python-dotenv>=0.13',
  'pyyaml>=5.1',
  'watchfiles>=0.13',
  'websockets>=10.4'
]

function log(msg) {
  console.log(`[bundle-python] ${msg}`)
}

function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(' ')}`)
  execFileSync(cmd, args, { stdio: 'inherit', ...opts })
}

async function download(url, dest) {
  if (existsSync(dest)) {
    log(`using cached ${dest}`)
    return
  }
  log(`downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, buf)
}

function assetUrl(triple) {
  const filename = `cpython-${PBS_PYTHON_VERSION}+${PBS_RELEASE}-${triple}-install_only_stripped.tar.gz`
  return {
    filename,
    url: `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_RELEASE}/${filename}`
  }
}

async function prepareRuntime(target) {
  const { triple, dir } = target
  const { filename, url } = assetUrl(triple)
  const tarball = join(CACHE_DIR, filename)

  await download(url, tarball)

  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dirname(dir), { recursive: true })
  log(`extracting ${filename}`)
  run('tar', ['-xzf', tarball, '-C', dirname(dir)])
  if (!existsSync(dir)) {
    throw new Error(`Expected extracted runtime at ${dir}`)
  }
}

function installMac(target) {
  const python = target.pythonBin(target.dir)
  run(python, [
    '-m',
    'pip',
    'install',
    '--no-cache-dir',
    '--no-compile',
    '--upgrade',
    '-r',
    REQUIREMENTS
  ])
}

function installWin(target, crossInstallPython) {
  const sitePackages = target.sitePackages(target.dir)
  mkdirSync(sitePackages, { recursive: true })

  const crossFlags = [
    '--target',
    sitePackages,
    '--platform',
    'win_amd64',
    '--python-version',
    '3.12',
    '--implementation',
    'cp',
    '--abi',
    'cp312',
    '--only-binary=:all:',
    '--no-compile',
    '--no-cache-dir',
    '--upgrade'
  ]

  const original = readFileSync(REQUIREMENTS, 'utf8')
  const patched = original.replace(/uvicorn\[standard\]/g, 'uvicorn')
  const tmpReq = join(CACHE_DIR, 'requirements-win.txt')
  writeFileSync(tmpReq, patched)

  run(crossInstallPython, ['-m', 'pip', 'install', ...crossFlags, '-r', tmpReq])
  run(crossInstallPython, ['-m', 'pip', 'install', ...crossFlags, ...WIN_UVICORN_STANDARD_EXTRAS])
}

function cleanupPycache(dir) {
  run('find', [dir, '-type', 'd', '-name', '__pycache__', '-prune', '-exec', 'rm', '-rf', '{}', '+'])
}

async function buildTarget(name, crossInstallPython) {
  const target = TARGETS[name]
  log(`--- building ${name} runtime (${target.triple}) ---`)
  await prepareRuntime(target)

  if (name === 'mac') {
    installMac(target)
  } else {
    installWin(target, crossInstallPython)
  }

  cleanupPycache(target.dir)
  log(`--- ${name} runtime ready at ${target.dir} ---`)
}

async function main() {
  const arg = process.argv[2] ?? 'all'
  const names = arg === 'all' ? Object.keys(TARGETS) : [arg]
  for (const name of names) {
    if (!TARGETS[name]) {
      throw new Error(`Unknown target "${name}". Expected one of: mac, win, all`)
    }
  }

  mkdirSync(CACHE_DIR, { recursive: true })

  // Cross-installing the Windows runtime only needs *some* working pip to
  // fetch+unpack wheels (it never executes target code), so prefer the mac
  // runtime we just built when available, otherwise fall back to the host.
  let crossInstallPython = 'python3'
  if (names.includes('mac')) {
    await buildTarget('mac', null)
    crossInstallPython = TARGETS.mac.pythonBin(TARGETS.mac.dir)
  }
  if (names.includes('win')) {
    await buildTarget('win', crossInstallPython)
  }

  log('done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
