// Установка Minecraft + загрузчиков (Fabric / Quilt / Forge / NeoForge)
const { t: tr } = require('./i18n')
const fs = require('fs')
const path = require('path')
const { MinecraftFolder, Version } = require('@xmcl/core')
const { installVersionTask, installLibrariesTask, installAssetsTask, installForgeTask, installNeoForgedTask } = require('@xmcl/installer')
const { P, getSettings } = require('./store')
const { getJson, sleep, download, pool } = require('./net')
const { currentSignal, throwIfCancelled, CancelledError, runTask, cancelFor } = require('./tasks')
const { getManifest } = require('./versions')
const { ensureJava } = require('./java')
const instances = require('./instances')

const { Agent } = require('undici')

const mcFolder = () => MinecraftFolder.from(P.meta)

// CDN Mojang рвёт соединения при многопоточной докачке по диапазонам,
// поэтому качаем каждый файл одним запросом и с повторами.
let agent
function downloadAgent() {
  agent ||= {
    dispatcher: new Agent({ connections: 16, keepAliveTimeout: 4000, headersTimeout: 30000, bodyTimeout: 30000, connectTimeout: 20000 }),
    rangePolicy: { computeRanges: total => [{ start: 0, end: Math.max(0, total - 1) }] },
    retryHandler: { async retry(url, attempt) { await new Promise(r => setTimeout(r, 300 * attempt)); return attempt < 6 } },
  }
  return agent
}

/** Запускает xmcl-задачу, транслируя её прогресс в диапазон [from, to] */
async function runXmcl(make, ui, label, from, to) {
  // make — фабрика задачи: при сетевом сбое пересоздаём задачу (уже скачанное не перекачивается)
  if (typeof make !== 'function') { const t = make; make = () => t }
  for (let attempt = 1; ; attempt++) {
    throwIfCancelled()
    try { return await runXmclOnce(make(), ui, label, from, to) } catch (e) {
      if (currentSignal()?.aborted) throw new CancelledError()
      const net = /Download|Timeout|ECONN|ETIMEDOUT|socket|fetch|other side closed/i.test(`${e?.name} ${e?.message} ${e?.errors?.map?.(x => x?.message).join(' ')}`)
      if (!net || attempt >= 4) throw e
      ui.update(null, tr('{label}: сбой сети, повтор {n}/3…', { label, n: attempt }))
      await sleep(2000 * attempt, currentSignal())
    }
  }
}

const STALL_MS = 90000 // если xmcl-задача 90 с не двигается — считаем её зависшей и перезапускаем

async function runXmclOnce(task, ui, label, from, to) {
  const signal = currentSignal()
  let stalled = false
  const onAbort = () => { try { task.cancel() } catch {} }
  signal?.addEventListener('abort', onAbort, { once: true })
  let lastProgress = -1, lastMove = Date.now(), lastTotal = 0, shown = 0
  const timer = setInterval(() => {
    const total = task.total || 0, prog = task.progress || 0
    if (prog !== lastProgress || total !== lastTotal) { lastProgress = prog; lastTotal = total; lastMove = Date.now() }
    else if (Date.now() - lastMove > STALL_MS && !stalled) { stalled = true; try { task.cancel() } catch {} }
    // total растёт по мере обнаружения файлов, поэтому полоску считаем по байтам как есть
    // (раньше «монотонный» прогресс застревал на конце диапазона, как только первый маленький файл докачивался)
    const p = total > 1048576 ? Math.min(1, prog / total) : shown
    shown = p
    const mb = total > 1048576 ? ` — ${Math.round(prog / 1048576)} / ${Math.round(total / 1048576)}${tr(' МБ')}` : ''
    ui.update(from + (to - from) * p, label + mb)
  }, 250)
  try {
    return await task.startAndWait({})
  } catch (e) {
    if (stalled && !signal?.aborted) throw new Error('Download stalled: ' + (e?.message || ''))
    throw e
  } finally {
    clearInterval(timer)
    signal?.removeEventListener('abort', onAbort)
    ui.update(to, label)
  }
}

/**
 * Ассеты игры. Своя реализация вместо xmcl: xmcl запускает проверку всех ~5000 файлов разом
 * и на уже скачанных файлах «стоит» минутами без прогресса. Здесь файл с правильным размером
 * пропускается сразу, недостающие качаются пулом с проверкой sha1, таймаутом зависаний и отменой.
 */
