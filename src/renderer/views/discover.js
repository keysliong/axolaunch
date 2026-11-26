import { call, esc, icon, on, instIcon, errToast, LOADERS, fmtNum, t } from '../ui.js'
import { isEn } from '../i18n.js'
import { state, registerView, navigate } from '../core.js'
import { installFlow, installInto } from '../actions.js'
import { projRow } from './home.js'
import { unlock } from '../fun.js'
import { SOURCE_ICONS, SOURCE_NAMES, ensureSource } from '../sources.js'

const TYPES = () => [
  ['mod', t('Моды'), 'box'], ['modpack', t('Сборки'), 'package'], ['resourcepack', t('Ресурспаки'), 'image'],
  ['shader', t('Шейдеры'), 'sun'], ['datapack', t('Датапаки'), 'world'],
]
const TYPE_LOADERS = {
  mod: ['fabric', 'forge', 'neoforge', 'quilt'], modpack: ['fabric', 'forge', 'neoforge', 'quilt'],
  shader: ['iris', 'optifine', 'canvas', 'vanilla'], resourcepack: [], datapack: [],
}
const SORTS = () => ({ relevance: t('По релевантности'), downloads: t('По загрузкам'), follows: t('По подпискам'), newest: t('Новые'), updated: t('Обновлённые') })
const CAT_RU = {
  adventure: 'Приключения', cursed: 'Проклятое', decoration: 'Декор', economy: 'Экономика', equipment: 'Снаряжение', food: 'Еда',
  'game-mechanics': 'Механики', library: 'Библиотеки', magic: 'Магия', management: 'Управление', minigame: 'Мини-игры', mobs: 'Мобы',
  optimization: 'Оптимизация', social: 'Социальное', storage: 'Хранение', technology: 'Технологии', transportation: 'Транспорт',
  utility: 'Утилиты', worldgen: 'Генерация мира', challenging: 'Хардкор', combat: 'Бой', 'kitchen-sink': 'Всё и сразу',
  lightweight: 'Лёгкие', multiplayer: 'Мультиплеер', quests: 'Квесты', 'vanilla-like': 'Как ванилла', realistic: 'Реализм',
  simplistic: 'Простые', themed: 'Тематические', tweaks: 'Твики', 'audio': 'Звук', blocks: 'Блоки', core: 'Ядро', entities: 'Сущности',
  environment: 'Окружение', fonts: 'Шрифты', gui: 'Интерфейс', items: 'Предметы', locale: 'Локализация', models: 'Модели',
  atmosphere: 'Атмосфера', bloom: 'Свечение', 'colored-lighting': 'Цветное освещение', foliage: 'Листва', 'path-tracing': 'Трассировка пути',
  pbr: 'PBR', reflections: 'Отражения', shadows: 'Тени', fantasy: 'Фэнтези', 'semi-realistic': 'Полуреализм', cartoon: 'Мультяшные',
  high: 'Высокая нагрузка', medium: 'Средняя', low: 'Низкая', potato: 'Картошка', screenshot: 'Для скриншотов',
}

const catName = n => isEn() ? n.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()) : (CAT_RU[n] || n)
const memory = {}

