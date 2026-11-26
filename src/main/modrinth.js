// Modrinth API v2
const { t: tr } = require('./i18n')
const fs = require('fs')
const path = require('path')
const { getJson, getJsonCached, download, pool } = require('./net')
const instances = require('./instances')
const { updateStats } = require('./store')

const API = 'https://api.modrinth.com/v2'
const api = (p, opts) => getJson(API + p, opts)
const apiCached = (p, ttl) => getJsonCached(API + p, ttl)

const TYPE_DIR = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks', datapack: 'datapacks', modpack: null }

async function search({ query = '', type = 'mod', categories = [], loaders = [], versions = [], env = [], index = 'relevance', offset = 0, limit = 20 }) {
  const facets = [[`project_type:${type}`]]
  if (categories.length) for (const c of categories) facets.push([`categories:${c}`])
  if (loaders.length) facets.push(loaders.map(l => `categories:${l}`))
  if (versions.length) facets.push(versions.map(v => `versions:${v}`))
  for (const e of env) facets.push([`${e}_side:required`, `${e}_side:optional`])
  const q = new URLSearchParams({ query, facets: JSON.stringify(facets), index, offset: String(offset), limit: String(limit) })
  return api('/search?' + q)
}

const project = id => apiCached(`/project/${encodeURIComponent(id)}`, 5 * 60 * 1000)
const projects = ids => ids.length ? api(`/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`) : []
const members = id => apiCached(`/project/${encodeURIComponent(id)}/members`, 30 * 60 * 1000)
const version = id => apiCached(`/version/${encodeURIComponent(id)}`, 30 * 60 * 1000)
const tags = async () => ({
  categories: await apiCached('/tag/category', 24 * 3600e3),
  loaders: await apiCached('/tag/loader', 24 * 3600e3),
  gameVersions: await apiCached('/tag/game_version', 3600e3),
})

async function projectVersions(id, { loaders, gameVersions } = {}) {
  const q = new URLSearchParams()
  if (loaders?.length) q.set('loaders', JSON.stringify(loaders))
  if (gameVersions?.length) q.set('game_versions', JSON.stringify(gameVersions))
  return api(`/project/${encodeURIComponent(id)}/version?${q}`)
}

async function random() {
  const r = await api('/projects_random?count=1')
  return r[0]
}

function loadersFor(inst, projectType) {
  if (projectType === 'mod') {
    if (inst.loader === 'quilt') return ['quilt', 'fabric']
    if (inst.loader === 'neoforge' && inst.mcVersion === '1.20.1') return ['neoforge', 'forge']
    return inst.loader === 'vanilla' ? [] : [inst.loader]
  }
  if (projectType === 'datapack') return ['datapack']
  return [] // ресурспаки и шейдеры — без фильтра по загрузчику
}

/** Подобрать лучшую версию проекта для сборки */
async function pickVersion(inst, projectId, projectType) {
  const list = await projectVersions(projectId, { loaders: loadersFor(inst, projectType), gameVersions: [inst.mcVersion] })
  if (!list.length) return null
  return list.find(v => v.version_type === 'release') || list[0]
}

function safeJoin(base, rel) {
  const full = path.resolve(base, rel)
  if (!full.startsWith(path.resolve(base) + path.sep)) throw new Error(tr('Небезопасный путь: {p}', { p: rel }))
  return full
}

/**
 * Установить проект (и обязательные зависимости) в сборку.
 * opts.versionId — конкретная версия; opts.world — для датапаков
 */
