const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const root = process.env.AXO_DATA || app.getPath('userData') // AXO_DATA — для отладки
const P = {
  root,
  meta: path.join(root, 'meta'), // общие versions / libraries / assets
  instances: path.join(root, 'instances'),
  java: path.join(root, 'java'),
  cache: path.join(root, 'cache'),
  settings: path.join(root, 'settings.json'),
  accounts: path.join(root, 'accounts.json'),
  stats: path.join(root, 'stats.json'),
}
for (const k of ['meta', 'instances', 'java', 'cache']) fs.mkdirSync(P[k], { recursive: true })

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

const DEFAULT_SETTINGS = {
  theme: 'axolotl',
  accent: '',
  background: '',
  backgroundBlur: 8,
  backgroundDim: 0.6,
  radius: 14,
  font: 'Manrope',
  compact: false,
  animations: true,
  sounds: true,
  customCss: '',
  splashes: true,
  pet: true,
  petColor: '',
  language: 'ru',
  memory: { min: 1024, max: 4096 },
  jvmArgs: '',
  window: { width: 1280, height: 720, fullscreen: false },
  java: {}, // { "17": "C:/.../javaw.exe" }
  autoJava: true,
  onLaunch: 'keep', // keep | minimize | close
  hooks: { pre: '', post: '', wrapper: '' },
  concurrency: 8,
  showSnapshots: false,
  discordStyleStatus: true,
}

let settings = { ...DEFAULT_SETTINGS, ...readJson(P.settings, {}) }
// v1.1: новый шрифт по умолчанию — Manrope (старые Rounded/Mono/Serif тоже переводим)
if (!settings.fontV2) { if (['Inter', 'Rounded', 'Mono', 'Serif'].includes(settings.font)) settings.font = 'Manrope'; settings.fontV2 = true }
const getSettings = () => settings
function setSettings(patch) {
  settings = { ...settings, ...patch }
  writeJson(P.settings, settings)
  return settings
}

let stats = readJson(P.stats, { achievements: {}, launches: 0, playtime: 0, modsInstalled: 0, exports: 0, firstRun: Date.now() })
const getStats = () => stats
function updateStats(fn) { fn(stats); writeJson(P.stats, stats); return stats }

module.exports = { P, readJson, writeJson, getSettings, setSettings, DEFAULT_SETTINGS, getStats, updateStats }
