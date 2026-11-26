// CurseForge: поиск и установка модов, ресурспаков, шейдеров и датапаков через официальный API
// Нужен API-ключ (бесплатно на console.curseforge.com) — хранится в настройках (cfApiKey)
const path = require('path')
const fs = require('fs')
const { t: tr } = require('./i18n')
const { getJson, download } = require('./net')
const { getSettings, updateStats } = require('./store')
const instances = require('./instances')

const API = 'https://api.curseforge.com/v1'
const GAME = 432
const CLASS = { mod: 6, resourcepack: 12, shader: 6552, datapack: 6945, modpack: 4471 }
const TYPE_BY_CLASS = Object.fromEntries(Object.entries(CLASS).map(([k, v]) => [v, k]))
const LOADER = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }
const LOADER_NAME = Object.fromEntries(Object.entries(LOADER).map(([k, v]) => [v, k]))
const DIR = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks', datapack: 'datapacks' }
const SORT = { relevance: 1, downloads: 6, follows: 2, newest: 11, updated: 3 }

const key = () => (getSettings().cfApiKey || '').trim()
const hasKey = () => !!key()

async function cf(p, opts = {}) {
  const k = key()
  if (!k) throw Object.assign(new Error(tr('Нужен API-ключ CurseForge')), { code: 'NO_KEY' })
  try {
    return await getJson(API + p, { ...opts, headers: { 'x-api-key': k, Accept: 'application/json', ...(opts.headers || {}) } })
  } catch (e) {
    if (e.status === 403 || e.status === 401) throw Object.assign(new Error(tr('CurseForge не принял API-ключ — проверьте его в настройках')), { code: 'BAD_KEY' })
    throw e
  }
}

const norm = (m, type) => ({
  source: 'curseforge',
  id: 'cf:' + m.id,
  project_id: 'cf:' + m.id,
  cfId: m.id,
  slug: m.slug,
  title: m.name,
  author: m.authors?.[0]?.name || '',
  description: m.summary || '',
  icon_url: m.logo?.thumbnailUrl || m.logo?.url || '',
  downloads: m.downloadCount || 0,
  follows: m.thumbsUpCount || 0,
  display_categories: (m.categories || []).map(c => c.name).slice(0, 5),
  date_modified: m.dateModified,
  url: m.links?.websiteUrl || `https://www.curseforge.com/minecraft/search?search=${encodeURIComponent(m.name)}`,
  project_type: type || TYPE_BY_CLASS[m.classId] || 'mod',
  // для окна «В какую сборку?»: какие версии игры и загрузчики есть у файлов
  game_versions: [...new Set((m.latestFilesIndexes || []).map(x => x.gameVersion))],
  loaders: [...new Set((m.latestFilesIndexes || []).map(x => LOADER_NAME[x.modLoader]).filter(Boolean))],
})

async function search({ query = '', type = 'mod', loaders = [], versions = [], index = 'relevance', offset = 0, limit = 20 }) {
  const q = new URLSearchParams({ gameId: GAME, classId: CLASS[type] || 6, searchFilter: query, sortField: SORT[index] || 1, sortOrder: 'desc', index: String(Math.min(offset, 9980)), pageSize: String(limit) })
  if (versions[0]) q.set('gameVersion', versions[0])
  if (type === 'mod' && loaders.length && LOADER[loaders[0]]) q.set('modLoaderType', LOADER[loaders[0]])
  const r = await cf('/mods/search?' + q)
  return { total_hits: Math.min(r.pagination?.totalCount || 0, 10000), hits: (r.data || []).map(m => norm(m, type)) }
}

const cfIdOf = id => Number(String(id).replace(/^cf:/, ''))
async function project(id) { return norm((await cf(`/mods/${cfIdOf(id)}`)).data) }

