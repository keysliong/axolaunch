const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const { currentSignal, throwIfCancelled, isCancel } = require('./tasks')
const { t } = require('./i18n')

const UA = 'Axolaunch/1.2.0 (minecraft launcher)'
const STALL_MS = 30000 // РµСЃР»Рё 30 СЃ РЅРµ РїСЂРёС€Р»Рѕ РЅРё Р±Р°Р№С‚Р° вЂ” СЃРѕРµРґРёРЅРµРЅРёРµ СЃС‡РёС‚Р°РµРј Р·Р°РІРёСЃС€РёРј

/** fetch, РєРѕС‚РѕСЂС‹Р№ РѕС‚РјРµРЅСЏРµС‚СЃСЏ Р·Р°РґР°С‡РµР№ Рё РѕР±СЂС‹РІР°РµС‚СЃСЏ РїСЂРё Р·Р°РІРёСЃР°РЅРёРё (Р±РµР· РґР°РЅРЅС‹С… STALL_MS) */
function watchdog(outer) {
  const ctrl = new AbortController()
  let timer
  const kick = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(Object.assign(new Error(t('РЎРµСЂРІРµСЂ РЅРµ РѕС‚РІРµС‡Р°РµС‚')), { stalled: true })), STALL_MS) }
  const onOuter = () => ctrl.abort(outer.reason)
  if (outer) { if (outer.aborted) ctrl.abort(outer.reason); else outer.addEventListener('abort', onOuter, { once: true }) }
  kick()
  return { signal: ctrl.signal, kick, stop() { clearTimeout(timer); outer?.removeEventListener('abort', onOuter) } }
}

async function getJson(url, opts = {}) {
  let lastErr
  const outer = opts.signal || currentSignal()
  for (let i = 0; i < 3; i++) {
    const wd = watchdog(outer)
    try {
      const res = await fetch(url, { ...opts, signal: wd.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) } })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const err = new Error(`HTTP ${res.status} ${url}: ${text.slice(0, 200)}`)
        err.status = res.status
        if (res.status >= 400 && res.status < 500 && res.status !== 429) throw err
        throw Object.assign(err, { retry: true })
      }
      return await res.json()
    } catch (e) {
      lastErr = e
      if (outer?.aborted) throw outer.reason || e
      if (e.status && !e.retry) throw e
    } finally {
      wd.stop()
    }
    await sleep(500 * (i + 1), outer)
  }
  throw lastErr
}

const cache = new Map()
async function getJsonCached(url, ttl = 10 * 60 * 1000) {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.t < ttl) return hit.v
  const v = await getJson(url)
  cache.set(url, { t: Date.now(), v })
  return v
}

async function hashFile(file, algo = 'sha1') {
  const h = crypto.createHash(algo)
  await pipeline(fs.createReadStream(file), h)
  return h.digest('hex')
}

/** РЎРєР°С‡РёРІР°РµС‚ С„Р°Р№Р». sha1 вЂ” РѕРїС†РёРѕРЅР°Р»СЊРЅР°СЏ РїСЂРѕРІРµСЂРєР°. onProgress(received, total) */
async function download(url, dest, { sha1, sha512, onProgress, signal } = {}) {
  const outer = signal || currentSignal()
  throwIfCancelled(outer)
  const urls = (Array.isArray(url) ? url : [url]).filter(Boolean)
  if (sha1 && fs.existsSync(dest) && (await hashFile(dest, 'sha1')) === sha1) return dest
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  let lastErr
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const u of urls) {
      const tmp = `${dest}.${process.pid}-${Math.random().toString(36).slice(2, 8)}.part`
      const wd = watchdog(outer)
      try {
        const res = await fetch(u, { headers: { 'User-Agent': UA }, signal: wd.signal, redirect: 'follow' })
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${u}`), { status: res.status })
        const total = Number(res.headers.get('content-length')) || 0
        let received = 0
        const body = Readable.fromWeb(res.body)
        body.on('data', c => { wd.kick(); received += c.length; onProgress?.(received, total) })
        await pipeline(body, fs.createWriteStream(tmp), { signal: wd.signal })
        if (sha1 && (await hashFile(tmp, 'sha1')) !== sha1) throw new Error(t('РќРµРІРµСЂРЅР°СЏ РєРѕРЅС‚СЂРѕР»СЊРЅР°СЏ СЃСѓРјРјР°: {f}', { f: path.basename(dest) }))
        if (sha512 && (await hashFile(tmp, 'sha512')) !== sha512) throw new Error(t('РќРµРІРµСЂРЅР°СЏ РєРѕРЅС‚СЂРѕР»СЊРЅР°СЏ СЃСѓРјРјР°: {f}', { f: path.basename(dest) }))
        fs.renameSync(tmp, dest)
        return dest
      } catch (e) {
        lastErr = e
        try { fs.unlinkSync(tmp) } catch {}
        if (outer?.aborted) throw outer.reason || e
        if (e.status === 404 || e.status === 403) break // СЌС‚РѕС‚ Р°РґСЂРµСЃ РЅРµ РѕР¶РёРІС‘С‚ вЂ” РїСЂРѕР±СѓРµРј СЃР»РµРґСѓСЋС‰РёР№
      } finally {
        wd.stop()
      }
    }
    if (lastErr?.status === 404 && attempt >= 1) break
    await sleep(700 * (attempt + 1), outer)
  }
  throw new Error(t('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєР°С‡Р°С‚СЊ {f}: {err}', { f: path.basename(dest), err: lastErr?.message || '?' }))
}

/** РџР°СѓР·Р°, РїСЂРµСЂС‹РІР°РµРјР°СЏ РѕС‚РјРµРЅРѕР№ Р·Р°РґР°С‡Рё */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const tm = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { clearTimeout(tm); reject(signal.reason) }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** РџР°СЂР°Р»Р»РµР»СЊРЅР°СЏ РѕР±СЂР°Р±РѕС‚РєР° СЃ Р»РёРјРёС‚РѕРј; РїСЂРё РїРµСЂРІРѕР№ РѕС€РёР±РєРµ РёР»Рё РѕС‚РјРµРЅРµ РЅРѕРІС‹Рµ СЌР»РµРјРµРЅС‚С‹ РЅРµ Р±РµСЂСѓС‚СЃСЏ */
async function pool(items, limit, fn) {
  const results = new Array(items.length)
  const signal = currentSignal()
  let i = 0, failed = false
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length && !failed) {
      throwIfCancelled(signal)
      const idx = i++
      try { results[idx] = await fn(items[idx], idx) } catch (e) { failed = true; throw e }
    }
  })
  // Р¶РґС‘Рј РІСЃРµ РїРѕС‚РѕРєРё (С‡С‚РѕР±С‹ РЅРё РѕРґРёРЅ С„Р°Р№Р» РЅРµ РѕСЃС‚Р°Р»СЃСЏ РѕС‚РєСЂС‹С‚С‹Рј), Р·Р°С‚РµРј РїСЂРѕР±СЂР°СЃС‹РІР°РµРј РїРµСЂРІСѓСЋ РѕС€РёР±РєСѓ
  const settled = await Promise.allSettled(workers)
  const bad = settled.find(r => r.status === 'rejected')
  if (bad) throw bad.reason
  return results
}

module.exports = { UA, getJson, getJsonCached, download, hashFile, pool, sleep, isCancel }
