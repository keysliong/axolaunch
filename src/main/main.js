const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, nativeImage } = require('electron')
const { t: tr } = require('./i18n')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')

app.setName('Axolaunch')
if (process.env.AXO_DATA) app.setPath('userData', process.env.AXO_DATA) // отладка: отдельный профиль и своя блокировка
protocol.registerSchemesAsPrivileged([{ scheme: 'axo', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0) }

const store = require('./store')
const tasks = require('./tasks')
const versions = require('./versions')
const instances = require('./instances')
const installer = require('./installer')
const accounts = require('./accounts')
const modrinth = require('./modrinth')
const mrpack = require('./mrpack')
const game = require('./game')
const doctor = require('./doctor')
const curseforge = require('./curseforge')
const java = require('./java')

let win = null
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data) }

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 980, minHeight: 640,
    frame: false, backgroundColor: '#0f0d14', show: false,
    icon: path.join(__dirname, '..', '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  })
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  win.once('ready-to-show', () => win.show())
  // отладка: AXO_SHOT=путь.png [AXO_JS=код] — снимок окна после загрузки
  if (process.env.AXO_SHOT) {
    win.webContents.on('console-message', (e) => console.log('[renderer]', e.message ?? ''))
    win.webContents.once('did-finish-load', async () => {
      await new Promise(r => setTimeout(r, 2500))
      if (process.env.AXO_JS) { try { await win.webContents.executeJavaScript(process.env.AXO_JS) } catch (e) { console.log('js error', e.message) } }
      await new Promise(r => setTimeout(r, Number(process.env.AXO_WAIT || 3500)))
      const img = await win.webContents.capturePage()
      fs.writeFileSync(process.env.AXO_SHOT, img.toPNG())
      if (!process.env.AXO_KEEP) app.quit()
    })
  }
  win.on('maximize', () => send('window:state', { maximized: true }))
  win.on('unmaximize', () => send('window:state', { maximized: false }))
  // внешние ссылки — в системный браузер
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url) } })
}

function fileArg(argv) {
  return argv.find(a => /\.mrpack$/i.test(a) && fs.existsSync(a))
}
app.on('second-instance', (_, argv) => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  const f = fileArg(argv); if (f) send('open-file', f)
})

tasks.bus.on('update', list => send('tasks:update', list))
game.bus.on('log', d => send('game:log', d))
game.bus.on('exit', d => { send('game:exit', d); if (win && store.getSettings().onLaunch === 'minimize') win.restore() })
game.bus.on('state', d => send('game:state', d))
game.bus.on('fatal', d => send('game:fatal', d))
game.bus.on('achievement', k => send('achievement', k))

function checkCollector() {
  if (instances.list().length >= 5) game.unlock('collector')
  const s = store.getStats()
  if ((s.modsInstalled || 0) >= 10) game.unlock('modder')
  if ((s.modsInstalled || 0) >= 100) game.unlock('hoarder')
}

async function createAndInstall(opts) {
  const inst = instances.create(opts)
  checkCollector()
  installer.installRuntimeTask(inst.id, tr('Установка «{name}»', { name: inst.name })).catch(() => {})
  return inst
}

