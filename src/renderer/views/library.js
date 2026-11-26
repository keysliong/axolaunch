import { esc, icon, on, LOADERS, t } from '../ui.js'
import { axolotlSVG } from '../fun.js'
import { state, registerView } from '../core.js'
import { openCreate, importMrpack } from '../actions.js'
import { instCard, bindInstCards } from './home.js'

let prefs = { q: '', group: 'group', sort: 'played', big: true }
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem('lib-prefs') || '{}') } } catch {}

registerView('library', async (el) => {
  el.innerHTML = `
    <div class="row between wrap" style="margin-bottom:18px">
      <div><h1>${t('Библиотека')}</h1><p class="muted" style="margin:0">${t('Сборок: {n}', { n: state.instances.length })}</p></div>
      <div class="row"><button class="btn" data-import>${icon('download')}${t('Импорт .mrpack')}</button><button class="btn primary" data-new>${icon('plus')}${t('Новая сборка')}</button></div>
    </div>
    <div class="row wrap" style="margin-bottom:18px">
      <div class="search grow" style="min-width:220px">${icon('search')}<input class="input" id="lib-q" placeholder="${t('Поиск сборок…')}" value="${esc(prefs.q)}"></div>
      <select class="select" id="lib-group"><option value="none">${t('Без группировки')}</option><option value="group">${t('По группам')}</option><option value="loader">${t('По загрузчику')}</option><option value="version">${t('По версии')}</option></select>
      <select class="select" id="lib-sort"><option value="played">${t('Недавно запущенные')}</option><option value="name">${t('По имени')}</option><option value="created">${t('Новые')}</option><option value="playtime">${t('Больше всего играл')}</option></select>
      <button class="btn icon" id="lib-view" data-tip="${t('Вид')}">${icon(prefs.big ? 'library' : 'filter')}</button>
    </div>
    <div id="lib-list"></div>`
  el.querySelector('#lib-group').value = prefs.group
  el.querySelector('#lib-sort').value = prefs.sort

  const draw = () => {
    localStorage.setItem('lib-prefs', JSON.stringify(prefs))
    const q = prefs.q.toLowerCase()
    let list = state.instances.filter(i => !q || i.name.toLowerCase().includes(q) || i.mcVersion.includes(q) || i.loader.includes(q))
    const sorters = {
      played: (a, b) => (b.lastPlayed || b.created) - (a.lastPlayed || a.created),
      name: (a, b) => a.name.localeCompare(b.name),
      created: (a, b) => b.created - a.created,
      playtime: (a, b) => (b.playtime || 0) - (a.playtime || 0),
    }
    list.sort(sorters[prefs.sort])
    const groups = new Map()
    for (const i of list) {
      const k = prefs.group === 'group' ? (i.group || t('Без группы')) : prefs.group === 'loader' ? LOADERS[i.loader] : prefs.group === 'version' ? i.mcVersion : ''
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(i)
    }
    const box = el.querySelector('#lib-list')
    if (!list.length) {
      box.innerHTML = state.instances.length ? `<div class="empty"><div class="big">${icon('search')}</div>${t('Ничего не найдено')}</div>`
        : `<div class="card empty"><div class="big axo">${axolotlSVG(state.settings.petColor || 'pink')}</div><h2>${t('Библиотека пуста')}</h2><p class="muted">${t('Создайте сборку, импортируйте .mrpack или перетащите его в окно')}</p></div>`
      return
    }
    box.innerHTML = [...groups].map(([k, items]) => `
      <div class="section">${k ? `<h3 class="muted">${esc(k)} <span class="dim">· ${items.length}</span></h3>` : ''}
      <div class="grid ${prefs.big ? 'tiles' : ''}" style="--min:${prefs.big ? 168 : 260}px">${items.map(i => instCard(i, prefs.big)).join('')}</div></div>`).join('')
  }
  draw()
  bindInstCards(el)
  el.querySelector('#lib-q').oninput = e => { prefs.q = e.target.value; draw() }
  el.querySelector('#lib-group').onchange = e => { prefs.group = e.target.value; draw() }
  el.querySelector('#lib-sort').onchange = e => { prefs.sort = e.target.value; draw() }
  el.querySelector('#lib-view').onclick = e => { prefs.big = !prefs.big; e.currentTarget.innerHTML = icon(prefs.big ? 'library' : 'filter'); draw() }
  on(el, '[data-new]', 'click', () => openCreate())
  on(el, '[data-import]', 'click', () => importMrpack())
  document.addEventListener('tasks-changed', draw)
  document.addEventListener('running-changed', draw)
  return () => { document.removeEventListener('tasks-changed', draw); document.removeEventListener('running-changed', draw) }
})