registerView('discover', async (el, params) => {
  const source = params.source || memory.source || 'modrinth'
  memory.source = source
  const cf = source === 'curseforge'
  let type = params.type || memory.type || 'mod'
  if (cf && type === 'modpack') type = 'mod' // сборки CurseForge пока не поддерживаются
  memory.type = type
  const target = params.target ? state.instances.find(i => i.id === params.target) : null
  const f = {
    query: params.query || '', categories: [], loaders: [], versions: [], env: [], index: 'relevance', page: 0,
  }
  if (target) {
    f.versions = [target.mcVersion]
    if (type === 'mod' && target.loader !== 'vanilla') f.loaders = [target.loader]
  }
  const tags = cf ? { categories: [], gameVersions: (await call('modrinth:tags').catch(() => ({ gameVersions: [] }))).gameVersions } : await call('modrinth:tags').catch(() => ({ categories: [], gameVersions: [] }))
  const cats = tags.categories.filter(c => c.project_type === (type === 'datapack' ? 'mod' : type) && c.header !== 'loaders')
  const byHeader = {}
  for (const c of cats) (byHeader[c.header] ||= []).push(c)
  const gameVersions = tags.gameVersions.filter(v => v.version_type === 'release').map(v => v.version)
  const HEADER = { categories: t('Категории'), features: t('Особенности'), 'performance impact': t('Нагрузка'), resolutions: t('Разрешение') }

  el.innerHTML = `
    ${target ? `<div class="target-banner">${instIcon(target)}<div class="grow">${t('Установка в')} <b>${esc(target.name)}</b> <span class="dim">· ${LOADERS[target.loader]} ${esc(target.mcVersion)}</span></div><button class="btn sm" data-back-inst>${icon('back')}${t('К сборке')}</button></div>` : ''}
    <div class="row between wrap" style="margin-bottom:16px">
      <div class="row" style="gap:10px"><div class="seg src-seg">${['modrinth', 'curseforge'].map(s => `<button class="${s === source ? 'on' : ''}" data-source="${s}">${SOURCE_ICONS[s]}${SOURCE_NAMES[s]}</button>`).join('')}</div>
      <div class="tabs">${TYPES().filter(([k]) => !(cf && k === 'modpack')).map(([k, n, ic]) => `<button class="tab ${k === type ? 'active' : ''}" data-type="${k}">${icon(ic)}${n}</button>`).join('')}</div></div>
      ${cf ? '' : `<button class="btn" data-lucky>${icon('dice')}${t('Мне повезёт')}</button>`}
    </div>
    <div class="discover">
      <div class="filters panel" style="padding:14px">
        ${(cf ? (type === 'mod' ? TYPE_LOADERS.mod : []) : TYPE_LOADERS[type]).length ? `<div><h4>${t('Загрузчик')}</h4><div class="filter-list">${(cf ? TYPE_LOADERS.mod : TYPE_LOADERS[type]).map(l => `<div class="filter-item ${f.loaders.includes(l) ? 'on' : ''}" data-f="loaders" data-v="${l}"><span class="cb"></span>${esc(LOADERS[l] || l[0].toUpperCase() + l.slice(1))}</div>`).join('')}</div></div>` : ''}
        <div><h4>${t('Версия игры')}</h4><select class="select" id="d-ver" style="width:100%"><option value="">${t('Любая')}</option>${gameVersions.map(v => `<option ${f.versions[0] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        ${type === 'mod' && !cf ? `<div><h4>${t('Окружение')}</h4><div class="filter-list"><div class="filter-item" data-f="env" data-v="client"><span class="cb"></span>${t('Клиент')}</div><div class="filter-item" data-f="env" data-v="server"><span class="cb"></span>${t('Сервер')}</div></div></div>` : ''}
        ${Object.entries(byHeader).map(([h, list]) => `<div><h4>${esc(HEADER[h] || h)}</h4><div class="filter-list">${list.map(c => `<div class="filter-item" data-f="categories" data-v="${esc(c.name)}"><span class="cb"></span>${esc(catName(c.name))}</div>`).join('')}</div></div>`).join('')}
        <button class="btn sm ghost" data-clear>${icon('x')}${t('Сбросить фильтры')}</button>
      </div>
      <div>
        <div class="row" style="margin-bottom:14px">
          <div class="search grow">${icon('search')}<input class="input" id="d-q" placeholder="${cf ? t('Искать {what} на CurseForge…', { what: esc(TYPES().find(x => x[0] === type)[1].toLowerCase()) }) : t('Искать {what} на Modrinth…', { what: esc(TYPES().find(x => x[0] === type)[1].toLowerCase()) })}" value="${esc(f.query)}"></div>
          <select class="select" id="d-sort">${Object.entries(SORTS()).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        </div>
        <div id="d-info" class="dim" style="margin-bottom:10px;font-size:13px"></div>
        <div id="d-results"><div class="spinner"></div></div>
        <div class="pager" id="d-pager"></div>
        <div id="d-other"></div>
      </div>
    </div>`

  let seq = 0
  let hits = []
  async function search() {
    const my = ++seq
    const box = el.querySelector('#d-results')
    box.style.opacity = .5
    try {
      const r = await call(cf ? 'cf:search' : 'modrinth:search', { query: f.query, type, categories: f.categories, loaders: f.loaders, versions: f.versions, env: f.env, index: f.index, offset: f.page * 20, limit: 20 })
      if (my !== seq || !box.isConnected) return
      box.style.opacity = 1
      el.querySelector('#d-info').textContent = t('Найдено: {n}', { n: fmtNum(r.total_hits) })
      hits = r.hits
      const filtered = f.versions.length || f.loaders.length || f.categories.length || f.env.length
      box.innerHTML = r.hits.length ? r.hits.map(projRow).join('') : `<div class="empty"><div class="big">${icon('search')}</div>${t('Ничего не нашлось. Попробуйте другие фильтры.')}${filtered ? `<div style="margin-top:12px"><button class="btn sm" data-nofilter>${icon('x')}${t('Искать без фильтров')}</button></div>` : ''}</div>`
      if (target) box.querySelectorAll('[data-install]').forEach(b => b.innerHTML = `${icon('download')}${t('В «{name}»', { name: esc(target.name.slice(0, 18)) })}`)
      if (target) markInstalled()
      showOthers(my, r)
      const pages = Math.ceil(r.total_hits / 20)
      const pg = el.querySelector('#d-pager')
      const cur = f.page
      const nums = [...new Set([0, cur - 2, cur - 1, cur, cur + 1, cur + 2, pages - 1])].filter(n => n >= 0 && n < pages).sort((a, b) => a - b)
      pg.innerHTML = pages > 1 ? `<button class="btn sm icon" data-page="${cur - 1}" ${cur === 0 ? 'disabled' : ''}>${icon('back')}</button>${nums.map((n, i) => `${i && n - nums[i - 1] > 1 ? '<span class="dim">…</span>' : ''}<button class="btn sm ${n === cur ? 'primary' : ''}" data-page="${n}">${n + 1}</button>`).join('')}<button class="btn sm icon" data-page="${cur + 1}" ${cur >= pages - 1 ? 'disabled' : ''}>${icon('forward')}</button>` : ''
    } catch (e) {
      if (my !== seq) return
      box.style.opacity = 1
      if (cf && (e.message || '').match(/API|ключ|key/i)) box.innerHTML = `<div class="empty"><div class="big">${icon('lock')}</div>${esc(e.message)}<div style="margin-top:12px"><button class="btn sm primary" data-cfkey>${t('Указать ключ')}</button></div></div>`
      else box.innerHTML = `<div class="empty"><div class="big">${icon('wifiOff')}</div>${cf ? t('Нет связи с CurseForge') : t('Нет связи с Modrinth')}<br><span class="dim">${esc(e.message)}</span></div>`
    }
  }
  // Моды, которые нашлись бы без фильтра версии/загрузчика: у многих (например, ATMOSPHERICS)
  // нет нужной пары «загрузчик + версия», и Modrinth их просто не возвращает. Показываем их отдельно.
  async function showOthers(my, r) {
    const other = el.querySelector('#d-other')
    other.innerHTML = ''
    if (!f.query.trim() || !(f.versions.length || f.loaders.length) || r.hits.length >= 20) return
    let all
    try { all = await call(cf ? 'cf:search' : 'modrinth:search', { query: f.query, type, categories: f.categories, loaders: [], versions: [], env: f.env, index: f.index, offset: 0, limit: 20 }) } catch { return }
    if (my !== seq || !other.isConnected) return
    const seen = new Set(r.hits.map(h => h.project_id || h.id))
    const rest = all.hits.filter(h => !seen.has(h.project_id || h.id)).slice(0, 8)
    if (!rest.length) return
    const want = [f.loaders.map(l => LOADERS[l] || l).join('/'), f.versions.join(', ')].filter(Boolean).join(' ')
    other.innerHTML = `<div class="other-head">${icon('info')}<div><b>${t('Есть, но не для {want}', { want: esc(want) })}</b><div class="dim">${t('У этих модов нет версии под выбранный загрузчик и версию игры. Откройте мод, чтобы посмотреть, для чего он выходит.')}</div></div></div>` +
      rest.map(projRow).join('')
    other.querySelectorAll('.proj').forEach((row, i) => {
      const h = rest[i]
      const loaders = (h.loaders || h.categories || []).filter(c => LOADERS[c] && c !== 'vanilla').map(c => LOADERS[c])
      const vers = (h.game_versions || h.versions || []).filter(v => /^\d+\.\d+(\.\d+)?$/.test(v)).slice(-4).reverse()
      const btn = row.querySelector('[data-install]')
      btn.outerHTML = `<div class="avail dim">${t('Есть для')}:<br><b>${esc([...new Set(loaders)].join(', ') || '—')}</b><br>${esc(vers.join(', '))}</div>`
      row.classList.add('unavail')
    })
  }
  // отмечаем моды, которые уже есть в выбранной сборке (в т.ч. поставленные как зависимости)
  async function markInstalled() {
    let have
    try { have = new Set((await call('instances:content', target.id, type === 'shader' ? 'shader' : type === 'resourcepack' ? 'resourcepack' : 'mod')).map(m => m.projectId).filter(Boolean)) } catch { return }
    el.querySelectorAll('[data-install]').forEach(b => {
      if (!have.has(b.dataset.install) || b.classList.contains('done')) return
      b.innerHTML = `<span class="ic-ok">${icon('check')}</span>${t('Установлено')}`
      b.classList.add('done'); b.disabled = true
    })
  }
  const onChanged = e => {
    if (!el.isConnected) return document.removeEventListener('content-changed', onChanged)
    if (target && e.detail === target.id) markInstalled()
  }
  document.addEventListener('content-changed', onChanged)
  let debounce
  const q = el.querySelector('#d-q')
  q.oninput = () => { clearTimeout(debounce); debounce = setTimeout(() => { f.query = q.value; f.page = 0; search() }, 300) }
  if (params.focus) setTimeout(() => q.focus(), 50)
  el.querySelector('#d-sort').onchange = e => { f.index = e.target.value; f.page = 0; search() }
  el.querySelector('#d-ver').onchange = e => { f.versions = e.target.value ? [e.target.value] : []; f.page = 0; search() }
  on(el, '.filter-item', 'click', (_, it) => {
    const arr = f[it.dataset.f], v = it.dataset.v
    const i = arr.indexOf(v)
    i >= 0 ? arr.splice(i, 1) : arr.push(v)
    it.classList.toggle('on', i < 0)
    f.page = 0; search()
  })
  on(el, '[data-clear]', 'click', () => { navigate('discover', { type, target: params.target, source }, { replace: true }) })
  on(el, '[data-type]', 'click', (_, b) => navigate('discover', { type: b.dataset.type, target: params.target, source }, { replace: true }))
  on(el, '[data-source]', 'click', async (_, b) => {
    if (b.dataset.source === source || !(await ensureSource(b.dataset.source))) return
    navigate('discover', { type, target: params.target, source: b.dataset.source, query: f.query }, { replace: true })
  })
  on(el, '[data-cfkey]', 'click', async () => { const { cfKeyDialog } = await import('../sources.js'); if (await cfKeyDialog()) search() })
  on(el, '[data-nofilter]', 'click', () => {
    f.versions = []; f.loaders = []; f.categories = []; f.env = []; f.page = 0
    el.querySelectorAll('.filter-item.on').forEach(x => x.classList.remove('on'))
    el.querySelector('#d-ver').value = ''
    search()
  })
  on(el, '[data-page]', 'click', (_, b) => { f.page = Number(b.dataset.page); search(); document.getElementById('view').scrollTop = 0 })
  on(el, '[data-proj]', 'click', (_, c) => {
    // у CurseForge нет страницы проекта в лаунчере — открываем сайт
    if (cf) { const h = hits.find(x => x.project_id === c.dataset.proj); if (h?.url) call('app:openExternal', h.url); return }
    navigate('project', { id: c.dataset.proj, target: params.target })
  })
  on(el, '[data-install]', 'click', async (e, b) => {
    e.stopPropagation()
    if (b.disabled) return
    b.disabled = true
    const was = b.innerHTML
    let ok = false
    try {
      const p = await call('modrinth:project', b.dataset.install)
      if (target && p.project_type !== 'modpack') {
        b.innerHTML = `<span class="spin"></span>${t('Установка…')}`
        ok = await installInto(target.id, p)
      } else await installFlow(p)
    } catch (er) { errToast(er) }
    if (ok) { b.innerHTML = `<span class="ic-ok">${icon('check')}</span>${t('Установлено')}`; b.classList.add('done') }
    else { b.innerHTML = was; b.disabled = false }
  })
  on(el, '[data-back-inst]', 'click', () => navigate('instance', { id: target.id }))
  on(el, '[data-lucky]', 'click', async () => {
    unlock('lucky')
    // /projects_random у Modrinth кэшируется (всегда один и тот же проект) и не знает про фильтры,
    // поэтому берём случайный проект из поиска с текущими фильтрами среди 2000 самых популярных
    try {
      // без поиска и фильтров — случайный тип, моды чаще всего; иначе уважаем текущую вкладку
      const free = !f.query && !f.categories.length && !f.loaders.length && !f.versions.length && !f.env.length
      const pool = ['mod', 'mod', 'mod', 'mod', 'modpack', 'shader', 'resourcepack', 'datapack']
      const ty = free ? pool[Math.floor(Math.random() * pool.length)] : type
      const q = { query: f.query, type: ty, categories: f.categories, loaders: f.loaders, versions: f.versions, env: f.env, index: 'downloads', limit: 1 }
      const first = await call('modrinth:search', { ...q, offset: 0 })
      const total = Math.min(first.total_hits, 2000)
      if (!total) return errToast(new Error(t('Ничего не нашлось. Попробуйте другие фильтры.')))
      const r = await call('modrinth:search', { ...q, offset: Math.floor(Math.random() * total) })
      const p = r.hits[0] || first.hits[0]
      navigate('project', { id: p.project_id, target: params.target })
    } catch (e) { errToast(e) }
  })
  search()
})
