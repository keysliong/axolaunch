// Общие помощники интерфейса: иконки, модалки, тосты, контекстные меню, звуки
import { t, isEn } from './i18n.js'
import EXTRA from './icons-extra.js'
export { t } from './i18n.js'
export const $ = (s, el = document) => el.querySelector(s)
export const $$ = (s, el = document) => [...el.querySelectorAll(s)]
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export async function call(name, ...args) {
  const r = await window.axo.invoke(name, ...args)
  if (!r.ok) throw Object.assign(new Error(r.error), { cancelled: !!r.cancelled })
  return r.value
}

export function on(root, selector, event, fn) {
  root.addEventListener(event, e => {
    const t = e.target.closest(selector)
    if (!t || !root.contains(t)) return
    // клик по кнопке/ссылке внутри карточки не должен срабатывать как клик по самой карточке
    const inner = e.target.closest('button, a, input, select, textarea, label')
    if (inner && inner !== t && t.contains(inner)) return
    fn(e, t)
  })
}

const P = {
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
  library: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  play: '<path d="M6 4v16l14-8z" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  more: '<circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/><circle cx="5" cy="12" r="1.5" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  minus: '<path d="M5 12h14"/>',
  square: '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M8 16H3v5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  sparkles: '<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="16" cy="16" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="16" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="16" r="1.3" fill="currentColor"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  forward: '<path d="m9 18 6-6-6-6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  package: '<path d="m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1.2" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1.2" fill="currentColor"/><path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2c0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3a2 2 0 0 1 2-2h2.3A5.6 5.6 0 0 0 22 9.8C22 5.5 17.5 2 12 2z"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  heartFill: '<path fill="currentColor" d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h20"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor"/>',
  world: '<path d="M12 2 2 7l10 5 10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>',
  fabric: '<path d="M4 20 20 4M7 4h13v13" />',
  quilt: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="4"/><rect x="3" y="13" width="8" height="8" rx="4"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  forge: '<path d="M2 7h12l-2 4h8l2-4M8 11v4M16 11v4M5 19h14M7 15h10"/>',
  neoforge: '<path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/>',
  vanilla: '<path d="M7 20h10M12 20v-6M12 14c-4 0-7-3-7-7V4h14v3c0 4-3 7-7 7z"/>',
  achievement: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  chart: '<path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  lucky: '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>',
  ...EXTRA,
}
export const hasIcon = name => !!P[name]
export function icon(name, cls = '') {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.box}</svg>`
}

// ---------- форматирование ----------
export function fmtNum(n) {
  const u = isEn() ? ['B', 'M', 'K'] : [' млрд', ' млн', ' тыс.']
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + u[0]
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + u[1]
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + u[2]
  return String(n)
}
export function fmtTime(ms) {
  const h = Math.floor(ms / 3600e3), m = Math.floor(ms % 3600e3 / 60e3)
  if (h) return t('{h} ч {m} мин', { h, m })
  if (m) return t('{m} мин', { m })
  return ms > 0 ? t('< 1 мин') : t('0 мин')
}
export function fmtAgo(d0) {
  if (!d0) return t('никогда')
  const d = (Date.now() - new Date(d0).getTime()) / 1000
  if (d < 60) return t('только что')
  if (d < 3600) return t('{n} мин назад', { n: Math.floor(d / 60) })
  if (d < 86400) return t('{n} ч назад', { n: Math.floor(d / 3600) })
  if (d < 86400 * 30) return t('{n} дн назад', { n: Math.floor(d / 86400) })
  if (d < 86400 * 365) return t('{n} мес назад', { n: Math.floor(d / 86400 / 30) })
  return t('{n} г назад', { n: Math.floor(d / 86400 / 365) })
}
export function fmtSize(b) {
  if (b > 1048576) return (b / 1048576).toFixed(1) + t(' МБ')
  if (b > 1024) return (b / 1024).toFixed(0) + t(' КБ')
  return b + t(' Б')
}
export const LOADERS = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' }

// ---------- иконка сборки ----------
function hashHue(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360 }
export function instIcon(inst, cls = '') {
  if (inst.icon?.startsWith('file:')) return `<img class="inst-icon ${cls}" src="axo://inst/${encodeURIComponent(inst.id)}/${esc(inst.icon.slice(5))}" alt="">`
  const hue = hashHue(inst.id || inst.name)
  const bg = `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 38%))`
  if (inst.icon?.startsWith('i:')) return `<div class="inst-icon glyph ${cls}" style="background:${bg}">${icon(inst.icon.slice(2))}</div>`
  const txt = inst.icon || (inst.name || '?').trim()[0]?.toUpperCase() || '?'
  return `<div class="inst-icon ${cls}" style="background:${bg}">${esc(txt)}</div>`
}

// ---------- звуки ----------
let audio
export let soundsOn = true
export function setSounds(v) { soundsOn = v }
export function sound(kind = 'click') {
  if (!soundsOn) return
  try {
    audio ||= new AudioContext()
    const o = audio.createOscillator(), g = audio.createGain()
    const now = audio.currentTime
    const cfg = {
      click: [660, 880, 0.05, 'triangle', 0.06],
      pop: [400, 900, 0.09, 'sine', 0.12],
      success: [523, 1046, 0.18, 'triangle', 0.1],
      error: [300, 140, 0.2, 'square', 0.05],
      ach: [784, 1568, 0.35, 'triangle', 0.12],
    }[kind] || [600, 800, .05, 'sine', .05]
    o.type = cfg[3]
    o.frequency.setValueAtTime(cfg[0], now)
    o.frequency.exponentialRampToValueAtTime(cfg[1], now + cfg[2])
    g.gain.setValueAtTime(cfg[4], now)
    g.gain.exponentialRampToValueAtTime(0.0001, now + cfg[2] + 0.12)
    o.connect(g).connect(audio.destination)
    o.start(now); o.stop(now + cfg[2] + 0.15)
  } catch {}
}

// ---------- тосты ----------
export function toast(title, desc = '', kind = 'info', ic) {
  const el = document.createElement('div')
  el.className = `toast ${kind}`
  const ico = ic ?? { info: 'info', success: 'checkCircle', error: 'alert', ach: 'trophy' }[kind]
  el.innerHTML = `<div class="ic">${icon(ico)}</div><div class="grow"><div class="t">${esc(title)}</div>${desc ? `<div class="d">${esc(desc)}</div>` : ''}</div>`
  $('#toasts').append(el)
  sound(kind === 'error' ? 'error' : kind === 'ach' ? 'ach' : kind === 'success' ? 'success' : 'pop')
  const ttl = kind === 'error' ? 7000 : 4200
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260) }, ttl)
  el.onclick = () => el.remove()
}
export function errToast(e, title) { if (e?.cancelled) return; console.error(e); toast(title || t('Ошибка'),e?.message || String(e), 'error') }

// ---------- модалки ----------
export function modal({ title, body = '', foot = '', wide = false, onMount, onClose }) {
  const back = document.createElement('div')
  back.className = 'modal-back'
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}"><div class="modal-head"><h2>${esc(title)}</h2><button class="btn ghost icon sm" data-close>${icon('x')}</button></div><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`
  const close = () => { back.remove(); document.removeEventListener('keydown', key); onClose?.() }
  const key = e => { if (e.key === 'Escape') close() }
  document.addEventListener('keydown', key)
  back.addEventListener('mousedown', e => { if (e.target === back) close() })
  back.querySelector('[data-close]').onclick = close
  $('#modal-root').append(back)
  const m = back.querySelector('.modal')
  onMount?.(m, close)
  return { el: m, close }
}
export function confirmDialog(title, text, { okText, danger = false } = {}) {
  return new Promise(resolve => {
    let done = false
    const { el, close } = modal({
      title, body: `<p class="muted" style="margin:0">${esc(text)}</p>`,
      foot: `<button class="btn" data-no>${t('Отмена')}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okText || t('Подтвердить'))}</button>`,
      onClose: () => { if (!done) resolve(false) },
    })
    el.querySelector('[data-no]').onclick = () => close()
    el.querySelector('[data-ok]').onclick = () => { done = true; close(); resolve(true) }
  })
}
export function promptDialog(title, { label = '', value = '', placeholder = '', okText = 'OK' } = {}) {
  return new Promise(resolve => {
    let done = false
    const { el, close } = modal({
      title,
      body: `<label class="field">${esc(label)}<input class="input" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`,
      foot: `<button class="btn" data-no>${t('Отмена')}</button><button class="btn primary" data-ok>${esc(okText)}</button>`,
      onClose: () => { if (!done) resolve(null) },
    })
    const input = el.querySelector('input')
    input.focus(); input.select()
    const ok = () => { done = true; close(); resolve(input.value) }
    input.onkeydown = e => { if (e.key === 'Enter') ok() }
    el.querySelector('[data-no]').onclick = () => close()
    el.querySelector('[data-ok]').onclick = ok
  })
}