async function installProject(instId, projectId, opts = {}, ui, seen = new Set()) {
  if (seen.has(projectId)) return []
  seen.add(projectId)
  const inst = instances.get(instId)
  const proj = await project(projectId)
  const type = proj.project_type
  if (type === 'modpack') throw new Error(tr('Сборку нельзя поставить внутрь сборки — установите её как новую'))
  const ver = opts.versionId ? await version(opts.versionId) : await pickVersion(inst, proj.id, type)
  if (!ver) throw new Error(tr('«{name}» не поддерживает {loader} {v}', { name: proj.title, loader: inst.loader, v: inst.mcVersion }))

  // уже установлен?
  const already = Object.entries(inst.content).find(([, m]) => m.projectId === proj.id)
  if (already && !opts.versionId && !opts.force) return []
  if (already) {
    const oldPath = path.join(instances.dirOf(instId), already[0])
    for (const p of [oldPath, oldPath + '.disabled']) if (fs.existsSync(p)) fs.rmSync(p)
    const fresh = instances.get(instId); delete fresh.content[already[0]]; instances.save(fresh)
  }

  const file = ver.files.find(f => f.primary) || ver.files[0]
  let subdir = TYPE_DIR[type] || 'mods'
  if (type === 'datapack' && opts.world) subdir = `saves/${opts.world}/datapacks`
  const rel = `${subdir}/${file.filename}`
  const dest = safeJoin(instances.dirOf(instId), rel)
  ui?.update(null, tr('Скачиваю {name}', { name: proj.title }))
  await download(file.url, dest, { sha1: file.hashes.sha1, onProgress: (r, t) => t && ui?.update(r / t) })
  instances.recordContent(instId, rel, { projectId: proj.id, versionId: ver.id, versionNumber: ver.version_number, title: proj.title, icon: proj.icon_url || '', sha1: file.hashes.sha1, type })
  updateStats(s => { s.modsInstalled = (s.modsInstalled || 0) + 1 })
  const installed = [proj.title]

  // обязательные зависимости
  for (const dep of ver.dependencies || []) {
    if (dep.dependency_type !== 'required') continue
    try {
      if (dep.project_id) installed.push(...await installProject(instId, dep.project_id, { versionId: dep.version_id && !dep.project_id ? dep.version_id : undefined }, ui, seen))
      else if (dep.version_id) {
        const dv = await version(dep.version_id)
        installed.push(...await installProject(instId, dv.project_id, { versionId: dv.id }, ui, seen))
      }
    } catch (e) { console.warn('dependency failed', e.message) }
  }
  return installed
}

/** Определить файлы сборки через Modrinth по sha1 и сохранить метаданные */
async function identifyContent(instId) {
  const hashed = await instances.hashContent(instId)
  if (!hashed.length) return 0
  const res = await getJson(API + '/version_files', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hashes: hashed.map(h => h.sha1), algorithm: 'sha1' }),
  })
  const projIds = [...new Set(Object.values(res).map(v => v.project_id))]
  const projs = Object.fromEntries((await projects(projIds)).map(p => [p.id, p]))
  const inst = instances.get(instId)
  let n = 0
  for (const h of hashed) {
    const v = res[h.sha1]
    if (!v) { if (inst.content[h.rel]?.sha1 !== h.sha1) delete inst.content[h.rel]; continue }
    const p = projs[v.project_id]
    inst.content[h.rel] = { projectId: v.project_id, versionId: v.id, versionNumber: v.version_number, title: p?.title || h.file, icon: p?.icon_url || '', sha1: h.sha1, type: h.type }
    n++
  }
  instances.save(inst)
  return n
}

/** Проверка обновлений: { rel: newVersion } */
async function checkUpdates(instId) {
  const inst = instances.get(instId)
  const hashed = await instances.hashContent(instId)
  const out = {}
  for (const type of ['mod', 'resourcepack', 'shader']) {
    const group = hashed.filter(h => h.type === type)
    if (!group.length) continue
    const body = { hashes: group.map(h => h.sha1), algorithm: 'sha1', game_versions: [inst.mcVersion] }
    const loaders = loadersFor(inst, type)
    if (loaders.length) body.loaders = loaders
    const res = await getJson(API + '/version_files/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    for (const h of group) {
      const nv = res[h.sha1]
      if (nv && !nv.files.some(f => f.hashes.sha1 === h.sha1)) out[h.rel] = { versionId: nv.id, versionNumber: nv.version_number, projectId: nv.project_id, file: h.file, type }
    }
  }
  return out
}

async function applyUpdates(instId, updates, ui) {
  const entries = Object.entries(updates)
  let i = 0
  await pool(entries, 4, async ([rel, u]) => {
    const full = path.join(instances.dirOf(instId), path.dirname(rel), u.file)
    const wasDisabled = u.file.endsWith('.disabled')
    const v = await version(u.versionId)
    const f = v.files.find(x => x.primary) || v.files[0]
    const newRel = `${path.dirname(rel)}/${f.filename}`
    const dest = path.join(instances.dirOf(instId), newRel) + (wasDisabled ? '.disabled' : '')
    await download(f.url, dest, { sha1: f.hashes.sha1 })
    if (path.resolve(full) !== path.resolve(dest) && fs.existsSync(full)) fs.rmSync(full)
    const inst = instances.get(instId)
    const old = inst.content[rel] || {}
    delete inst.content[rel]
    inst.content[newRel] = { ...old, versionId: v.id, versionNumber: v.version_number, sha1: f.hashes.sha1 }
    instances.save(inst)
    ui?.update(++i / entries.length, tr('Обновлено {i}/{n}', { i, n: entries.length }))
  })
}

module.exports = { search, project, projects, members, version, tags, projectVersions, random, installProject, identifyContent, checkUpdates, applyUpdates, pickVersion, safeJoin, loadersFor }
