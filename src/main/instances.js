// Сборки (инстансы): создание, хранение, контент
const { t: tr } = require('./i18n')
const fs = require('fs')
const path = require('path')
const { shell } = require('electron')
const { P, readJson, writeJson } = require('./store')
const { hashFile } = require('./net')

const CONTENT_DIRS = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks', datapack: 'datapacks' }

const dirOf = id => path.join(P.instances, id)
const metaFile = id => path.join(dirOf(id), 'instance.json')

function slug(name) {
  const tr = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ы:'y',э:'e',ю:'yu',я:'ya' }
  const s = String(name).toLowerCase().replace(/[а-яё]/g, c => tr[c] ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return s.slice(0, 40) || 'instance'
}

function list() {
  if (!fs.existsSync(P.instances)) return []
  return fs.readdirSync(P.instances)
    .map(id => readJson(metaFile(id), null))
    .filter(Boolean)
    .sort((a, b) => (b.lastPlayed || b.created || 0) - (a.lastPlayed || a.created || 0))
}

function get(id) {
  const inst = readJson(metaFile(id), null)
  if (!inst) throw new Error(tr('Сборка не найдена: {id}', { id }))
  return inst
}

function save(inst) { writeJson(metaFile(inst.id), inst); return inst }

function update(id, patch) {
  const inst = get(id)
  const next = { ...inst, ...patch, settings: { ...inst.settings, ...(patch.settings || {}) } }
  return save(next)
}

function create({ name, mcVersion, loader = 'vanilla', loaderVersion = '', icon = '', group = '' }) {
  let id = slug(name)
  let n = 1
  while (fs.existsSync(dirOf(id))) id = `${slug(name)}-${++n}`
  const inst = {
    id, name, icon, group, mcVersion, loader, loaderVersion,
    versionId: '', installed: false, javaMajor: 0,
    created: Date.now(), lastPlayed: 0, playtime: 0,
    settings: { memory: null, jvmArgs: '', javaPath: '', window: null, env: '', hooks: null },
    content: {}, modpack: null, notes: '',
  }
  for (const d of ['mods', 'resourcepacks', 'shaderpacks', 'saves', 'screenshots', 'config']) fs.mkdirSync(path.join(dirOf(id), d), { recursive: true })
  return save(inst)
}

async function remove(id) {
  await shell.trashItem(dirOf(id)) // в корзину, а не навсегда
}

function copyDir(src, dst) {
  fs.cpSync(src, dst, { recursive: true })
}

function duplicate(id) {
  const inst = get(id)
  const copy = create({ name: inst.name + tr(' (копия)'), mcVersion: inst.mcVersion, loader: inst.loader, loaderVersion: inst.loaderVersion, group: inst.group })
  for (const e of fs.readdirSync(dirOf(id))) {
    if (e === 'instance.json') continue
    copyDir(path.join(dirOf(id), e), path.join(dirOf(copy.id), e))
  }
  return save({ ...inst, id: copy.id, name: copy.name, created: Date.now(), lastPlayed: 0, playtime: 0 })
}

function setIcon(id, srcPath) {
  const ext = path.extname(srcPath).toLowerCase() || '.png'
  const name = 'icon' + ext
  for (const f of fs.readdirSync(dirOf(id))) if (/^icon\./.test(f)) fs.rmSync(path.join(dirOf(id), f))
  fs.copyFileSync(srcPath, path.join(dirOf(id), name))
  return update(id, { icon: 'file:' + name + '?' + Date.now() })
}

/** Список контента определённого типа с метаданными Modrinth (если известны) */
async function listContent(id, type) {
  const inst = get(id)
  const sub = CONTENT_DIRS[type]
  const dir = path.join(dirOf(id), sub)
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name.endsWith('.part')) continue
    const isFile = f.isFile()
    if (!isFile && type !== 'shader' && type !== 'resourcepack') continue
    const enabled = !f.name.endsWith('.disabled')
    const clean = f.name.replace(/\.disabled$/, '')
    const rel = `${sub}/${clean}`
    const st = fs.statSync(path.join(dir, f.name))
    const meta = inst.content[rel] || {}
    out.push({ file: f.name, rel, name: clean, enabled, size: st.size, mtime: st.mtimeMs, isDir: !isFile, ...meta })
  }
  return out.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name))
}

function toggleContent(id, type, file) {
  const dir = path.join(dirOf(id), CONTENT_DIRS[type])
  const from = path.join(dir, file)
  const to = file.endsWith('.disabled') ? path.join(dir, file.replace(/\.disabled$/, '')) : from + '.disabled'
  fs.renameSync(from, to)
}

async function removeContent(id, type, file) {
  const dir = path.join(dirOf(id), CONTENT_DIRS[type])
  await shell.trashItem(path.join(dir, file))
  const inst = get(id)
  delete inst.content[`${CONTENT_DIRS[type]}/${file.replace(/\.disabled$/, '')}`]
  save(inst)
}

function addLocalFiles(id, type, files) {
  const dir = path.join(dirOf(id), CONTENT_DIRS[type])
  fs.mkdirSync(dir, { recursive: true })
  for (const f of files) fs.copyFileSync(f, path.join(dir, path.basename(f)))
}

function recordContent(id, rel, meta) {
  const inst = get(id)
  inst.content[rel] = { ...(inst.content[rel] || {}), ...meta }
  save(inst)
}

/** sha1 всех файлов контента (для идентификации через Modrinth) */
async function hashContent(id, types = ['mod', 'resourcepack', 'shader']) {
  const result = []
  for (const type of types) {
    const dir = path.join(dirOf(id), CONTENT_DIRS[type])
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!f.isFile() || f.name.endsWith('.part')) continue
      const full = path.join(dir, f.name)
      result.push({ type, file: f.name, full, rel: `${CONTENT_DIRS[type]}/${f.name.replace(/\.disabled$/, '')}`, sha1: await hashFile(full, 'sha1') })
    }
  }
  return result
}

function listWorlds(id) {
  const dir = path.join(dirOf(id), 'saves')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => {
    const p = path.join(dir, d.name)
    const icon = fs.existsSync(path.join(p, 'icon.png')) ? `saves/${d.name}/icon.png` : ''
    return { name: d.name, icon, mtime: fs.statSync(p).mtimeMs }
  }).sort((a, b) => b.mtime - a.mtime)
}

function listScreenshots(id) {
  const dir = path.join(dirOf(id), 'screenshots')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => /\.(png|jpe?g)$/i.test(f)).map(f => ({ name: f, rel: `screenshots/${f}`, mtime: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime)
}

/** Все файлы сборки (для выбора при экспорте) */
function listTree(id) {
  const root = dirOf(id)
  const skip = new Set(['instance.json', 'logs', 'crash-reports', 'natives', '.fabric', '.quilt', 'versions', 'libraries', 'assets', '.mixin.out', 'downloads'])
  const out = []
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (skip.has(e.name) || /^icon\./.test(e.name)) continue
    if (e.isDirectory()) {
      const children = fs.readdirSync(path.join(root, e.name))
      out.push({ path: e.name, dir: true, children: children.map(c => `${e.name}/${c}`) })
    } else out.push({ path: e.name, dir: false })
  }
  return out
}

module.exports = {
  CONTENT_DIRS, dirOf, list, get, save, update, create, remove, duplicate, setIcon,
  listContent, toggleContent, removeContent, addLocalFiles, recordContent, hashContent,
  listWorlds, listScreenshots, listTree, slug,
}
