// «Доктор сборок»: разбирает лог и crash-report упавшей игры, находит виновные моды и предлагает починку
const fs = require('fs')
const path = require('path')
const os = require('os')
const AdmZip = require('adm-zip')
const { t: tr } = require('./i18n')
const instances = require('./instances')
const modrinth = require('./modrinth')
const versions = require('./versions')

// id, которые не являются модами (их не ставят и не отключают)
const SYSTEM = new Set(['minecraft', 'java', 'fabricloader', 'fabric-loader', 'quilt_loader', 'forge', 'neoforge', 'fml', 'javafml', 'mixinextras', 'mixin'])
// id мода → slug на Modrinth, где они различаются
const SLUG = {
  fabric: 'fabric-api', 'fabric-api-base': 'fabric-api', fabric_api: 'fabric-api',
  architectury: 'architectury-api', cloth_config: 'cloth-config', 'cloth-config2': 'cloth-config', cloth_config2: 'cloth-config',
  forgeconfigapiport: 'forge-config-api-port', owo: 'owo-lib', 'yet_another_config_lib_v3': 'yacl', 'yet-another-config-lib': 'yacl',
  modmenu: 'modmenu', kotlinforforge: 'kotlin-for-forge', 'fabric-language-kotlin': 'fabric-language-kotlin', geckolib3: 'geckolib',
  balm: 'balm', puzzleslib: 'puzzles-lib', 'puzzles_lib': 'puzzles-lib', collective: 'collective', resourcefullib: 'resourceful-lib',
  creativecore: 'creativecore', midnightlib: 'midnightlib', 'trinkets': 'trinkets', 'curios': 'curios', terrablender: 'terrablender',
  bookshelf: 'bookshelf-lib', 'placebo': 'placebo', 'sodium': 'sodium', 'iris': 'iris', 'lithium': 'lithium', 'indium': 'indium',
}
const slugFor = id => SLUG[id] || (/^fabric-.+-v\d+$/.test(id) || /^fabric-api-/.test(id) ? 'fabric-api' : id.replace(/_/g, '-'))

// ---------- индекс модов сборки: id → файл ----------
const metaCache = new Map() // путь → { key, ids, name, version }
function readJarMeta(file) {
  const st = fs.statSync(file)
  const key = `${st.size}:${st.mtimeMs}`
  const hit = metaCache.get(file)
  if (hit && hit.key === key) return hit
  const out = { key, ids: [], name: '', version: '', pkgs: new Set() }
  try {
    const zip = new AdmZip(file)
    for (const e of zip.getEntries()) {
      const n = e.entryName
      if (n.endsWith('.class') && !n.startsWith('META-INF/')) out.pkgs.add(n.slice(0, n.lastIndexOf('/') + 1))
    }
    const txt = n => { const e = zip.getEntry(n); return e ? e.getData().toString('utf8') : null }
    const fab = txt('fabric.mod.json')
    if (fab) {
      const j = JSON.parse(fab.replace(/^\uFEFF/, '').replace(/[\u0000-\u001f]+/g, ' '))
      out.ids.push(j.id, ...(j.provides || []).map(p => typeof p === 'string' ? p : p.id)); out.name = j.name || j.id; out.version = j.version || ''
    }
    const quilt = txt('quilt.mod.json')
    if (quilt) {
      const j = JSON.parse(quilt).quilt_loader || {}
      out.ids.push(j.id, ...(j.provides || []).map(p => typeof p === 'string' ? p : p.id)); out.name ||= j.metadata?.name || j.id; out.version ||= j.version || ''
    }
    for (const n of ['META-INF/neoforge.mods.toml', 'META-INF/mods.toml']) {
      const toml = txt(n)
      if (!toml) continue
      for (const m of toml.matchAll(/^\s*modId\s*=\s*["']([^"']+)["']/gm)) out.ids.push(m[1])
      out.name ||= (/^\s*displayName\s*=\s*["']([^"']+)["']/m.exec(toml) || [])[1] || ''
    }
  } catch {}
  out.ids = [...new Set(out.ids.filter(Boolean).map(s => s.toLowerCase()))]
  metaCache.set(file, out)
  return out
}

