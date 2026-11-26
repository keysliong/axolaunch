// Импорт и экспорт сборок в формате Modrinth (.mrpack)
const { t: tr } = require('./i18n')
const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')
const { getJson, download, pool } = require('./net')
const instances = require('./instances')
const modrinth = require('./modrinth')
const { getSettings, updateStats } = require('./store')

const LOADER_KEYS = { fabric: 'fabric-loader', quilt: 'quilt-loader', forge: 'forge', neoforge: 'neoforge' }
const KEY_TO_LOADER = Object.fromEntries(Object.entries(LOADER_KEYS).map(([k, v]) => [v, k]))

async function saveIcon(instId, url) {
  if (!url) return
  try {
    const ext = (path.extname(new URL(url).pathname) || '.png').slice(0, 6)
    const dest = path.join(instances.dirOf(instId), 'icon' + ext)
    await download(url, dest)
    instances.update(instId, { icon: 'file:icon' + ext })
  } catch (e) { console.warn('icon', e.message) }
}

/** Импорт .mrpack → новая сборка (только файлы; рантайм ставится отдельно) */
async function importMrpack(file, ui, extra = {}) {
  const zip = new AdmZip(file)
  const indexEntry = zip.getEntry('modrinth.index.json')
  if (!indexEntry) throw new Error(tr('Это не .mrpack: нет modrinth.index.json'))
  const idx = JSON.parse(indexEntry.getData().toString('utf8'))
  const deps = idx.dependencies || {}
  if (!deps.minecraft) throw new Error(tr('В сборке не указана версия Minecraft'))
  let loader = 'vanilla', loaderVersion = ''
  for (const [key, l] of Object.entries(KEY_TO_LOADER)) if (deps[key]) { loader = l; loaderVersion = deps[key] }

  const inst = instances.create({ name: extra.name || idx.name || tr('Сборка'), mcVersion: deps.minecraft, loader, loaderVersion })
  instances.update(inst.id, { modpack: { name: idx.name, version: idx.versionId, summary: idx.summary || '', ...(extra.modpack || {}) } })
  if (extra.iconUrl) await saveIcon(inst.id, extra.iconUrl)
  const dir = instances.dirOf(inst.id)
  try {

  // файлы
  const files = (idx.files || []).filter(f => f.env?.client !== 'unsupported')
  let done = 0
  ui?.update(0, tr('Скачиваю файлы сборки ({i}/{n})', { i: 0, n: files.length }))
  await pool(files, getSettings().concurrency || 8, async f => {
    const dest = modrinth.safeJoin(dir, f.path)
    await download(f.downloads, dest, { sha1: f.hashes?.sha1 })
    ui?.update(++done / Math.max(files.length, 1) * 0.9, tr('Скачиваю файлы сборки ({i}/{n})', { i: done, n: files.length }))
  })

  // overrides
  ui?.update(0.92, tr('Распаковываю overrides'))
  for (const e of zip.getEntries()) {
    const m = /^(client-overrides|overrides)\/(.+)$/.exec(e.entryName)
    if (!m || e.isDirectory) continue
    const dest = modrinth.safeJoin(dir, m[2])
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, e.getData())
  }
  } catch (e) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) } catch (er) { console.warn('cleanup', er.message) }
    throw e
  }
  try { await modrinth.identifyContent(inst.id) } catch (e) { console.warn('identify', e.message) }
  ui?.update(1, tr('Файлы сборки готовы'))
  return instances.get(inst.id)
}

/** Установка сборки с Modrinth */
async function installModpack(projectId, versionId, ui) {
  const proj = await modrinth.project(projectId)
  const ver = versionId ? await modrinth.version(versionId) : (await modrinth.projectVersions(projectId))[0]
  if (!ver) throw new Error(tr('Нет доступных версий сборки'))
  const file = ver.files.find(f => f.primary) || ver.files[0]
  const tmp = path.join(require('./store').P.cache, `${proj.slug}-${ver.id}.mrpack`)
  ui?.update(0, tr('Скачиваю {name}', { name: proj.title }))
  await download(file.url, tmp, { sha1: file.hashes.sha1, onProgress: (r, t) => t && ui?.update(r / t * 0.1) })
  const sub = { update: (p, s) => ui?.update(p == null ? null : 0.1 + p * 0.9, s) }
  const inst = await importMrpack(tmp, sub, { name: proj.title, iconUrl: proj.icon_url, modpack: { projectId: proj.id, versionId: ver.id, version: ver.version_number } })
  fs.rmSync(tmp, { force: true })
  return inst
}

function expandPaths(root, rels) {
  const out = []
  const walk = rel => {
    const full = path.join(root, rel)
    if (!fs.existsSync(full)) return
    if (fs.statSync(full).isDirectory()) for (const c of fs.readdirSync(full)) walk(`${rel}/${c}`)
    else out.push(rel.replace(/\\/g, '/'))
  }
  rels.forEach(walk)
  return [...new Set(out)]
}

/** Экспорт сборки в .mrpack */
async function exportMrpack(instId, { name, version = '1.0.0', summary = '', include = [], dest }, ui) {
  const inst = instances.get(instId)
  const root = instances.dirOf(instId)
  const files = expandPaths(root, include)
  ui?.update(0.05, tr('Считаю хеши…'))
  const { hashFile } = require('./net')
  const modrinthCandidates = files.filter(f => /^(mods|resourcepacks|shaderpacks)\/[^/]+\.(jar|zip)$/i.test(f))
  const hashes = {}
  await pool(modrinthCandidates, 8, async f => {
    const full = path.join(root, f)
    hashes[f] = { sha1: await hashFile(full, 'sha1'), sha512: await hashFile(full, 'sha512'), size: fs.statSync(full).size }
  })
  ui?.update(0.4, tr('Ищу файлы на Modrinth…'))
  let found = {}
  if (modrinthCandidates.length) {
    found = await getJson('https://api.modrinth.com/v2/version_files', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: Object.values(hashes).map(h => h.sha1), algorithm: 'sha1' }),
    })
  }
  const zip = new AdmZip()
  const indexFiles = []
  for (const f of files) {
    const h = hashes[f]
    const v = h && found[h.sha1]
    const vf = v?.files.find(x => x.hashes.sha1 === h.sha1)
    if (vf) {
      indexFiles.push({ path: f, hashes: { sha1: h.sha1, sha512: h.sha512 }, env: { client: 'required', server: f.startsWith('mods/') ? 'required' : 'unsupported' }, downloads: [vf.url], fileSize: h.size })
    } else {
      zip.addLocalFile(path.join(root, f), path.posix.dirname('overrides/' + f))
    }
  }
  const dependencies = { minecraft: inst.mcVersion }
  if (LOADER_KEYS[inst.loader]) dependencies[LOADER_KEYS[inst.loader]] = inst.loaderVersion
  const index = { formatVersion: 1, game: 'minecraft', versionId: version, name: name || inst.name, summary, files: indexFiles, dependencies }
  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index, null, 2)))
  ui?.update(0.9, tr('Упаковываю…'))
  await new Promise((res, rej) => zip.writeZip(dest, err => err ? rej(err) : res()))
  updateStats(s => { s.exports = (s.exports || 0) + 1 })
  return { dest, fromModrinth: indexFiles.length, overrides: files.length - indexFiles.length }
}

module.exports = { importMrpack, installModpack, exportMrpack, saveIcon }
