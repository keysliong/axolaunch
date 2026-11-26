// Точка входа интерфейса Axolaunch
import { $, call, esc, icon, on, toast, errToast, instIcon, setSounds, sound, fmtTime, t } from './ui.js'
import { setLang } from './i18n.js'
import { state, navigate, goBack, goForward, render, setChromeRenderer, refreshInstances, refreshAccounts, activeAccount, isRunning } from './core.js'
import { applyTheme } from './themes.js'
import { railLogo } from './logo.js'
import { openDoctor } from './doctor.js'
import { mountPet, setupKonami, showAchievement } from './fun.js'
import { play, openCreate, accountMenu, importMrpack, installInto } from './actions.js'
import './views/home.js'
import './views/library.js'
import './views/discover.js'
import './views/project.js'
import './views/instance.js'
import './views/settings.js'

const TITLES = () => ({ home: t('Главная'), library: t('Библиотека'), discover: t('Каталог'), project: t('Проект'), instance: t('Сборка'), settings: t('Настройки') })

function renderRail() {
  const r = state.route.name
  const recent = state.instances.slice(0, 4)
  const acc = activeAccount()
  const pet = $('#pet-slot')?.firstElementChild
  $('#rail').innerHTML = `
    <div class="rail-logo" data-nav="home" data-tip="Axolaunch">${railLogo()}</div>
    <button class="rail-btn ${r === 'home' ? 'active' : ''}" data-nav="home" data-tip="${t('Главная')}">${icon('home')}</button>
    <button class="rail-btn ${r === 'library' || r === 'instance' ? 'active' : ''}" data-nav="library" data-tip="${t('Библиотека')}">${icon('library')}</button>
    <button class="rail-btn ${r === 'discover' || r === 'project' ? 'active' : ''}" data-nav="discover" data-tip="${t('Каталог Modrinth')}">${icon('compass')}</button>
    <div class="rail-sep"></div>
    ${recent.map(i => `<button class="rail-inst ${r === 'instance' && state.route.params.id === i.id ? 'active' : ''}" data-inst="${esc(i.id)}" data-tip="${esc(i.name)}">${instIcon(i)}</button>`).join('')}
    <button class="rail-btn" data-act="create" data-tip="${t('Новая сборка')}">${icon('plus')}</button>
    <div class="rail-spacer"></div>
    <div id="pet-slot"></div>
    <div id="tasks-slot"></div>
    <button class="rail-btn ${r === 'settings' ? 'active' : ''}" data-nav="settings" data-tip="${t('Настройки')}">${icon('settings')}</button>
    <img class="rail-avatar" data-act="account" data-tip="${esc(acc ? acc.name : t('Добавить аккаунт'))}" src="${acc ? `https://mc-heads.net/avatar/${esc(acc.type === 'msa' ? acc.id : acc.name)}/40` : 'axolotl.svg'}">
  `
  if (state.settings.pet !== false) {
    if (pet) $('#pet-slot').append(pet)
    else mountPet($('#pet-slot'), state.settings, p => call('settings:set', p).then(s => state.settings = s))
  }
  renderTasksBtn()
}
function renderTasksBtn() {
  const slot = $('#tasks-slot')
  if (!slot) return
  const runningTasks = state.tasks.filter(x => x.state === 'running')
  const failed = state.tasks.some(x => x.state === 'error')
  const p = avgProgress()
  // кольцо прогресса: окружность r=20 в квадрате 44×44, длина ≈ 125.66
  const C = 2 * Math.PI * 20
  slot.innerHTML = state.tasks.length ? `<button class="rail-btn tasks-btn ${runningTasks.length ? 'busy' : ''} ${failed ? 'failed' : ''}" data-act="tasks" data-tip="${t('Загрузки')}${runningTasks.length ? ` (${runningTasks.length})` : ''}">
      ${runningTasks.length ? `<svg class="ring" viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="20"/><circle class="bar" cx="22" cy="22" r="20" stroke-dasharray="${(C * Math.max(0.02, p)).toFixed(1)} ${C.toFixed(1)}"/></svg>` : ''}
      ${icon('download')}
    </button>` : ''
}
const avgProgress = () => {
  const r = state.tasks.filter(x => x.state === 'running')
  return r.length ? r.reduce((a, x) => a + x.progress, 0) / r.length : 0
}

function renderTop() {
  const r = state.route
  let title = TITLES()[r.name] || ''
  if (r.name === 'instance') title = state.instances.find(i => i.id === r.params.id)?.name || title
  if (r.name === 'project' && r.params.title) title = r.params.title
  const run = state.running[0]
  const runInst = run && state.instances.find(i => i.id === run.id)
  $('#topbar').innerHTML = `
    <div class="crumbs">
      <button data-act="back" data-tip="${t('Назад')}" ${state.history.length ? '' : 'disabled style="opacity:.3"'}>${icon('back')}</button>
      <button data-act="fwd" data-tip="${t('Вперёд')}" ${state.forward.length ? '' : 'disabled style="opacity:.3"'}>${icon('forward')}</button>
      <span class="cur">${esc(title)}</span>
    </div>
    <div class="drag"></div>
    ${run ? `<div class="running-pill"><span class="dot"></span><span>${esc(runInst?.name || run.id)} · <span id="run-timer">${fmtTime(Date.now() - run.start)}</span></span><button data-act="kill" data-id="${esc(run.id)}">${t('Стоп')}</button></div>` : ''}
    <div class="win-ctrl">
      <button data-act="min">${icon('minus')}</button>
      <button data-act="max">${icon('square')}</button>
      <button data-act="close" class="close">${icon('x')}</button>
    </div>`
}

function renderChrome() { renderRail(); renderTop() }
setChromeRenderer(renderChrome)

// ---------- обработчики хрома ----------
on(document.body, '[data-nav]', 'click', (_, b) => { sound('click'); navigate(b.dataset.nav) })
on(document.body, '[data-inst]', 'click', (_, b) => navigate('instance', { id: b.dataset.inst }))
on(document.body, '[data-act]', 'click', (e, b) => {
  const a = b.dataset.act
  if (a === 'create') openCreate()
  else if (a === 'account') accountMenu()
  else if (a === 'back') goBack()
  else if (a === 'fwd') goForward()
  else if (a === 'min') call('app:minimize')
  else if (a === 'max') call('app:maximize')
  else if (a === 'close') call('app:close')
  else if (a === 'kill') call('game:kill', b.dataset.id)
  else if (a === 'tasks') toggleTasks()
})
on(document.body, '[data-cancel]', 'click', async (e, b) => { e.stopPropagation(); b.disabled = true; await call('tasks:cancel', b.dataset.cancel).catch(() => {}) })
$('#rail').addEventListener('contextmenu', async e => {
  const b = e.target.closest('[data-inst]')
  if (!b) return
  e.preventDefault()
  const { instanceMenu } = await import('./actions.js')
  instanceMenu(e.clientX, e.clientY, state.instances.find(i => i.id === b.dataset.inst))
})

let tasksPop = null
function renderTasksPop() {
  if (!tasksPop) return
  if (!state.tasks.length) { tasksPop.remove(); tasksPop = null; return }
  tasksPop.innerHTML = `<h3>${t('Загрузки')}</h3>${state.tasks.map(x => `
    <div class="task ${x.state}"><div class="tt">${x.state === 'done' ? icon('checkCircle', 'ok') : x.state === 'error' ? icon('alert', 'bad') : x.state === 'cancelled' ? icon('x', 'bad') : ''}<span class="grow">${esc(x.title)}</span>${x.state === 'running' ? `<button class="btn sm icon ghost" data-cancel="${x.id}" data-tip="${t('Остановить загрузку')}">${icon('x')}</button>` : ''}</div><div class="ts">${esc(x.status)}</div>
    <div class="progress"><div style="width:${Math.round(x.progress * 100)}%;${x.state === 'error' ? 'background:var(--danger)' : x.state === 'done' ? 'background:var(--success)' : x.state === 'cancelled' ? 'background:var(--text-dim)' : ''}"></div></div></div>`).join('')}`
}
function toggleTasks() {
  if (tasksPop) { tasksPop.remove(); tasksPop = null; return }
  tasksPop = document.createElement('div')
  tasksPop.className = 'tasks-pop'
  document.body.append(tasksPop)
  renderTasksPop()
  setTimeout(() => document.addEventListener('mousedown', function h(e) {
    if (!e.target.closest('.tasks-pop') && !e.target.closest('[data-act=tasks]')) { tasksPop?.remove(); tasksPop = null; document.removeEventListener('mousedown', h) }
  }), 0)
}

// ---------- события из main ----------
let lastTaskStates = {}
window.axo.on('tasks:update', list => {
  state.tasks = list
  for (const x of list) {
    const prev = lastTaskStates[x.id]
    if (prev === 'running' && x.state === 'done' && x.instance) { toast(t('Готово к игре!'), x.title, 'success', 'gamepad'); refreshInstances() }
    if (prev !== 'error' && x.state === 'error') toast(x.title, x.status, 'error')
    lastTaskStates[x.id] = x.state
  }
  renderTasksBtn()
  renderTasksPop()
  document.dispatchEvent(new CustomEvent('tasks-changed'))
})
window.axo.on('game:state', list => { state.running = list; renderTop(); document.dispatchEvent(new CustomEvent('running-changed')) })
window.axo.on('game:log', ({ id, lines }) => {
  const arr = (state.logs[id] ||= [])
  arr.push(...lines)
  if (arr.length > 5000) arr.splice(0, arr.length - 5000)
  document.dispatchEvent(new CustomEvent('game-log', { detail: { id, lines } }))
})
const doctorShown = new Set()
window.axo.on('game:fatal', ({ id }) => {
  if (doctorShown.has(id)) return
  doctorShown.add(id)
  openDoctor(id, { auto: true }).then(shown => { if (!shown) doctorShown.delete(id) })
})
window.axo.on('game:exit', ({ id, crashed, elapsed }) => {
  const inst = state.instances.find(i => i.id === id)
  if (doctorShown.delete(id)) { refreshInstances(); return }
  if (crashed) {
    // «доктор» сам ищет причину; если не нашёл — обычное уведомление
    openDoctor(id, { auto: true }).then(shown => { if (!shown) toast(t('Игра вылетела'), t('{name} — загляните во вкладку «Логи»', { name: inst?.name || id }), 'error', 'bomb') })
  }
  else toast(t('Игра закрыта'), t('{name}: сыграно {time}', { name: inst?.name || id, time: fmtTime(elapsed) }), 'info', 'power')
  refreshInstances()
})
window.axo.on('achievement', key => showAchievement(key))
window.axo.on('open-file', f => importMrpack(f))

setInterval(() => {
  const el = $('#run-timer')
  if (el && state.running[0]) el.textContent = fmtTime(Date.now() - state.running[0].start)
}, 15000)

// ---------- drag & drop ----------
document.addEventListener('dragover', e => e.preventDefault())
document.addEventListener('drop', async e => {
  e.preventDefault()
  const files = [...e.dataTransfer.files].map(f => window.axo.pathForFile(f)).filter(Boolean)
  if (!files.length) return
  const packs = files.filter(f => /\.mrpack$/i.test(f))
  for (const p of packs) await importMrpack(p)
  const jars = files.filter(f => /\.(jar|zip)$/i.test(f))
  if (jars.length) {
    const id = state.route.name === 'instance' ? state.route.params.id : null
    if (!id) return toast(t('Откройте сборку'), t('Чтобы добавить файлы, перетащите их на страницу сборки'), 'error')
    const type = state.route.params.contentType || 'mod'
    try { await call('instances:addFiles', id, type, jars); toast(t('Файлы добавлены'), t('{n} шт.', { n: jars.length }), 'success'); document.dispatchEvent(new CustomEvent('content-changed', { detail: id })) } catch (er) { errToast(er) }
  }
})

// ---------- горячие клавиши ----------
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); navigate('discover', { focus: true }) }
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); openCreate() }
  if (e.altKey && e.key === 'ArrowLeft') goBack()
  if (e.altKey && e.key === 'ArrowRight') goForward()
  if (e.key === 'F5') { e.preventDefault(); render() }
})
document.addEventListener('mouseup', e => { if (e.button === 3) goBack(); if (e.button === 4) goForward() })

// ---------- старт ----------
async function init() {
  state.settings = await call('settings:get')
  setLang(state.settings.language)
  applyTheme(state.settings)
  setSounds(state.settings.sounds !== false)
  state.stats = await call('stats:get')
  await Promise.all([refreshInstances(), refreshAccounts()])
  state.running = await call('game:running')
  state.tasks = await call('tasks:list')
  setupKonami()
  await navigate('home', {}, { replace: true })
  const pending = await call('app:pendingFile')
  if (pending) importMrpack(pending)
}
init().catch(e => { console.error(e); document.body.innerHTML = `<pre style="padding:20px;color:#f66">${esc(e.stack || e)}</pre>` })

// запасная картинка для битых изображений (inline onerror запрещён CSP)
document.addEventListener('error', e => {
  const img = e.target
  if (img.tagName === 'IMG' && !img.dataset.failed) { img.dataset.failed = '1'; img.src = 'axolotl.svg' }
}, true)