// ---------- контекстное меню ----------
export function contextMenu(x, y, items) {
  closeContext()
  const el = document.createElement('div')
  el.className = 'ctx'
  el.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${icon(it.icon)}${esc(it.label)}</button>`).join('')
  $('#ctx-root').append(el)
  const r = el.getBoundingClientRect()
  el.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'
  el.style.top = Math.min(y, innerHeight - r.height - 8) + 'px'
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b) return
    closeContext(); items[b.dataset.i].action()
  }
  setTimeout(() => document.addEventListener('mousedown', outside), 0)
}
function outside(e) { if (!e.target.closest('.ctx')) closeContext() }
export function closeContext() { $('#ctx-root').innerHTML = ''; document.removeEventListener('mousedown', outside) }

// ---------- подсказки ----------
let tipEl
document.addEventListener('mouseover', e => {
  const t = e.target.closest('[data-tip]')
  if (!t) { tipEl?.remove(); tipEl = null; return }
  if (tipEl?._for === t) return
  tipEl?.remove()
  tipEl = document.createElement('div')
  tipEl.className = 'tooltip'
  tipEl.textContent = t.dataset.tip
  tipEl._for = t
  document.body.append(tipEl)
  const r = t.getBoundingClientRect(), tr = tipEl.getBoundingClientRect()
  if (t.closest('#rail')) { tipEl.style.left = r.right + 10 + 'px'; tipEl.style.top = r.top + r.height / 2 - tr.height / 2 + 'px' }
  else { tipEl.style.left = Math.max(6, Math.min(innerWidth - tr.width - 6, r.left + r.width / 2 - tr.width / 2)) + 'px'; tipEl.style.top = r.bottom + 8 + 'px' }
})

export function lightbox(src) {
  const el = document.createElement('div')
  el.className = 'lightbox'
  el.innerHTML = `<img src="${esc(src)}">`
  el.onclick = () => el.remove()
  document.body.append(el)
}

export function md(text) {
  const html = window.marked.parse(text || '', { gfm: true, breaks: false })
  return window.DOMPurify.sanitize(html, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allowfullscreen', 'frameborder', 'target'] })
}