async function modIndex(instId) {
  const list = await instances.listContent(instId, 'mod')
  const dir = path.join(instances.dirOf(instId), 'mods')
  const byId = new Map()
  const mods = list.filter(m => !m.isDir && /\.jar(\.disabled)?$/i.test(m.file)).map(m => {
    const meta = readJarMeta(path.join(dir, m.file))
    const mod = { ...m, ids: meta.ids, pkgs: meta.pkgs, modName: m.title || meta.name || m.name, modVersion: meta.version || m.versionNumber || '' }
    if (m.enabled) for (const id of meta.ids) if (!byId.has(id)) byId.set(id, mod)
    return mod
  })
  return { mods, byId }
}
// какому моду принадлежит класс (по пакету внутри jar)
function ownerOfClass(idx, cls) {
  if (!cls) return null
  const parts = cls.replace(/\$.*$/, '').split('.').slice(0, -1)
  const pkg = parts.join('/') + '/'
  const direct = idx.mods.find(m => m.enabled && m.pkgs?.has(pkg))
  if (direct) return direct
  // мод внутри другого jar (jar-in-jar) — пробуем по сегментам пакета: ru.kelcuprum.kelui → kelui
  for (const seg of parts.slice(1).reverse()) { const m = idx.byId.get(seg.toLowerCase()); if (m && !SYSTEM.has(seg)) return m }
  return null
}

