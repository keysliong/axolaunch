import { call, esc, icon, on, md, fmtNum, fmtAgo, lightbox, errToast, LOADERS, t } from '../ui.js'
import { fmtDate } from '../i18n.js'
import { state, registerView, chrome } from '../core.js'
import { installFlow, installInto } from '../actions.js'

const TYPE_NAME = () => ({ mod: t('Мод'), modpack: t('Сборка'), resourcepack: t('Ресурспак'), shader: t('Шейдер'), datapack: t('Датапак'), plugin: t('Плагин') })

registerView('project', async (el, params) => {
  const p = await call('modrinth:project', params.id)
  state.route.params.title = p.title
  chrome()
  const members = await call('modrinth:members', p.id).catch(() => [])
  const target = params.target ? state.instances.find(i => i.id === params.target) : null
  const tab = params.tab || 'desc'
  const links = [
    ['globe', 'Modrinth', `https://modrinth.com/${p.project_type}/${p.slug}`],
    p.source_url && ['terminal', t('Исходный код'), p.source_url],
    p.issues_url && ['info', t('Баг-трекер'), p.issues_url],
    p.wiki_url && ['library', t('Вики'), p.wiki_url],
    p.discord_url && ['user', 'Discord', p.discord_url],
    ...(p.donation_urls || []).map(d => ['heart', d.platform || t('Поддержать'), d.url]),
  ].filter(Boolean)

  el.innerHTML = `
    <div class="proj-head">
      <img class="proj-icon" src="${esc(p.icon_url || 'axolotl.svg')}">
      <div class="grow">
        <div class="row" style="gap:8px"><span class="chip accent">${TYPE_NAME()[p.project_type] || p.project_type}</span>${p.client_side !== 'unsupported' ? `<span class="chip">${t('Клиент')}</span>` : ''}${p.server_side !== 'unsupported' ? `<span class="chip">${t('Сервер')}</span>` : ''}</div>
        <h1 style="margin-top:8px">${esc(p.title)}</h1>
        <p class="muted" style="margin:0 0 12px">${esc(p.description)}</p>
        <div class="row wrap" style="gap:16px">
          <span class="stat-line">${icon('download')}<b>${fmtNum(p.downloads)}</b>&nbsp;${t('загрузок')}</span>
          <span class="stat-line">${icon('heart')}<b>${fmtNum(p.followers)}</b>&nbsp;${t('подписчиков')}</span>
          <span class="stat-line">${icon('refresh')}${t('обновлён {ago}', { ago: fmtAgo(p.updated) })}</span>
        </div>
      </div>
      <div class="col" style="align-items:flex-end">
        <button class="btn primary" id="pj-install" style="height:44px;padding:0 22px">${icon('download')}${p.project_type === 'modpack' ? t('Установить сборку') : target ? t('Установить в «{name}»', { name: esc(target.name.slice(0, 20)) }) : t('Установить')}</button>
        <button class="btn sm ghost" data-ext="https://modrinth.com/${esc(p.project_type)}/${esc(p.slug)}">${icon('external')}${t('Открыть на сайте')}</button>
      </div>
    </div>
    <div class="tabs" style="margin-bottom:18px">
      <button class="tab ${tab === 'desc' ? 'active' : ''}" data-tab="desc">${icon('info')}${t('Описание')}</button>
      <button class="tab ${tab === 'versions' ? 'active' : ''}" data-tab="versions">${icon('tag')}${t('Версии')}</button>
      ${p.gallery?.length ? `<button class="tab ${tab === 'gallery' ? 'active' : ''}" data-tab="gallery">${icon('image')}${t('Галерея')} <span class="dim">${p.gallery.length}</span></button>` : ''}
    </div>
    <div class="proj-body">
      <div id="pj-tab" class="card" style="min-width:0"></div>
      <div class="col" style="gap:14px">
        <div class="card"><h3>${t('Совместимость')}</h3>
          <div class="dim" style="font-size:12px;margin-bottom:6px">${t('Загрузчики')}</div>
          <div class="row wrap" style="gap:6px;margin-bottom:12px">${(p.loaders || []).map(l => `<span class="chip">${esc(LOADERS[l] || l)}</span>`).join('')}</div>
          <div class="dim" style="font-size:12px;margin-bottom:6px">${t('Версии Minecraft')}</div>
          <div class="row wrap" style="gap:6px">${compactVersions(p.game_versions || []).map(v => `<span class="chip">${esc(v)}</span>`).join('')}</div>
        </div>
        <div class="card"><h3>${t('Ссылки')}</h3><div class="col" style="gap:6px">${links.map(([ic, n, u]) => `<a href="#" data-ext="${esc(u)}" class="row" style="gap:8px">${icon(ic)}<span>${esc(n)}</span></a>`).join('')}</div></div>
        ${members.length ? `<div class="card"><h3>${t('Авторы')}</h3><div class="col" style="gap:8px">${members.slice(0, 8).map(m => `<div class="row" style="gap:10px"><img src="${esc(m.user.avatar_url || 'axolotl.svg')}" style="width:32px;height:32px;border-radius:50%"><div><div style="font-weight:700">${esc(m.user.username)}</div><div class="dim" style="font-size:12px">${esc(m.role)}</div></div></div>`).join('')}</div></div>` : ''}
        <div class="card"><h3>${t('Детали')}</h3><div class="col" style="gap:4px;font-size:13px" class="muted">
          <div>${t('Лицензия:')} <b>${esc(p.license?.name || p.license?.id || '—')}</b></div>
          <div>${t('Опубликован:')} ${fmtDate(p.published)}</div>
        </div></div>
      </div>
    </div>`

  const box = el.querySelector('#pj-tab')
  async function showTab(name) {
    el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name))
    if (name === 'desc') box.innerHTML = `<div class="markdown">${md(p.body)}</div>`
    else if (name === 'gallery') box.innerHTML = `<div class="gallery">${p.gallery.sort((a, b) => a.ordering - b.ordering).map(g => `<figure data-img="${esc(g.url)}"><img src="${esc(g.url)}" loading="lazy">${g.title ? `<figcaption><b>${esc(g.title)}</b>${g.description ? `<div class="dim">${esc(g.description)}</div>` : ''}</figcaption>` : ''}</figure>`).join('')}</div>`
    else if (name === 'versions') {
      box.innerHTML = '<div class="spinner"></div>'
      // для сборки показываем только подходящие версии: и по Minecraft, и по загрузчику
      const ld = !target || target.loader === 'vanilla' ? [] : target.loader === 'quilt' ? ['quilt', 'fabric'] : target.loader === 'neoforge' && target.mcVersion === '1.20.1' ? ['neoforge', 'forge'] : [target.loader]
      const filters = target && p.project_type === 'mod' ? { gameVersions: [target.mcVersion], loaders: ld } : {}
      const vs = await call('modrinth:versions', p.id, filters)
      box.innerHTML = `${target ? `<p class="dim" style="margin-top:0">${t('Показаны версии для Minecraft {v}', { v: esc(target.mcVersion) })}</p>` : ''}
        <table class="table"><thead><tr><th></th><th>${t('Версия')}</th><th>${t('Игра')}</th><th>${t('Загрузчики')}</th><th>${t('Дата')}</th><th></th></tr></thead><tbody>
        ${vs.slice(0, 150).map(v => `<tr>
          <td><span class="vt ${v.version_type}">${v.version_type === 'release' ? 'R' : v.version_type === 'beta' ? 'B' : 'A'}</span></td>
          <td><b>${esc(v.version_number)}</b><div class="dim" style="font-size:12px">${esc(v.name)}</div></td>
          <td style="font-size:12px">${esc(compactVersions(v.game_versions).slice(0, 4).join(', '))}</td>
          <td style="font-size:12px">${esc(v.loaders.map(l => LOADERS[l] || l).join(', '))}</td>
          <td class="dim" style="font-size:12px">${fmtAgo(v.date_published)}</td>
          <td><button class="btn sm" data-ver="${esc(v.id)}">${icon('download')}</button></td></tr>`).join('')}
        </tbody></table>`
    }
  }
  showTab(tab)
  on(el, '[data-tab]', 'click', (_, b) => showTab(b.dataset.tab))
  on(el, '[data-img]', 'click', (_, f) => lightbox(f.dataset.img))
  on(el, '[data-ext]', 'click', (e, a) => { e.preventDefault(); call('app:openExternal', a.dataset.ext) })
  on(el, '.markdown a', 'click', (e, a) => { e.preventDefault(); call('app:openExternal', a.href) })
  on(el, '[data-ver]', 'click', async (_, b) => {
    if (target && p.project_type !== 'modpack') return installInto(target.id, p, b.dataset.ver)
    installFlow(p, b.dataset.ver)
  })
  el.querySelector('#pj-install').onclick = async e => {
    const b = e.currentTarget
    b.disabled = true
    try {
      if (target && p.project_type !== 'modpack') await installInto(target.id, p)
      else await installFlow(p)
    } catch (er) { errToast(er) } finally { b.disabled = false }
  }
})

function compactVersions(list) {
  // сворачиваем 1.20, 1.20.1, 1.20.2 → 1.20.x
  const rel = list.filter(v => /^\d+\.\d+(\.\d+)?$/.test(v))
  const groups = new Map()
  for (const v of rel) { const k = v.split('.').slice(0, 2).join('.'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(v) }
  const out = [...groups].map(([k, vs]) => vs.length > 1 ? `${k}.x` : vs[0]).reverse()
  return out.length ? out : list.slice(-6).reverse()
}