async function installAssets(version, opts, ui, from, to) {
  const ai = version.assetIndex
  if (!ai?.url) return
  const label = tr('Ассеты игры')
  ui.update(from, label)
  const idxPath = path.join(P.meta, 'assets', 'indexes', `${ai.id}.json`)
  await download(ai.url, idxPath, { sha1: ai.sha1 })
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'))
  // очень старые версии (до 1.7) требуют раскладки ассетов по именам — это умеет xmcl
  if (idx.virtual || idx.map_to_resources) return runXmcl(() => installAssetsTask(version, opts), ui, label, from, to)

  const seen = new Set()
  const missing = []
  for (const o of Object.values(idx.objects || {})) {
    if (seen.has(o.hash)) continue
    seen.add(o.hash)
    const file = path.join(P.meta, 'assets', 'objects', o.hash.slice(0, 2), o.hash)
    let ok = false
    try { ok = fs.statSync(file).size === o.size } catch {}
    if (!ok) missing.push({ ...o, file })
  }
  if (!missing.length) return ui.update(to, label)
  const total = missing.reduce((a, o) => a + o.size, 0)
  let done = 0
  const mb = n => Math.round(n / 1048576)
  const report = () => ui.update(from + (to - from) * (done / total), `${label} — ${mb(done)} / ${mb(total)}${tr(' МБ')}`)
  report()
  // файлы мелкие (~100 КБ), скорость упирается в задержку ответа — берём много потоков
  await pool(missing, Math.max(48, getSettings().concurrency || 8), async o => {
    const url = `https://resources.download.minecraft.net/${o.hash.slice(0, 2)}/${o.hash}`
    let last = 0
    await download(url, o.file, { sha1: o.hash, onProgress: r => { done += r - last; last = r; report() } })
    done += o.size - last
    report()
  })
}

function versionJsonExists(id) {
  return fs.existsSync(path.join(P.meta, 'versions', id, id + '.json'))
}

async function writeProfile(url) {
  const profile = await getJson(url)
  const dir = path.join(P.meta, 'versions', profile.id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, profile.id + '.json'), JSON.stringify(profile, null, 2))
  return profile.id
}

async function installRuntime(instId, ui) {
  const inst = instances.get(instId)
  const mc = mcFolder()
  const opts = { maxConcurrency: Math.max(8, getSettings().concurrency || 8), side: 'client', agent: downloadAgent() }

  // 1. Ванильная версия
  const manifest = await getManifest()
  const meta = manifest.versions.find(v => v.id === inst.mcVersion)
  if (!meta) throw new Error(tr('Неизвестная версия Minecraft: {v}', { v: inst.mcVersion }))
  const gameLabel = tr('Minecraft {v}: файлы игры', { v: inst.mcVersion })
  await runXmcl(() => installVersionTask(meta, mc.root, opts), ui, gameLabel, 0, 0.08)
  const vanilla = await Version.parse(mc.root, inst.mcVersion)
  await runXmcl(() => installLibrariesTask(vanilla, opts), ui, tr('Библиотеки Minecraft'), 0.08, 0.15)
  await installAssets(vanilla, opts, ui, 0.15, 0.55)

  // 2. Java
  const major = vanilla.javaVersion?.majorVersion || 8
  const java = inst.settings?.javaPath || await ensureJava(major, { update: (p, s) => ui.update(0.55 + 0.1 * (p || 0), s) })

  // 3. Загрузчик
  let versionId = inst.mcVersion
  const lv = inst.loaderVersion
  const label = tr('Установка {loader} {v}', { loader: inst.loader, v: lv })
  ui.update(0.66, label)
  switch (inst.loader) {
    case 'fabric':
      versionId = await writeProfile(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(inst.mcVersion)}/${encodeURIComponent(lv)}/profile/json`)
      break
    case 'quilt':
      versionId = await writeProfile(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(inst.mcVersion)}/${encodeURIComponent(lv)}/profile/json`)
      break
    case 'forge':
      versionId = await runXmcl(() => installForgeTask({ mcversion: inst.mcVersion, version: lv }, mc.root, { ...opts, java }), ui, label, 0.66, 0.85)
      break
    case 'neoforge': {
      const legacy = inst.mcVersion === '1.20.1'
      versionId = await runXmcl(
        () => installNeoForgedTask(legacy ? 'forge' : 'neoforge', legacy ? `1.20.1-${lv}` : lv, mc.root, { ...opts, java }),
        ui, label, 0.66, 0.85)
      break
    }
  }

  // 4. Библиотеки загрузчика. Ассеты и библиотеки игры уже поставил installTask на шаге 1 —
  // повторный installDependenciesTask заново проверял все ~500 МБ ассетов и мог «висеть» минутами.
  if (inst.loader !== 'vanilla') {
    const resolved = await Version.parse(mc.root, versionId)
    await runXmcl(() => installLibrariesTask(resolved, opts), ui, tr('Библиотеки загрузчика'), 0.85, 1)
  }

  return instances.update(instId, { versionId, installed: true, javaMajor: major })
}

function isRuntimeReady(inst) {
  return inst.installed && inst.versionId && versionJsonExists(inst.versionId)
}

// Одна установка на сборку: повторный вызов (например, «Играть» во время установки) ждёт текущую,
// а не запускает вторую копию, которая писала бы в те же файлы.
const inflight = new Map()
async function installRuntimeTask(instId, title, { restart = false } = {}) {
  if (inflight.has(instId)) {
    if (!restart) return inflight.get(instId)
    cancelFor(instId)
    await inflight.get(instId).catch(() => {})
  }
  const p = runTask(title, t => installRuntime(instId, t), { instance: instId }).finally(() => { if (inflight.get(instId) === p) inflight.delete(instId) })
  inflight.set(instId, p)
  return p
}

module.exports = { installRuntime, installRuntimeTask, isRuntimeReady, mcFolder }