// ---------- стек вызовов: кто на самом деле упал ----------
const ENGINE = /^(net\.minecraft\.|com\.mojang\.|net\.fabricmc\.|org\.quiltmc\.loader|java\.|javax\.|jdk\.|sun\.|org\.spongepowered\.|com\.llamalad7\.|cpw\.|net\.neoforged\.(fml|neoforgespi|bus)|net\.minecraftforge\.(fml|eventbus|forgespi)|org\.lwjgl\.|io\.netty\.|com\.google\.|org\.apache\.|it\.unimi\.|org\.slf4j\.|kotlin\.|kotlinx\.)/
function analyzeStack(text) {
  // первый блок «исключение + строки at …»
  const m = /^(?:Caused by: )?((?:[\w$]+\.)+[\w$]*(?:Exception|Error|Throwable))(?::[ \t]*([^\n]*))?\r?\n((?:[ \t]+at [^\n]+\n?)+)/m.exec(text)
  if (!m) return null
  const [, exc, msg = '', body] = m
  const frames = [...body.matchAll(/at (?:[\w.\-]+\/\/)?((?:[\w$]+\.)+?)([\w$<>]+)\(/g)].map(f => ({ cls: f[1].slice(0, -1), method: f[2] }))
  let cls = null, mixinMod = null
  for (const fr of frames) {
    if (!ENGINE.test(fr.cls)) { cls = fr.cls; break }
    // метод, вшитый миксином: handler$abc123$modid$name
    const mx = /^(?:handler|redirect|modify\w*|wrapOperation|wrapMethod|localvar|inject)\$\w+?\$([a-z][\w-]*)\$/.exec(fr.method)
    if (mx && !mixinMod && mx[1] !== 'mixinextras' && !/^fabric(-|$)/.test(mx[1])) mixinMod = mx[1]
  }
  // NoSuchMethodError и т. п.: чей класс оказался «не той версии»
  let missingCls = null
  if (/NoSuchMethodError|NoSuchFieldError|NoClassDefFoundError|ClassNotFoundException|IncompatibleClassChangeError|AbstractMethodError/.test(exc)) {
    const c = /((?:[a-z][\w$]*\.){2,}[A-Z][\w$]*)/.exec(msg.replace(/\//g, '.'))
    missingCls = c ? c[1] : null
  }
  if (!cls && !mixinMod) return null
  return { exc: exc.split('.').pop(), cls, mixinMod, missingCls }
}

// ---------- сбор текста ----------
function gatherText(instId, logs, since) {
  const dir = instances.dirOf(instId)
  const parts = [(logs || []).join('\n')]
  const crashDir = path.join(dir, 'crash-reports')
  let crashFile = null
  try {
    const newest = fs.readdirSync(crashDir).filter(f => f.endsWith('.txt'))
      .map(f => ({ f, m: fs.statSync(path.join(crashDir, f)).mtimeMs })).sort((a, b) => b.m - a.m)[0]
    if (newest && (!since || newest.m >= since - 5000)) { crashFile = path.join(crashDir, newest.f); parts.push(fs.readFileSync(crashFile, 'utf8')) }
  } catch {}
  if (!logs?.length) {
    try { parts.push(fs.readFileSync(path.join(dir, 'logs', 'latest.log'), 'utf8').slice(-400000)) } catch {}
  }
  return { text: parts.join('\n'), crashFile }
}

// ---------- разбор ----------
function analyzeText(text, idx, inst) {
  const problems = [] // { kind, ids|file, ... }
  const add = p => {
    const old = problems.find(x => x.kind === p.kind && x.target === p.target)
    if (!old) problems.push(p)
    else if (p.by && !old.by) old.by = p.by
  }
  const isMod = id => id && !SYSTEM.has(id)

  // Fabric / Quilt: «A potential solution has been determined» + «More details»
  for (const m of text.matchAll(/-\s*Install ([\w.-]+), (?:any version|version [^\n.]+)/g)) if (isMod(m[1])) add({ kind: 'missing', target: m[1].toLowerCase() })
  for (const m of text.matchAll(/-\s*Replace (?:mod )?'([^']+)' \(([\w.-]+)\)/g)) add({ kind: 'outdated', target: m[2].toLowerCase() })
  for (const m of text.matchAll(/-\s*Remove mod '([^']+)' \(([\w.-]+)\)/g)) add({ kind: 'conflict', target: m[2].toLowerCase() })
  for (const line of text.split(/\r?\n/)) {
    const src = /Mod '[^']+' \(([\w.-]+)\)/.exec(line)?.[1]?.toLowerCase()
    if (!src) continue
    if (/which is missing/.test(line)) {
      const dep = /requires .*? of (?:mod )?(?:'[^']*' \(([\w.-]+)\)|([\w.-]+)),? which is missing/.exec(line)
      const id = (dep?.[1] || dep?.[2] || '').toLowerCase()
      if (id === 'minecraft' || id === 'java') add({ kind: 'wrongGame', target: src })
      else if (isMod(id)) add({ kind: 'missing', target: id, by: src })
    } else if (/but only the wrong version is present/.test(line)) {
      const dep = /of (?:mod )?(?:'[^']*' \(([\w.-]+)\)|([\w.-]+)),? but only/.exec(line)
      const id = (dep?.[1] || dep?.[2] || '').toLowerCase()
      if (id === 'minecraft') add({ kind: 'wrongGame', target: src })
      else if (id === 'fabricloader' || id === 'quilt_loader') add({ kind: 'loader', target: id, by: src })
      else if (id === 'java') add({ kind: 'java', target: 'java', need: Number((/requires version (\d+)/.exec(line) || [])[1]) || 0 })
      else if (isMod(id)) { add({ kind: 'outdated', target: id, by: src }) }
    } else if (/is incompatible with/.test(line)) {
      add({ kind: 'conflict', target: src })
    } else if (/is (?:a )?duplicate|duplicat/i.test(line)) {
      add({ kind: 'duplicate', target: src })
    }
  }

  // Forge / NeoForge: недостающие или неподходящие зависимости
  for (const m of text.matchAll(/Mod ID: '([\w.-]+)', Requested by: '([\w.-]+)', Expected range: '([^']*)', Actual version: '([^']*)'/g)) {
    const id = m[1].toLowerCase()
    if (id === 'minecraft') add({ kind: 'wrongGame', target: m[2].toLowerCase() })
    else if (id === 'forge' || id === 'neoforge') add({ kind: 'loader', target: id, by: m[2].toLowerCase() })
    else if (/MISSING/i.test(m[4])) add({ kind: 'missing', target: id, by: m[2].toLowerCase() })
    else add({ kind: 'outdated', target: id, by: m[2].toLowerCase() })
  }
  for (const m of text.matchAll(/Mod (?:File|file): (?:[^\n]*[\\/])?([^\\/\n]+\.jar)/g)) add({ kind: 'crashFile', target: m[1].trim() })
  for (const m of text.matchAll(/Caught exception from (?:[^\n(]+) \(([\w.-]+)\)/g)) add({ kind: 'crash', target: m[1].toLowerCase() })
  for (const m of text.matchAll(/Found duplicate mods?[^\n]*\n((?:\s*Mod ID: '[^']+'[^\n]*\n?)+)/g)) for (const d of m[1].matchAll(/Mod ID: '([\w.-]+)'/g)) add({ kind: 'duplicate', target: d[1].toLowerCase() })

  // crash-report: «Suspected Mod(s)»
  const sus = /Suspected Mods?(?:\(s\))?:\s*\n((?:[ \t]+[^\n]+\n?)+)/.exec(text)
  if (sus) for (const m of sus[1].matchAll(/\(([\w.-]+)\)/g)) if (isMod(m[1].toLowerCase())) add({ kind: 'crash', target: m[1].toLowerCase() })
  for (const m of text.matchAll(/Mixin apply for mod ([\w.-]+) failed/g)) add({ kind: 'crash', target: m[1].toLowerCase() })
  // строки WARN/INFO вида «@Mixin target … was not found … from mod X» безобидны — учитываем только ошибки
  for (const line of text.split(/\r?\n/)) {
    if (/\/(WARN|INFO|DEBUG)\]|was not found|Skipping/.test(line)) continue
    const m = /\.mixins?\.json:[\w.$]+ from mod ([\w.-]+)/.exec(line)
    if (m && isMod(m[1].toLowerCase())) add({ kind: 'crash', target: m[1].toLowerCase() })
  }

  // Java
  const cv = /UnsupportedClassVersionError[^\n]*class file version (\d+)/.exec(text)
  if (cv) add({ kind: 'java', target: 'java', need: Number(cv[1]) - 44 })
  if (/java\.lang\.OutOfMemoryError|Could not reserve enough space/.test(text)) add({ kind: 'memory', target: 'memory' })
  if (/Pixel format not accelerated|GLFW error 65542|WGL: The driver does not appear to support OpenGL|No OpenGL context/.test(text)) add({ kind: 'driver', target: 'gpu' })

  // запасной вариант: какой jar мода чаще всего встречается в стектрейсе
  if (!problems.some(p => ['missing', 'outdated', 'conflict', 'crash', 'crashFile', 'wrongGame', 'duplicate'].includes(p.kind))) {
    const counts = {}
    for (const m of text.matchAll(/[~\[]\[?([^\[\]\s:/\\]+\.jar)[:\]]/g)) {
      const f = m[1]
      if (/^(minecraft|client|fabric-loader|intermediary|forge|neoforge|fmlloader|fmlcore|javafmllanguage|securejarhandler|modlauncher|mixin|sponge-mixin|java|lwjgl|netty|guava|datafixerupper|authlib|brigadier|log4j|slf4j|gson|jopt|oshi|icu4j|night-config)/i.test(f)) continue
      counts[f] = (counts[f] || 0) + 1
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    if (top && top[1] >= 2) add({ kind: 'crashFile', target: top[0], guess: true })
  }
  // самая точная причина для мода — первой (иначе «не та версия игры» потеряется за «неподходящей версией»)
  const RANK = { missing: 0, java: 0, memory: 0, loader: 1, wrongGame: 2, duplicate: 3, conflict: 4, outdated: 5, crash: 6, crashFile: 7, driver: 8 }
  return problems.sort((a, b) => (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9))
}

// ---------- превращение в понятные проблемы с вариантами починки ----------
async function diagnose(instId, { logs, since } = {}) {
  const inst = instances.get(instId)
  const { text, crashFile } = gatherText(instId, logs, since)
  if (!text.trim()) return { problems: [], crashFile }
  const idx = await modIndex(instId)
  const raw = analyzeText(text, idx, inst)
  // стек из crash-report (если он есть) точнее всех остальных признаков
  let st = null
  try { st = analyzeStack(crashFile ? fs.readFileSync(crashFile, 'utf8') : text) } catch {}
  const culprit = st && (ownerOfClass(idx, st.cls) || (st.mixinMod && idx.byId.get(st.mixinMod.toLowerCase())))
  if (culprit && !raw.some(p => ['missing', 'wrongGame', 'loader', 'java'].includes(p.kind))) {
    const other = ownerOfClass(idx, st.missingCls)
    // «упоминания в отчёте» — лишь догадки, когда виновник уже ясен
    for (let i = raw.length - 1; i >= 0; i--) if (['crash', 'crashFile'].includes(raw[i].kind)) raw.splice(i, 1)
    raw.unshift({ kind: 'stack', mod: culprit, other: other && other !== culprit ? other : null, exc: st.exc })
  } else if (st?.cls && !raw.some(p => !['crash', 'crashFile'].includes(p.kind))) {
    // виновный код известен, но такого мода в сборке нет (уже удалён) — не сваливаем вину на случайный мод
    for (let i = raw.length - 1; i >= 0; i--) if (raw[i].guess) raw.splice(i, 1)
    if (!raw.length) raw.push({ kind: 'gone', pkg: st.cls.split('.').slice(0, -1).join('.'), exc: st.exc })
  }

  let updates = {}
  const needUpdates = raw.some(p => ['stack', 'outdated', 'wrongGame', 'crash', 'crashFile', 'conflict'].includes(p.kind))
  if (needUpdates) { try { updates = await modrinth.checkUpdates(instId) } catch (e) { console.warn('doctor updates', e.message) } }

  const modOf = p => p.kind === 'stack' ? p.mod : p.kind === 'crashFile'
    ? idx.mods.find(m => m.enabled && (m.name === p.target || m.file === p.target))
    : idx.byId.get(p.target)
  const out = []
  const seenMods = new Set()
  const modFixes = (mod, preferUpdate = true) => {
    const fixes = []
    const up = updates[mod.rel]
    if (up && preferUpdate) fixes.push({ id: 'update', label: tr('Обновить до {v}', { v: up.versionNumber }), rel: mod.rel, update: up })
    fixes.push({ id: 'disable', label: tr('Отключить мод'), file: mod.file })
    fixes.push({ id: 'remove', label: tr('Удалить мод'), file: mod.file })
    return fixes
  }
  const modInfo = mod => ({ name: mod.modName, file: mod.file, icon: mod.icon || '', version: mod.modVersion })

  for (const p of raw) {
    if (p.kind === 'missing') {
      if (idx.byId.has(p.target)) continue // уже стоит, а ругань про другое
      const by = idx.byId.get(p.by)
      let proj = null
      try { proj = await modrinth.project(slugFor(p.target)) } catch {}
      const fixes = []
      if (proj && proj.project_type === 'mod') fixes.push({ id: 'install', label: tr('Установить «{name}»', { name: proj.title }), projectId: proj.id })
      if (by) fixes.push({ id: 'disable', label: tr('Отключить «{name}»', { name: by.modName }), file: by.file })
      out.push({
        kind: 'missing', severity: 'error',
        title: tr('Не хватает мода «{name}»', { name: proj?.title || p.target }),
        detail: by ? tr('Он нужен моду «{name}».', { name: by.modName }) : tr('Он нужен одному из модов сборки.'),
        icon: proj?.icon_url || '', fixes,
      })
      continue
    }
    if (p.kind === 'java') {
      const need = p.need || 0
      out.push({ kind: 'java', severity: 'error', title: need ? tr('Нужна Java {v}', { v: need }) : tr('Неподходящая версия Java'),
        detail: tr('Один из модов собран под более новую Java, чем та, на которой запускалась игра.'),
        fixes: need ? [{ id: 'java', label: tr('Запускать на Java {v}', { v: need }), major: need }] : [] })
      continue
    }
    if (p.kind === 'memory') {
      const cur = (inst.settings?.memory?.max) || require('./store').getSettings().memory.max
      const total = Math.floor(os.totalmem() / 1048576)
      const next = Math.min(Math.max(cur + 2048, Math.round(cur * 1.5 / 512) * 512), Math.floor(total * 0.6 / 512) * 512)
      out.push({ kind: 'memory', severity: 'error', title: tr('Игре не хватило памяти'), detail: tr('Сейчас выделено {a} МБ.', { a: cur }),
        fixes: next > cur ? [{ id: 'memory', label: tr('Выделить {n} ГБ', { n: (next / 1024).toFixed(1).replace(/\.0$/, '') }), max: next }] : [] })
      continue
    }
    if (p.kind === 'gone') {
      out.push({ kind: 'gone', severity: 'warn', title: tr('Ошибка в коде «{pkg}»', { pkg: p.pkg }), detail: tr('Игра упала с ошибкой {exc} в моде, которого сейчас нет в сборке. Если вы его уже удалили или отключили — просто запустите игру снова.', { exc: p.exc }), fixes: [] })
      continue
    }
    if (p.kind === 'driver') {
      out.push({ kind: 'driver', severity: 'warn', title: tr('Проблема с видеодрайвером'), detail: tr('Игра не смогла создать окно OpenGL. Обновите драйвер видеокарты с сайта NVIDIA, AMD или Intel.'), fixes: [] })
      continue
    }
    if (p.kind === 'loader') {
      let latest = null
      try { latest = (await versions.getLoaderVersions(inst.loader, inst.mcVersion)).find(v => v.stable) || null } catch {}
      const by = idx.byId.get(p.by)
      const fixes = []
      if (latest && latest.id !== inst.loaderVersion) fixes.push({ id: 'loader', label: tr('Обновить {loader} до {v}', { loader: inst.loader, v: latest.id }), version: latest.id })
      if (by) fixes.push({ id: 'disable', label: tr('Отключить «{name}»', { name: by.modName }), file: by.file })
      out.push({ kind: 'loader', severity: 'error', title: tr('Загрузчик {loader} устарел', { loader: inst.loader }),
        detail: by ? tr('Мод «{name}» требует более новую версию загрузчика.', { name: by.modName }) : tr('Одному из модов нужна более новая версия загрузчика.'), fixes })
      continue
    }
    const mod = modOf(p)
    if (!mod || seenMods.has(mod.file)) continue
    seenMods.add(mod.file)
    if (p.kind === 'stack') {
      const fixes = modFixes(mod)
      const upOther = p.other && updates[p.other.rel]
      if (upOther) fixes.splice(fixes[0].id === 'update' ? 1 : 0, 0, { id: 'update', label: tr('Обновить «{name}» до {v}', { name: p.other.modName, v: upOther.versionNumber }), rel: p.other.rel, update: upOther })
      out.push({
        kind: 'stack', severity: 'error', title: tr('Игра упала из-за «{name}»', { name: mod.modName }),
        detail: p.other
          ? tr('«{name}» не совместим с установленной версией «{other}»: обращается к тому, чего в ней нет ({exc}). Обновите один из модов или отключите «{name}».', { name: mod.modName, other: p.other.modName, exc: p.exc })
          : tr('Ошибка {exc} произошла в коде этого мода.', { exc: p.exc }),
        mod: modInfo(mod), fixes,
      })
      continue
    }
    const by = p.by && idx.byId.get(p.by)
    const T = {
      outdated: [tr('«{name}» — неподходящая версия', { name: mod.modName }), by ? tr('Мод «{by}» требует другую версию этого мода.', { by: by.modName }) : tr('Другим модам нужна другая версия этого мода.')],
      wrongGame: [tr('«{name}» не для этой версии игры', { name: mod.modName }), tr('Мод рассчитан на другую версию Minecraft, а в сборке {v}.', { v: inst.mcVersion })],
      conflict: [tr('«{name}» конфликтует с другими модами', { name: mod.modName }), tr('Загрузчик советует убрать этот мод.')],
      duplicate: [tr('«{name}» установлен дважды', { name: mod.modName }), tr('В папке mods несколько копий одного мода.')],
      crash: [tr('Игра упала из-за «{name}»', { name: mod.modName }), tr('Этот мод указан в отчёте о вылете.')],
      crashFile: [tr('Игра упала из-за «{name}»', { name: mod.modName }), p.guess ? tr('Этот мод чаще других встречается в ошибке — скорее всего, дело в нём.') : tr('Этот мод указан в отчёте о вылете.')],
    }[p.kind] || [mod.modName, '']
    out.push({ kind: p.kind, severity: p.guess ? 'warn' : 'error', title: T[0], detail: T[1], mod: modInfo(mod), fixes: modFixes(mod) })
  }
  return { problems: out, crashFile }
}

// ---------- применение выбранных исправлений ----------
async function applyFixes(instId, fixes, ui) {
  const done = []
  const total = fixes.length || 1
  let i = 0
  for (const f of fixes) {
    ui?.update(i++ / total, f.label)
    const dir = path.join(instances.dirOf(instId), 'mods')
    switch (f.id) {
      case 'install': await modrinth.installProject(instId, f.projectId, {}, ui); break
      case 'update': await modrinth.applyUpdates(instId, { [f.rel]: f.update }); break
      case 'disable': if (fs.existsSync(path.join(dir, f.file)) && !f.file.endsWith('.disabled')) instances.toggleContent(instId, 'mod', f.file); break
      case 'remove': if (fs.existsSync(path.join(dir, f.file))) await instances.removeContent(instId, 'mod', f.file); break
      case 'java': {
        const inst = instances.get(instId)
        instances.update(instId, { javaMajor: f.major, settings: { ...(inst.settings || {}), javaPath: '' } })
        break
      }
      case 'memory': {
        const inst = instances.get(instId)
        const s = require('./store').getSettings()
        const mem = { ...(inst.settings?.memory || s.memory), max: f.max }
        instances.update(instId, { settings: { ...(inst.settings || {}), memory: mem } })
        break
      }
      case 'loader': {
        instances.update(instId, { loaderVersion: f.version, installed: false })
        await require('./installer').installRuntime(instId, ui)
        break
      }
    }
    done.push(f.id)
  }
  ui?.update(1, tr('Готово'))
  return done
}

module.exports = { diagnose, applyFixes, analyzeText, analyzeStack, ownerOfClass, readJarMeta }
