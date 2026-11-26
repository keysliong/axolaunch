// Глобальное состояние и навигация
import { call, icon, t } from './ui.js'

export const state = {
  settings: {},
  stats: {},
  instances: [],
  accounts: { active: null, accounts: [] },
  running: [],
  tasks: [],
  route: { name: 'home', params: {} },
  history: [],
  forward: [],
  logs: {}, // id -> lines
}

const views = {}
export function registerView(name, fn) { views[name] = fn }

let renderToken = 0
let cleanup = null
let renderChrome = () => {}
export function setChromeRenderer(fn) { renderChrome = fn }
export function chrome() { renderChrome() }

export async function navigate(name, params = {}, { replace = false, back = false } = {}) {
  if (!replace && !back) { state.history.push(state.route); state.forward = [] }
  state.route = { name, params }
  await render()
}
export function goBack() {
  const prev = state.history.pop()
  if (prev) { state.forward.push(state.route); navigate(prev.name, prev.params, { back: true }) }
}
export function goForward() {
  const next = state.forward.pop()
  if (next) { state.history.push(state.route); navigate(next.name, next.params, { back: true }) }
}

export async function render() {
  const token = ++renderToken
  cleanup?.(); cleanup = null
  const view = document.getElementById('view')
  view.className = ''
  view.scrollTop = 0
  renderChrome()
  const fn = views[state.route.name]
  if (!fn) return
  view.innerHTML = '<div class="spinner"></div>'
  try {
    const el = document.createElement('div')
    el.className = 'view-enter'
    const c = await fn(el, state.route.params, () => token !== renderToken)
    if (token !== renderToken) { c?.(); return }
    view.innerHTML = ''
    view.append(el)
    cleanup = c || null
  } catch (e) {
    console.error(e)
    if (token === renderToken) view.innerHTML = `<div class="empty"><div class="big">${icon('frown')}</div><h2>${t('Что-то пошло не так')}</h2><p class="muted">${String(e.message || e).replace(/</g, '&lt;')}</p></div>`
  }
}

export async function refreshInstances() {
  state.instances = await call('instances:list')
  renderChrome()
  return state.instances
}
export async function refreshAccounts() {
  state.accounts = await call('accounts:list')
  renderChrome()
  return state.accounts
}
export async function saveSettings(patch) {
  state.settings = await call('settings:set', patch)
  return state.settings
}
export const activeAccount = () => state.accounts.accounts.find(a => a.id === state.accounts.active)
export const isRunning = id => state.running.some(r => r.id === id)
export const taskFor = id => state.tasks.find(t => t.instance === id && t.state === 'running')
