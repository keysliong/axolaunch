import { call, esc, icon, on, instIcon, fmtNum, fmtTime, fmtAgo, LOADERS, t } from '../ui.js'
import { state, registerView, navigate, activeAccount, isRunning, taskFor } from '../core.js'
import { splashes, tips, greeting, axolotlSVG } from '../fun.js'
import { play, instanceMenu, openCreate, installFlow } from '../actions.js'

export function instCard(i, big = false) {
  const tk = taskFor(i.id)
  const run = isRunning(i.id)
  const sub = `${icon(i.loader)}${LOADERS[i.loader]} ${esc(i.mcVersion)}`
  if (big) {
    const label = run ? t('Стоп') : tk ? `${Math.round((tk.progress || 0) * 100)}%` : t('Играть')
    return `
    <div class="inst-card tile ${run ? 'running' : ''} ${tk ? 'busy' : ''}" data-open="${esc(i.id)}">
      <div class="tile-art">${instIcon(i)}
        ${tk ? `<div class="installing"><div class="progress"><div style="width:${tk.progress * 100}%"></div></div></div>` : ''}
      </div>
      <div class="tile-info"><div class="name" title="${esc(i.name)}">${esc(i.name)}</div><div class="sub">${sub}</div></div>
      <button class="tile-play" data-play="${esc(i.id)}" ${tk && !run ? `data-tip="${t('Идёт установка — игра запустится, когда она закончится')}"` : ''}>${icon(run ? 'stop' : tk ? 'download' : 'play')}<span>${label}</span></button>
    </div>`
  }
  return `
    <div class="inst-card ${run ? 'running' : ''}" data-open="${esc(i.id)}">
      ${instIcon(i)}
      <button class="play-fab" data-play="${esc(i.id)}">${icon(run ? 'stop' : 'play')}</button>
      <div class="meta"><div class="name">${esc(i.name)}</div><div class="sub">${sub}</div></div>
      ${tk ? `<div class="installing"><div class="progress"><div style="width:${tk.progress * 100}%"></div></div></div>` : ''}
    </div>`
}

export function bindInstCards(el) {
  on(el, '[data-play]', 'click', (e, b) => { e.stopPropagation(); play(b.dataset.play) })
  on(el, '[data-open]', 'click', (e, c) => navigate('instance', { id: c.dataset.open }))
  el.addEventListener('contextmenu', e => {
    const c = e.target.closest('[data-open]')
    if (!c) return
    e.preventDefault()
    instanceMenu(e.clientX, e.clientY, state.instances.find(i => i.id === c.dataset.open))
  })
}

export function projRow(p, i = 0) {
  return `
    <div class="proj" data-proj="${esc(p.project_id || p.id)}" data-slug="${esc(p.slug)}" style="animation-delay:${i * 25}ms">
      <img class="proj-icon" src="${esc(p.icon_url || 'axolotl.svg')}" loading="lazy">
      <div class="grow">
        <div class="row" style="gap:8px;align-items:baseline"><span class="title">${esc(p.title)}</span><span class="author">${t('от {name}', { name: esc(p.author) })}</span></div>
        <div class="desc">${esc(p.description)}</div>
        <div class="row wrap" style="gap:6px">${(p.display_categories || p.categories || []).slice(0, 5).map(c => `<span class="chip">${icon('tag')}${esc(c)}</span>`).join('')}</div>
      </div>
      <div class="side">
        <div class="col" style="gap:4px;align-items:flex-end">
          <div class="stat-line">${icon('download')}<b>${fmtNum(p.downloads)}</b></div>
          <div class="stat-line">${icon('heart')}<b>${fmtNum(p.follows)}</b></div>
        </div>
        <div class="stat-line dim">${icon('refresh')}${fmtAgo(p.date_modified)}</div>
        <button class="btn sm primary" data-install="${esc(p.project_id || p.id)}">${icon('download')}${t('Установить')}</button>
      </div>
    </div>`
}