const API = {
  // окно и приложение
  'app:info': () => ({ version: app.getVersion(), dataDir: store.P.root, platform: process.platform, electron: process.versions.electron }),
  'app:minimize': () => win.minimize(),
  'app:maximize': () => (win.isMaximized() ? win.unmaximize() : win.maximize()),
  'app:close': () => win.close(),
  'app:openExternal': url => { if (/^https?:\/\//.test(url)) shell.openExternal(url) },
  'app:openData': () => shell.openPath(store.P.root),
  'app:pendingFile': () => fileArg(process.argv) || null,

  'settings:get': () => store.getSettings(),
  'settings:set': patch => store.setSettings(patch),
  'settings:reset': () => store.setSettings(store.DEFAULT_SETTINGS),
  'app:setIcon': dataUrl => {
    if (win && !win.isDestroyed() && /^data:image\/png;base64,/.test(dataUrl)) win.setIcon(nativeImage.createFromDataURL(dataUrl))
    return true
  },
  'settings:pickBackground': async () => {
    const r = await dialog.showOpenDialog(win, { filters: [{ name: tr('Изображения'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }], properties: ['openFile'] })
    if (r.canceled) return null
    const ext = path.extname(r.filePaths[0])
    const dest = path.join(store.P.root, 'background' + ext)
    for (const f of fs.readdirSync(store.P.root)) if (/^background\./.test(f)) fs.rmSync(path.join(store.P.root, f))
    fs.copyFileSync(r.filePaths[0], dest)
    return store.setSettings({ background: `axo://data/background${ext}?${Date.now()}` })
  },
  'stats:get': () => store.getStats(),
  'stats:unlock': key => { if (/^[a-z_]+$/.test(key)) game.unlock(key); return store.getStats() },

  'versions:minecraft': () => versions.getMinecraftVersions(),
  'versions:loaderGames': loader => versions.getLoaderGameVersions(loader),
  'versions:loader': (loader, mc) => versions.getLoaderVersions(loader, mc),

  'instances:list': () => instances.list(),
  'instances:get': id => instances.get(id),
  'instances:create': opts => createAndInstall(opts),
  'instances:update': (id, patch) => {
    const before = instances.get(id)
    const versionChanged = ['mcVersion', 'loader', 'loaderVersion'].some(k => k in patch && patch[k] !== before[k])
    const r = instances.update(id, versionChanged ? { ...patch, installed: false } : patch)
    if (versionChanged) installer.installRuntimeTask(id, tr('Переустановка «{name}»', { name: r.name }), { restart: true }).catch(() => {})
    return r
  },
  'instances:repair': id => installer.installRuntimeTask(id, tr('Восстановление «{name}»', { name: instances.get(id).name })),
  'instances:remove': id => instances.remove(id),
  'instances:duplicate': id => instances.duplicate(id),
  'instances:pickIcon': async id => {
    const r = await dialog.showOpenDialog(win, { filters: [{ name: tr('Изображения'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }], properties: ['openFile'] })
    return r.canceled ? null : instances.setIcon(id, r.filePaths[0])
  },
  'instances:content': (id, type) => instances.listContent(id, type),
  'instances:toggle': (id, type, file) => instances.toggleContent(id, type, file),
  'instances:removeContent': (id, type, file) => instances.removeContent(id, type, file),
  'instances:addFiles': async (id, type, paths) => {
    if (!paths) {
      const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: tr('Файлы'), extensions: ['jar', 'zip', 'disabled'] }] })
      if (r.canceled) return
      paths = r.filePaths
    }
    instances.addLocalFiles(id, type, paths)
    modrinth.identifyContent(id).catch(() => {})
  },
  'instances:worlds': id => instances.listWorlds(id),
  'instances:screenshots': id => instances.listScreenshots(id),
  'instances:tree': id => instances.listTree(id),
  'instances:openFolder': (id, sub = '') => {
    const p = path.join(instances.dirOf(id), sub)
    fs.mkdirSync(p, { recursive: true })
    return shell.openPath(p)
  },
  'instances:readLog': id => {
    const f = path.join(instances.dirOf(id), 'logs', 'latest.log')
    if (!fs.existsSync(f)) return ''
    const buf = fs.readFileSync(f)
    let text = new TextDecoder('utf-8').decode(buf)
    if (text.includes('�')) text = new TextDecoder('windows-1251').decode(buf) // старые логи в кодировке системы
    return text.slice(-200000)
  },

  'game:play': async (id, opts) => {
    const r = await game.play(id, opts)
    if (r.onLaunch === 'minimize') win.minimize()
    if (r.onLaunch === 'close') setTimeout(() => app.quit(), 1500)
    return r
  },
  'game:kill': id => game.kill(id),
  'doctor:diagnose': id => { const r = game.lastRun(id); return doctor.diagnose(id, { logs: r?.logs, since: r?.start }) },
  'doctor:fix': (id, fixes) => tasks.runTask(tr('Починка «{name}»', { name: instances.get(id).name }), async t => { await game.stop(id); return doctor.applyFixes(id, fixes, t) }, { instance: id }),
  'game:running': () => game.runningList(),
  'game:logs': id => game.logs(id),

  'accounts:list': () => accounts.publicList(),
  'accounts:addOffline': name => accounts.addOffline(name),
  'accounts:addMicrosoft': () => accounts.addMicrosoft(),
  'accounts:remove': id => accounts.remove(id),
  'accounts:setActive': id => accounts.setActive(id),

  'modrinth:search': q => modrinth.search(q),
  'modrinth:project': id => String(id).startsWith('cf:') ? curseforge.project(id) : modrinth.project(id),
  'cf:hasKey': () => curseforge.hasKey(),
  'cf:search': q => curseforge.search(q),
  'modrinth:members': id => modrinth.members(id),
  'modrinth:versions': (id, f) => modrinth.projectVersions(id, f),
  'modrinth:tags': () => modrinth.tags(),
  'modrinth:random': () => modrinth.random(),
  'modrinth:install': async (instId, projectId, opts = {}) => {
    const cfId = String(projectId).startsWith('cf:')
    const proj = cfId ? await curseforge.project(projectId) : await modrinth.project(projectId)
    const r = await tasks.runTask(tr('Установка {name}', { name: proj.title }), t => cfId ? curseforge.installProject(instId, projectId, opts, t) : modrinth.installProject(instId, projectId, opts, t))
    checkCollector()
    return r
  },
  'modrinth:installModpack': async (projectId, versionId) => {
    const proj = await modrinth.project(projectId)
    const inst = await tasks.runTask(tr('Сборка {name}', { name: proj.title }), t => mrpack.installModpack(projectId, versionId, t))
    game.unlock('packer'); checkCollector()
    installer.installRuntimeTask(inst.id, tr('Установка «{name}»', { name: inst.name })).catch(() => {})
    return inst
  },
  'modrinth:identify': id => modrinth.identifyContent(id),
  'modrinth:checkUpdates': id => modrinth.checkUpdates(id),
  'modrinth:applyUpdates': (id, updates) => tasks.runTask(tr('Обновление контента'), t => modrinth.applyUpdates(id, updates, t)),

  'mrpack:import': async filePath => {
    if (!filePath) {
      const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Modrinth Modpack', extensions: ['mrpack'] }], properties: ['openFile'] })
      if (r.canceled) return null
      filePath = r.filePaths[0]
    }
    const inst = await tasks.runTask(tr('Импорт {name}', { name: path.basename(filePath) }), t => mrpack.importMrpack(filePath, t))
    game.unlock('packer'); checkCollector()
    installer.installRuntimeTask(inst.id, tr('Установка «{name}»', { name: inst.name })).catch(() => {})
    return inst
  },
  'mrpack:export': async (id, opts) => {
    const inst = instances.get(id)
    const r = await dialog.showSaveDialog(win, { defaultPath: `${instances.slug(opts.name || inst.name)}-${opts.version || '1.0.0'}.mrpack`, filters: [{ name: 'Modrinth Modpack', extensions: ['mrpack'] }] })
    if (r.canceled) return null
    const res = await tasks.runTask(tr('Экспорт «{name}»', { name: inst.name }), t => mrpack.exportMrpack(id, { ...opts, dest: r.filePath }, t))
    game.unlock('exporter')
    shell.showItemInFolder(r.filePath)
    return res
  },

  'java:list': () => java.installedJavas(),
  'java:test': p => java.javaVersion(p),
  'java:pick': async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : [] })
    return r.canceled ? null : r.filePaths[0]
  },
  'java:install': major => tasks.runTask(`Java ${major}`, t => java.ensureJava(Number(major), t)),

  'tasks:list': () => tasks.list(),
  'tasks:cancel': id => tasks.cancel(id),
  'tasks:cancelFor': instId => tasks.cancelFor(instId),
}

ipcMain.handle('call', async (_, name, ...args) => {
  const fn = API[name]
  if (!fn) return { ok: false, error: 'Unknown API ' + name }
  try { return { ok: true, value: await fn(...args) } } catch (e) {
    if (tasks.isCancel(e)) return { ok: false, error: e.message, cancelled: true }
    console.error(name, e)
    return { ok: false, error: e?.message || String(e) }
  }
})

app.whenReady().then(() => {
  // axo://inst/<id>/<path> — файлы сборок; axo://data/<path> — данные лаунчера
  protocol.handle('axo', req => {
    const u = new URL(req.url)
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '')
    let base
    if (u.host === 'data') base = store.P.root
    else if (u.host === 'inst') base = store.P.instances
    else return new Response('not found', { status: 404 })
    const full = path.resolve(base, rel)
    if (!full.startsWith(path.resolve(base) + path.sep) || !fs.existsSync(full)) return new Response('not found', { status: 404 })
    return net.fetch(pathToFileURL(full).toString())
  })
  createWindow()
})
app.on('window-all-closed', () => app.quit())
