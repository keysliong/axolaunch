// Списки версий Minecraft и загрузчиков
const { getJsonCached } = require('./net')

const MOJANG = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const LOADER_LABELS = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' }

async function getManifest() {
  return getJsonCached(MOJANG)
}

async function getMinecraftVersions() {
  const m = await getManifest()
  return { latest: m.latest, versions: m.versions.map(v => ({ id: v.id, type: v.type, releaseTime: v.releaseTime })) }
}

async function modrinthMeta(kind) {
  try {
    return await getJsonCached(`https://launcher-meta.modrinth.com/${kind}/v0/manifest.json`)
  } catch (e) {
    console.warn('launcher-meta недоступен, беру версии с maven:', e.message)
    return kind === 'forge' ? forgeFromMaven() : neoFromMaven()
  }
}

// запасные источники — официальные maven-репозитории
function groupBy(list, keyFn) {
  const map = new Map()
  for (const v of list) { const k = keyFn(v); if (!k) continue; if (!map.has(k)) map.set(k, []); map.get(k).push(v) }
  return { gameVersions: [...map].map(([id, loaders]) => ({ id, loaders: loaders.reverse().map(l => ({ id: l.id, stable: false })) })) }
}
async function forgeFromMaven() {
  const res = await fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml')
  const xml = await res.text()
  const all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1])
  return groupBy(all.map(v => ({ mc: v.split('-')[0], id: v.split('-')[1] })).filter(v => v.id), v => v.mc)
}
async function neoFromMaven() {
  const j = await getJsonCached('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge')
  const toMc = v => {
    const p = v.split(/[.+-]/).map(Number)
    if (p[0] >= 26) return `${p[0]}.${p[1]}` + (p[2] ? `.${p[2]}` : '')
    return `1.${p[0]}` + (p[1] ? `.${p[1]}` : '')
  }
  return groupBy(j.versions.map(id => ({ id, mc: toMc(id) })), v => v.mc)
}

/** Версии Minecraft, для которых есть загрузчик */
async function getLoaderGameVersions(loader) {
  switch (loader) {
    case 'vanilla': return null
    case 'fabric': return (await getJsonCached('https://meta.fabricmc.net/v2/versions/game')).map(v => v.version)
    case 'quilt': return (await getJsonCached('https://meta.quiltmc.org/v3/versions/game')).map(v => v.version)
    case 'forge': return (await modrinthMeta('forge')).gameVersions.filter(g => g.loaders.length).map(g => g.id)
    case 'neoforge': return (await modrinthMeta('neo')).gameVersions.filter(g => g.loaders.length).map(g => g.id)
  }
  return []
}

/** Версии загрузчика для конкретной версии игры: [{id, stable}] */
async function getLoaderVersions(loader, mc) {
  switch (loader) {
    case 'fabric': {
      const list = await getJsonCached(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}`)
      return list.map(x => ({ id: x.loader.version, stable: !!x.loader.stable }))
    }
    case 'quilt': {
      const list = await getJsonCached(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mc)}`)
      return list.map(x => ({ id: x.loader.version, stable: !/beta|alpha|pre|rc/i.test(x.loader.version) }))
    }
    case 'forge':
    case 'neoforge': {
      const meta = await modrinthMeta(loader === 'forge' ? 'forge' : 'neo')
      const g = meta.gameVersions.find(v => v.id === mc)
      if (!g) return []
      return g.loaders.map((l, i) => ({ id: l.id, stable: l.stable || (i === 0 && !/beta|alpha/.test(l.id)) }))
    }
  }
  return []
}

module.exports = { getManifest, getMinecraftVersions, getLoaderGameVersions, getLoaderVersions, LOADER_LABELS }