registerView('home', async (el) => {
  const acc = activeAccount()
  const stats = await call('stats:get')
  const SPL = splashes()
  const splash = SPL[Math.floor(Math.random() * SPL.length)]
  const TIP = tips()
  const tip = TIP[Math.floor(Math.random() * TIP.length)]
  const recent = state.instances.slice(0, 6)
  const totalMods = state.instances.reduce((a, i) => a + Object.keys(i.content || {}).length, 0)

  el.innerHTML = `
    <div class="hero">
      ${state.settings.splashes !== false ? `<div class="splash" id="splash">${esc(splash)}</div>` : ''}
      <div class="axo-big">${axolotlSVG(state.settings.petColor || 'pink')}</div>
      <h1>${esc(greeting(acc?.name))}</h1>
      <p class="muted" style="margin:0 0 18px">${t('Во что поиграем сегодня?')}</p>
      <div class="row wrap">
        ${recent[0] ? `<button class="btn play" data-play="${esc(recent[0].id)}">${icon(isRunning(recent[0].id) ? 'stop' : 'play')}${isRunning(recent[0].id) ? t('Остановить') : t('Продолжить: {name}', { name: esc(recent[0].name) })}</button>` : ''}
        <button class="btn primary" data-new>${icon('plus')}${t('Новая сборка')}</button>
        <button class="btn" data-go="modpack">${icon('package')}${t('Готовые сборки')}</button>
      </div>
    </div>

    <div class="stat-row section">
      <div class="stat"><div class="v">${fmtTime(stats.playtime || 0)}</div><div class="k">${icon('clock')}${t('Всего в игре')}</div></div>
      <div class="stat"><div class="v">${stats.launches || 0}</div><div class="k">${icon('rocket')}${t('Запусков')}</div></div>
      <div class="stat"><div class="v">${state.instances.length}</div><div class="k">${icon('library')}${t('Сборок')}</div></div>
      <div class="stat"><div class="v">${totalMods}</div><div class="k">${icon('box')}${t('Модов и паков')}</div></div>
      <div class="stat"><div class="v">${Object.keys(stats.achievements || {}).length}</div><div class="k">${icon('trophy')}${t('Достижений')}</div></div>
    </div>

    <div class="tip section">${icon('bulb')}<div>${tip}</div></div>

    ${recent.length ? `<div class="section"><div class="row between"><h2>${t('Недавние сборки')}</h2><button class="btn sm ghost" data-nav="library">${t('Все')} ${icon('forward')}</button></div>
      <div class="grid tiles" id="recent">${recent.map(i => instCard(i, true)).join('')}</div></div>`
      : `<div class="section card empty"><div class="big">${icon('pickaxe')}</div><h2>${t('Здесь пока пусто')}</h2><p class="muted">${t('Создайте первую сборку или установите готовую с Modrinth')}</p><button class="btn primary" data-new>${icon('plus')}${t('Создать сборку')}</button></div>`}

    <div class="section"><div class="row between"><h2 class="h-ic">${icon('flame')}${t('Популярные моды')}</h2><button class="btn sm ghost" data-go="mod">${t('Каталог')} ${icon('forward')}</button></div><div id="pop-mods"><div class="spinner"></div></div></div>
    <div class="section"><div class="row between"><h2 class="h-ic">${icon('package')}${t('Популярные сборки')}</h2><button class="btn sm ghost" data-go="modpack">${t('Ещё')} ${icon('forward')}</button></div><div id="pop-packs"><div class="spinner"></div></div></div>
  `
  bindInstCards(el)
  on(el, '[data-new]', 'click', () => openCreate())
  on(el, '[data-go]', 'click', (_, b) => navigate('discover', { type: b.dataset.go }))
  const sp = el.querySelector('#splash')
  if (sp) sp.onclick = () => { sp.textContent = SPL[Math.floor(Math.random() * SPL.length)] }

  const load = async (type, sel) => {
    try {
      const r = await call('modrinth:search', { type, index: 'follows', limit: 5 })
      const box = el.querySelector(sel)
      if (!box) return
      box.innerHTML = r.hits.map(projRow).join('')
    } catch (e) { const b = el.querySelector(sel); if (b) b.innerHTML = `<p class="muted">${t('Не удалось загрузить: {err}', { err: esc(e.message) })}</p>` }
  }
  on(el, '[data-install]', 'click', async (e, b) => { e.stopPropagation(); const p = await call('modrinth:project', b.dataset.install); installFlow(p) })
  on(el, '[data-proj]', 'click', (_, c) => navigate('project', { id: c.dataset.proj }))
  load('mod', '#pop-mods'); load('modpack', '#pop-packs')

  const refresh = () => { const r = el.querySelector('#recent'); if (r) r.innerHTML = state.instances.slice(0, 6).map(i => instCard(i, true)).join('') }
  document.addEventListener('tasks-changed', refresh)
  document.addEventListener('running-changed', refresh)
  return () => { document.removeEventListener('tasks-changed', refresh); document.removeEventListener('running-changed', refresh) }
})