/** Подобрать файл под сборку */
async function pickFile(inst, modId, type) {
  const q = new URLSearchParams({ pageSize: '50' })
  if (type !== 'resourcepack' && type !== 'shader') q.set('gameVersion', inst.mcVersion)
  const loaders = type === 'mod' ? (inst.loader === 'quilt' ? ['quilt', 'fabric'] : inst.loader === 'neoforge' && inst.mcVersion === '1.20.1' ? ['neoforge', 'forge'] : [inst.loader]) : []
  const tries = loaders.length ? loaders : [null]
  for (const l of tries) {
    const qq = new URLSearchParams(q)
    if (l && LOADER[l]) qq.set('modLoaderType', LOADER[l])
    const files = ((await cf(`/mods/${modId}/files?${qq}`)).data || []).filter(f => f.isAvailable !== false)
    // releaseType: 1 — релиз, 2 — бета, 3 — альфа
    const sorted = files.sort((a, b) => (a.releaseType - b.releaseType) || (new Date(b.fileDate) - new Date(a.fileDate)))
    if (sorted.length) return sorted[0]
  }
  return null
}

async function installProject(instId, id, opts = {}, ui, seen = new Set()) {
  const modId = cfIdOf(id)
  if (seen.has(modId)) return []
  seen.add(modId)
  const inst = instances.get(instId)
  const m = (await cf(`/mods/${modId}`)).data
  const type = TYPE_BY_CLASS[m.classId] || 'mod'
  if (type === 'modpack') throw new Error(tr('Сборки с CurseForge пока ставятся только через сайт: скачайте zip и импортируйте его'))
  if (!DIR[type]) throw new Error(tr('Этот тип контента не поддерживается'))
  if (type === 'mod' && inst.loader === 'vanilla') throw new Error(tr('В ванильную сборку нельзя ставить моды'))

  const already = Object.entries(inst.content).find(([, c]) => c.projectId === 'cf:' + modId)
  if (already && !opts.force) return []

  const file = await pickFile(inst, modId, type)
  if (!file) throw new Error(tr('«{name}» не поддерживает {loader} {v}', { name: m.name, loader: inst.loader, v: inst.mcVersion }))
  if (!file.downloadUrl) throw Object.assign(new Error(tr('Автор «{name}» запретил скачивание через сторонние лаунчеры — скачайте файл на сайте CurseForge', { name: m.name })), { url: m.links?.websiteUrl })

  let subdir = DIR[type]
  if (type === 'datapack' && opts.world) subdir = `saves/${opts.world}/datapacks`
  const rel = `${subdir}/${file.fileName}`
  const dest = path.resolve(instances.dirOf(instId), rel)
  if (!dest.startsWith(path.resolve(instances.dirOf(instId)) + path.sep)) throw new Error(tr('Небезопасный путь: {p}', { p: rel }))
  if (already) for (const p of [path.join(instances.dirOf(instId), already[0]), path.join(instances.dirOf(instId), already[0]) + '.disabled']) if (fs.existsSync(p)) fs.rmSync(p)

  const sha1 = (file.hashes || []).find(h => h.algo === 1)?.value
  ui?.update(null, tr('Скачиваю {name}', { name: m.name }))
  await download(file.downloadUrl, dest, { sha1, onProgress: (r, t) => t && ui?.update(r / t) })
  instances.recordContent(instId, rel, {
    projectId: 'cf:' + modId, versionId: 'cf:' + file.id, versionNumber: file.displayName || file.fileName,
    title: m.name, icon: m.logo?.thumbnailUrl || '', sha1: sha1 || '', type, source: 'curseforge', url: m.links?.websiteUrl || '',
  })
  updateStats(s => { s.modsInstalled = (s.modsInstalled || 0) + 1 })
  const installed = [m.name]

  // обязательные зависимости (relationType 3)
  for (const d of file.dependencies || []) {
    if (d.relationType !== 3) continue
    try { installed.push(...await installProject(instId, d.modId, {}, ui, seen)) } catch (e) { console.warn('cf dependency', e.message) }
  }
  return installed
}

module.exports = { hasKey, search, project, installProject }
