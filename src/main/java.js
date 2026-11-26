// Автоматическая установка Java (Eclipse Temurin / Adoptium) под нужную версию Minecraft
const { t: tr } = require('./i18n')
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { P, getSettings } = require('./store')
const { download } = require('./net')

const exeName = process.platform === 'win32' ? 'javaw.exe' : 'java'

function featureFor(major) {
  if (major <= 8) return 8
  if (major <= 11) return 11
  if (major <= 17) return 17
  if (major <= 21) return 21
  return major
}

function findExe(dir, depth = 0) {
  if (depth > 5 || !fs.existsSync(dir)) return null
  const direct = path.join(dir, 'bin', exeName)
  if (fs.existsSync(direct)) return direct
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const r = findExe(path.join(dir, e.name), depth + 1)
      if (r) return r
    }
  }
  return null
}

function javaVersion(javaPath) {
  // для проверки используем java(.exe) рядом с javaw
  const cli = javaPath.replace(/javaw\.exe$/i, 'java.exe')
  return new Promise(resolve => {
    execFile(cli, ['-version'], { timeout: 15000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return resolve(null)
      const m = /version "([^"]+)"/.exec(stderr || stdout)
      if (!m) return resolve(null)
      const v = m[1]
      const major = v.startsWith('1.') ? Number(v.split('.')[1]) : parseInt(v)
      resolve({ version: v, major })
    })
  })
}

async function ensureJava(major, task) {
  const s = getSettings()
  const custom = s.java?.[String(major)]
  if (custom && fs.existsSync(custom)) return custom
  const feature = featureFor(major)
  const dir = path.join(P.java, String(feature))
  const existing = findExe(dir)
  if (existing) return existing
  if (!s.autoJava) throw new Error(tr('Нужна Java {v}. Укажите путь в настройках или включите автоустановку.', { v: major }))

  const os = { win32: 'windows', darwin: 'mac', linux: 'linux' }[process.platform]
  const arch = { x64: 'x64', arm64: 'aarch64', ia32: 'x32' }[process.arch] || 'x64'
  const ext = process.platform === 'win32' ? 'zip' : 'tar.gz'
  const url = `https://api.adoptium.net/v3/binary/latest/${feature}/ga/${os}/${arch}/jre/hotspot/normal/eclipse`
  const archive = path.join(P.cache, `java-${feature}.${ext}`)
  task?.update(0, tr('Скачиваю Java {v}…', { v: feature }))
  await download(url, archive, { onProgress: (r, t) => t && task?.update(r / t, tr('Скачиваю Java {v}… {mb} МБ', { v: feature, mb: Math.round(r / 1048576) })) })
  task?.update(1, tr('Распаковываю Java {v}…', { v: feature }))
  fs.mkdirSync(dir, { recursive: true })
  await new Promise((resolve, reject) => {
    if (ext === 'zip') {
      const AdmZip = require('adm-zip')
      new AdmZip(archive).extractAllToAsync(dir, true, false, err => err ? reject(err) : resolve())
    } else {
      execFile('tar', ['-xzf', archive, '-C', dir], err => err ? reject(err) : resolve())
    }
  })
  fs.rmSync(archive, { force: true })
  const exe = findExe(dir)
  if (!exe) throw new Error(tr('Не удалось найти java после распаковки'))
  return exe
}

function installedJavas() {
  if (!fs.existsSync(P.java)) return []
  return fs.readdirSync(P.java).map(v => ({ major: Number(v), path: findExe(path.join(P.java, v)) })).filter(j => j.path)
}

module.exports = { ensureJava, javaVersion, installedJavas, featureFor }
