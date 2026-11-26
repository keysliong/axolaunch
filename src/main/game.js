// Запуск игры и отслеживание процессов
const { t: tr } = require('./i18n')
const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const { launch, Version } = require('@xmcl/core')
const { P, getSettings, updateStats } = require('./store')
const instances = require('./instances')
const accounts = require('./accounts')
const { installRuntimeTask, isRuntimeReady } = require('./installer')
const { ensureJava } = require('./java')
const { runTask } = require('./tasks')
const { EventEmitter } = require('events')

const bus = new EventEmitter()
const running = new Map()
const last = new Map() // id сборки → { logs, start } последнего запуска (для «доктора» после вылета)

function splitArgs(str) {
  const out = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m
  while ((m = re.exec(str || ''))) out.push(m[1] ?? m[2] ?? m[3])
  return out
}
function parseEnv(str) {
  const env = {}
  for (const line of String(str || '').split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return env
}
function runHook(cmd, cwd, env) {
  if (!cmd) return Promise.resolve()
  return new Promise(resolve => exec(cmd, { cwd, env, windowsHide: true }, () => resolve()))
}

/** Minecraft пишет логи в XML (log4j XMLLayout) — превращаем в обычные строки */
function log4jParser() {
  let buf = ''
  const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  return text => {
    buf += text
    const out = []
    for (;;) {
      const start = buf.indexOf('<log4j:Event')
      if (start === -1) {
        // нет XML: отдаём завершённые строки
        const nl = buf.lastIndexOf('\n')
        if (nl === -1) break
        out.push(...buf.slice(0, nl).split(/\r?\n/).filter(l => l.trim()))
        buf = buf.slice(nl + 1)
        break
      }
      if (start > 0) {
        out.push(...buf.slice(0, start).split(/\r?\n/).filter(l => l.trim()))
        buf = buf.slice(start)
      }
      const end = buf.indexOf('</log4j:Event>')
      if (end === -1) break
      const ev = buf.slice(0, end + 14)
      buf = buf.slice(end + 14)
      const attr = n => (new RegExp(`${n}="([^"]*)"`).exec(ev) || [])[1] || ''
      const msg = (/<log4j:Message><!\[CDATA\[([\s\S]*?)\]\]><\/log4j:Message>/.exec(ev) || [])[1] ?? unxml((/<log4j:Message>([\s\S]*?)<\/log4j:Message>/.exec(ev) || [])[1] || '')
      const thr = (/<log4j:Throwable><!\[CDATA\[([\s\S]*?)\]\]><\/log4j:Throwable>/.exec(ev) || [])[1]
      const time = new Date(Number(attr('timestamp'))).toTimeString().slice(0, 8)
      const head = `[${time}] [${unxml(attr('thread'))}/${attr('level')}]`
      msg.split(/\r?\n/).forEach((l, i) => out.push(i ? l : `${head}: ${l}`))
      if (thr) out.push(...thr.split(/\r?\n/).filter(Boolean))
    }
    return out
  }
}

/**
 * Minecraft 26.x+ (новый формат Mojang): jar'ы natives-* лежат в classpath, а LWJGL сам
 * распаковывает из них .dll в ${natives_directory}/lwjgl. xmcl 2.x считает их «старыми» нативами —
 * убирает из classpath и распаковывает в корень папки natives, после чего игра падает с
 * «Failed to locate library: lwjgl.dll». Возвращаем такие jar в classpath, как официальный лаунчер.
 */
async function modernNativeJars(versionId) {
  try {
    const v = await Version.parse(P.meta, versionId)
    const jvm = JSON.stringify(v.arguments?.jvm || [])
    if (!jvm.includes('${natives_directory}/')) return [] // старый формат — пусть xmcl распаковывает как обычно
    const archOk = name => {
      const c = name.split(':')[3] || ''
      if (/arm64|aarch64/.test(c)) return process.arch === 'arm64'
      if (/x86(?!_64)|32/.test(c)) return process.arch === 'ia32'
      return true
    }
    return v.libraries
      .filter(l => l.isNative && l.download?.path && archOk(l.name))
      .map(l => path.join(P.meta, 'libraries', l.download.path))
      .filter(f => fs.existsSync(f))
  } catch (e) {
    console.warn('natives', e.message)
    return []
  }
}

// Ошибки загрузки, после которых игра уже не запустится (загрузчик показывает своё окно и ждёт)
const FATAL = /Incompatible mods found!|Some of your mods are incompatible|A mod crashed on startup|Mod loading has failed|Missing or unsupported mandatory dependencies|LoadingFailedException|Failed to load mods|ModResolutionException|Could not execute entrypoint stage|---- Minecraft Crash Report ----/

// Windows: убиваем всё дерево процессов (Fabric показывает ошибку в отдельном JVM-процессе)
function killTree(proc) {
  if (process.platform === 'win32' && proc.pid) exec(`taskkill /pid ${proc.pid} /T /F`, { windowsHide: true }, () => {})
  else try { proc.kill() } catch {}
}

function unlock(key) {
  let fresh = false
  updateStats(s => { if (!s.achievements[key]) { s.achievements[key] = Date.now(); fresh = true } })
  if (fresh) bus.emit('achievement', key)
}

async function play(instId, { server } = {}) {
  if (running.has(instId)) throw new Error(tr('Сборка уже запущена'))
  let inst = instances.get(instId)
  if (!isRuntimeReady(inst)) inst = await installRuntimeTask(instId, tr('Установка «{name}»', { name: inst.name }))

  const acc = await accounts.getForLaunch()
  if (!acc) throw new Error(tr('Сначала добавьте аккаунт (иконка внизу слева)'))

  const s = getSettings()
  const is = inst.settings || {}
  const java = is.javaPath || await runTask(`Java ${inst.javaMajor || 8}`, t => ensureJava(inst.javaMajor || 8, t))
  const mem = is.memory || s.memory
  const win = is.window || s.window
  const hooks = is.hooks || s.hooks || {}
  const env = { ...process.env, ...parseEnv(is.env) }
  const cwd = instances.dirOf(instId)

  await runHook(hooks.pre, cwd, env)

  const proc = await launch({
    extraClassPaths: await modernNativeJars(inst.versionId),
    gamePath: cwd,
    resourcePath: P.meta,
    javaPath: java,
    version: inst.versionId,
    gameProfile: { name: acc.name, id: acc.id },
    accessToken: acc.accessToken,
    userType: acc.userType,
    minMemory: mem.min,
    maxMemory: mem.max,
    extraJVMArgs: ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8', ...splitArgs(is.jvmArgs || s.jvmArgs)],
    resolution: win.fullscreen ? { fullscreen: true } : { width: win.width, height: win.height },
    launcherName: 'Axolaunch',
    launcherBrand: 'Axolaunch',
    server: server ? { ip: server.split(':')[0], port: Number(server.split(':')[1]) || 25565 } : undefined,
    extraExecOption: { env, windowsHide: false },
  })

  const start = Date.now()
  const state = { proc, start, logs: [], pending: [] }
  running.set(instId, state)
  instances.update(instId, { lastPlayed: start })
  updateStats(st => { st.launches = (st.launches || 0) + 1 })
  unlock('first_launch')
  const h = new Date().getHours()
  if (h >= 0 && h < 5) unlock('night_owl')

  const parser = log4jParser()
  const onData = chunk => {
    const lines = parser(chunk.toString('utf8'))
    state.logs.push(...lines)
    if (state.logs.length > 5000) state.logs.splice(0, state.logs.length - 5000)
    state.pending.push(...lines)
    if (!state.fatal && lines.some(l => FATAL.test(l))) { state.fatal = true; setTimeout(() => bus.emit('fatal', { id: instId }), 1500) }
  }
  proc.stdout?.on('data', onData)
  proc.stderr?.on('data', onData)
  const flush = setInterval(() => {
    if (state.pending.length) { bus.emit('log', { id: instId, lines: state.pending.splice(0) }) }
  }, 250)

  bus.emit('state', runningList())
  proc.on('exit', async code => {
    clearInterval(flush)
    if (state.pending.length) bus.emit('log', { id: instId, lines: state.pending.splice(0) })
    running.delete(instId)
    last.set(instId, { logs: state.logs, start })
    const elapsed = Date.now() - start
    const cur = instances.get(instId)
    instances.update(instId, { playtime: (cur.playtime || 0) + elapsed })
    updateStats(st => { st.playtime = (st.playtime || 0) + elapsed })
    if (elapsed > 2 * 3600e3) unlock('marathon')
    const crashed = state.fatal || (code !== 0 && code !== null && !state.killed)
    if (crashed) unlock('crash')
    bus.emit('exit', { id: instId, code, crashed, elapsed, fatal: !!state.fatal })
    bus.emit('state', runningList())
    await runHook(hooks.post, cwd, env)
  })
  return { pid: proc.pid, onLaunch: s.onLaunch }
}

function kill(instId) {
  const st = running.get(instId)
  if (!st) return
  st.killed = true
  killTree(st.proc)
}

const runningList = () => [...running.entries()].map(([id, s]) => ({ id, start: s.start, pid: s.proc.pid }))
const logs = id => running.get(id)?.logs || last.get(id)?.logs || []
const lastRun = id => running.has(id) ? { logs: running.get(id).logs, start: running.get(id).start } : (last.get(id) || null)
/** Остановить игру и дождаться выхода (перед починкой: Windows не даёт трогать открытые jar) */
function stop(instId) {
  const st = running.get(instId)
  if (!st) return Promise.resolve()
  return new Promise(resolve => {
    const done = setTimeout(resolve, 8000)
    st.proc.once('exit', () => { clearTimeout(done); setTimeout(resolve, 500) })
    st.killed = true
    killTree(st.proc)
  })
}

module.exports = { bus, play, kill, stop, runningList, logs, lastRun, unlock }
