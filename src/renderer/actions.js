// Общие действия: запуск, контекстное меню сборки, создание, экспорт, установка контента
import { call, esc, icon, modal, toast, errToast, confirmDialog, contextMenu, instIcon, LOADERS, sound, $, $$, on, t } from './ui.js'
import { state, navigate, refreshInstances, isRunning, render } from './core.js'
import { randomName, unlock, confetti, INST_ICONS } from './fun.js'

export async function play(id) {
  const inst = state.instances.find(i => i.id === id)
  if (isRunning(id)) return call('game:kill', id)
  if (!state.accounts.active) { toast(t('Нужен аккаунт'), t('Добавьте аккаунт — кликните по аватару внизу слева'), 'error'); return accountMenu() }
  sound('success')
  toast(t('Запускаю…'), inst?.name || '', 'info', 'rocket')
  try { await call('game:play', id) } catch (e) { errToast(e, t('Не удалось запустить')) }
}

export function instanceMenu(x, y, inst) {
  contextMenu(x, y, [
    { icon: isRunning(inst.id) ? 'stop' : 'play', label: isRunning(inst.id) ? t('Остановить') : t('Играть'), action: () => play(inst.id) },
    { icon: 'box', label: t('Открыть'), action: () => navigate('instance', { id: inst.id }) },
    { icon: 'plus', label: t('Добавить контент'), action: () => import('./sources.js').then(m => m.chooseSource(inst.id, 'mod')) },
    '-',
    { icon: 'folder', label: t('Открыть папку'), action: () => call('instances:openFolder', inst.id) },
    { icon: 'copy', label: t('Дублировать'), action: async () => { await call('instances:duplicate', inst.id); await refreshInstances(); render(); toast(t('Сборка скопирована'), '', 'success') } },
    { icon: 'upload', label: t('Экспорт в .mrpack'), action: () => exportDialog(inst.id) },
    { icon: 'refresh', label: t('Переустановить файлы игры'), action: () => call('instances:repair', inst.id).catch(errToast) },
    '-',
    { icon: 'trash', label: t('Удалить'), danger: true, action: () => deleteInstance(inst) },
  ])
}

export async function deleteInstance(inst) {
  if (!await confirmDialog(t('Удалить сборку?'), t('«{name}» будет перемещена в корзину вместе с мирами и модами.', { name: inst.name }), { okText: t('В корзину'), danger: true })) return
  try {
    await call('instances:remove', inst.id)
    await refreshInstances()
    toast(t('Сборка удалена'), t('Её можно восстановить из корзины'), 'success')
    if (state.route.name === 'instance') navigate('library', {}, { replace: true }); else render()
  } catch (e) { errToast(e) }
}

/** Сетка выбора иконки сборки. value: '' (буква) или 'i:<name>' */
export function iconPicker(value = '') {
  return `<div class="icon-pick">${['', ...INST_ICONS.map(n => 'i:' + n)].map(v =>
    `<button type="button" data-ipick="${v}" class="${v === value ? 'on' : ''}" data-tip="${v ? '' : t('Первая буква названия')}">${v ? icon(v.slice(2)) : icon('letter')}</button>`).join('')}</div>`
}
export function bindIconPicker(root, onPick) {
  on(root, '[data-ipick]', 'click', (_, b) => { $$('[data-ipick]', root).forEach(x => x.classList.toggle('on', x === b)); onPick(b.dataset.ipick) })
}

export async function openCreate(preset = {}) {
  let loader = preset.loader || 'fabric'
  let icon_ = ''
  let showSnap = !!state.settings.showSnapshots
  const mcAll = await call('versions:minecraft').catch(e => { errToast(e, t('Нет связи с Mojang')); return null })
  if (!mcAll) return
  const { el, close } = modal({
    title: t('Новая сборка'), wide: true,
    body: `
      <div class="tabs" style="margin-bottom:4px"><button class="tab active" data-mode="new">${icon('plus')}${t('Создать')}</button><button class="tab" data-mode="import">${icon('download')}${t('Импорт .mrpack')}</button><button class="tab" data-mode="browse">${icon('compass')}${t('Готовые сборки')}</button></div>
      <div data-pane="new" class="col" style="gap:14px">
        <div class="row" style="gap:14px;align-items:flex-start">
          <div class="col" style="gap:6px;align-items:center"><div id="ci-preview"></div></div>
          <div class="col grow">
            <label class="field">${t('Название')}
              <div class="row"><input class="input grow" id="ci-name" value="${esc(preset.name || randomName())}"><button class="btn icon" id="ci-dice" data-tip="${t('Случайное имя')}">${icon('dice')}</button></div>
            </label>
            ${iconPicker('')}
          </div>
        </div>
        <div class="field" style="font-weight:600;font-size:13px">${t('Загрузчик')}</div>
        <div class="loader-pick">${Object.entries(LOADERS).map(([k, v]) => `<button data-loader="${k}" class="${k === loader ? 'on' : ''}">${icon(k)}${v}</button>`).join('')}</div>
        <div class="row" style="align-items:flex-end">
          <label class="field grow">${t('Версия Minecraft')} <select class="select" id="ci-mc"></select></label>
          <label class="field grow" id="ci-lv-wrap">${t('Версия загрузчика')} <select class="select" id="ci-lv"></select></label>
        </div>
        <label class="row" style="gap:8px;cursor:pointer;width:fit-content"><span class="toggle"><input type="checkbox" id="ci-snap" ${showSnap ? 'checked' : ''}><span></span></span><span class="muted">${t('Показывать снапшоты и старые версии')}</span></label>
        <label class="field">${t('Группа')} <span class="hint">${t('Необязательно — для сортировки в библиотеке')}</span><input class="input" id="ci-group" placeholder="${t('Например: С друзьями')}" list="ci-groups"><datalist id="ci-groups">${[...new Set(state.instances.map(i => i.group).filter(Boolean))].map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
      </div>
      <div data-pane="import" class="col" hidden>
        <div class="card drop-zone" id="ci-drop">
          <div class="drop-ic">${icon('package')}</div>
          <h3>${t('Перетащите сюда .mrpack')}</h3>
          <p class="muted">${t('или')}</p>
          <button class="btn primary" id="ci-pick">${icon('folder')}${t('Выбрать файл')}</button>
        </div>
      </div>
      <div data-pane="browse" class="col" hidden>
        <p class="muted" style="margin:0">${t('Тысячи готовых сборок с Modrinth устанавливаются в один клик.')}</p>
        <button class="btn primary" id="ci-browse">${icon('compass')}${t('Открыть каталог сборок')}</button>
      </div>`,
    foot: `<button class="btn" data-close2>${t('Отмена')}</button><button class="btn primary" id="ci-create">${icon('plus')}${t('Создать')}</button>`,
  })
  const preview = () => { el.querySelector('#ci-preview').innerHTML = instIcon({ id: el.querySelector('#ci-name').value, name: el.querySelector('#ci-name').value, icon: icon_ }, '') }
  preview()
  el.querySelector('#ci-name').oninput = preview
  el.querySelector('#ci-dice').onclick = () => { el.querySelector('#ci-name').value = randomName(); sound('click'); preview() }
  bindIconPicker(el, v => { icon_ = v; preview() })
  el.querySelector('[data-close2]').onclick = close
  on(el, '[data-mode]', 'click', (_, b) => {
    $$('[data-mode]', el).forEach(x => x.classList.toggle('active', x === b))
    $$('[data-pane]', el).forEach(p => p.hidden = p.dataset.pane !== b.dataset.mode)
    el.querySelector('#ci-create').hidden = b.dataset.mode !== 'new'
  })
  el.querySelector('#ci-pick').onclick = async () => { close(); await importMrpack() }
  el.querySelector('#ci-browse').onclick = () => { close(); navigate('discover', { type: 'modpack' }) }
  const drop = el.querySelector('#ci-drop')
  drop.ondragover = e => { e.preventDefault(); drop.style.borderColor = 'var(--accent)' }
  drop.ondrop = e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) { close(); importMrpack(window.axo.pathForFile(f)) } }

  const mcSel = el.querySelector('#ci-mc'), lvSel = el.querySelector('#ci-lv')
  async function fillMc() {
    let supported = null
    if (loader !== 'vanilla') supported = new Set(await call('versions:loaderGames', loader).catch(() => []))
    const list = mcAll.versions.filter(v => (showSnap || v.type === 'release') && (!supported || supported.has(v.id)))
    const prev = mcSel.value || preset.mcVersion
    mcSel.innerHTML = list.map(v => `<option value="${esc(v.id)}">${esc(v.id)}${v.type !== 'release' ? ` (${v.type === 'snapshot' ? t('снапшот') : v.type})` : ''}</option>`).join('') || `<option value="">${t('Нет версий')}</option>`
    if (list.some(v => v.id === prev)) mcSel.value = prev
    await fillLv()
  }
  async function fillLv() {
    el.querySelector('#ci-lv-wrap').hidden = loader === 'vanilla'
    if (loader === 'vanilla') return
    lvSel.innerHTML = `<option>${t('Загрузка…')}</option>`
    const list = await call('versions:loader', loader, mcSel.value).catch(() => [])
    lvSel.innerHTML = list.map(v => `<option value="${esc(v.id)}">${esc(v.id)}${v.stable ? ' ★' : ''}</option>`).join('') || `<option value="">${t('Нет версий')}</option>`
    const stable = list.find(v => v.stable)
    if (stable) lvSel.value = stable.id
  }
  on(el, '[data-loader]', 'click', (_, b) => { loader = b.dataset.loader; $$('[data-loader]', el).forEach(x => x.classList.toggle('on', x === b)); fillMc() })
  mcSel.onchange = fillLv
  el.querySelector('#ci-snap').onchange = e => { showSnap = e.target.checked; fillMc() }
  await fillMc()

  el.querySelector('#ci-create').onclick = async () => {
    const name = el.querySelector('#ci-name').value.trim() || randomName()
    if (!mcSel.value || (loader !== 'vanilla' && !lvSel.value)) return toast(t('Выберите версию'), '', 'error')
    try {
      const inst = await call('instances:create', { name, icon: icon_, mcVersion: mcSel.value, loader, loaderVersion: loader === 'vanilla' ? '' : lvSel.value, group: el.querySelector('#ci-group').value.trim() })
      close()
      if (/herobrine/i.test(name)) { unlock('herobrine'); document.body.classList.add('herobrine'); toast(t('Хиробрин удалён'), t('…или нет?'), 'info', 'eye') }
      else toast(t('Сборка создана'), t('Файлы игры устанавливаются в фоне'), 'success')
      await refreshInstances()
      navigate('instance', { id: inst.id })
    } catch (e) { errToast(e) }
  }
}

export async function importMrpack(path) {
  try {
    const inst = await call('mrpack:import', path || null)
    if (!inst) return
    await refreshInstances()
    toast(t('Сборка импортирована'), inst.name, 'success')
    confetti(20)
    navigate('instance', { id: inst.id })
  } catch (e) { errToast(e, t('Импорт не удался')) }
}

export async function exportDialog(id) {
  const inst = await call('instances:get', id)
  const tree = await call('instances:tree', id)
  const defaults = new Set(['mods', 'config', 'resourcepacks', 'shaderpacks', 'options.txt', 'defaultconfigs', 'kubejs', 'servers.dat'])
  const { el, close } = modal({
    title: t('Экспорт в .mrpack'), wide: true,
    body: `
      <div class="row"><label class="field grow">${t('Название')}<input class="input" id="ex-name" value="${esc(inst.modpack?.name || inst.name)}"></label>
      <label class="field" style="width:140px">${t('Версия')}<input class="input" id="ex-ver" value="${esc(inst.modpack?.version || '1.0.0')}"></label></div>
      <label class="field">${t('Описание')}<input class="input" id="ex-sum" value="${esc(inst.modpack?.summary || '')}" placeholder="${t('Коротко о сборке')}"></label>
      <div class="field" style="font-weight:600;font-size:13px">${t('Что включить')}</div>
      <div class="tree">${tree.map(n => `
        <label><input type="checkbox" data-path="${esc(n.path)}" ${defaults.has(n.path) ? 'checked' : ''}>${icon(n.dir ? 'folder' : 'file', 'tree-ic')} ${esc(n.path)}${n.dir ? ` <span class="dim">(${n.children.length})</span>` : ''}</label>
        ${n.dir && n.children.length && n.children.length <= 400 ? `<div class="children" hidden>${n.children.map(c => `<label><input type="checkbox" data-path="${esc(c)}" data-parent="${esc(n.path)}" ${defaults.has(n.path) ? 'checked' : ''}>${esc(c.split('/').pop())}</label>`).join('')}</div>` : ''}`).join('')}
      </div>
      <p class="dim" style="margin:0;font-size:12px">${t('Моды, ресурспаки и шейдеры с Modrinth попадут в манифест ссылками, остальное — в overrides. Двойной клик по папке раскрывает её.')}</p>`,
    foot: `<button class="btn" data-c>${t('Отмена')}</button><button class="btn primary" id="ex-go">${icon('upload')}${t('Экспортировать')}</button>`,
  })
  el.querySelector('[data-c]').onclick = close
  on(el, '.tree > label', 'dblclick', (e, l) => { const ch = l.nextElementSibling; if (ch?.classList.contains('children')) ch.hidden = !ch.hidden })
  on(el, 'input[data-path]', 'change', (e, cb) => {
    if (!cb.dataset.parent) $$(`input[data-parent="${CSS.escape(cb.dataset.path)}"]`, el).forEach(c => c.checked = cb.checked)
  })
  el.querySelector('#ex-go').onclick = async () => {
    const include = []
    for (const cb of $$('.tree > label > input', el)) {
      const kids = $$(`input[data-parent="${CSS.escape(cb.dataset.path)}"]`, el)
      if (kids.length && kids.some(k => k.checked) && !kids.every(k => k.checked)) include.push(...kids.filter(k => k.checked).map(k => k.dataset.path))
      else if (cb.checked) include.push(cb.dataset.path)
    }
    if (!include.length) return toast(t('Ничего не выбрано'), '', 'error')
    close()
    try {
      const r = await call('mrpack:export', id, { name: el.querySelector('#ex-name').value, version: el.querySelector('#ex-ver').value, summary: el.querySelector('#ex-sum').value, include })
      if (r) { toast(t('Сборка экспортирована'), t('{a} файлов с Modrinth, {b} в overrides', { a: r.fromModrinth, b: r.overrides }), 'success'); confetti(15) }
    } catch (e) { errToast(e, t('Экспорт не удался')) }
  }
}

/** Установить проект Modrinth: для сборок — новый инстанс, для остального — выбор сборки */
export async function installFlow(project, versionId) {
  const type = project.project_type
  if (type === 'modpack') {
    try {
      toast(t('Устанавливаю сборку'), project.title, 'info', 'package')
      const inst = await call('modrinth:installModpack', project.id || project.project_id, versionId)
      await refreshInstances()
      toast(t('Сборка готова'), inst.name, 'success')
      confetti(25)
      navigate('instance', { id: inst.id })
    } catch (e) { errToast(e, t('Не удалось установить сборку')) }
    return
  }
  const target = state.route.params?.target
  if (target && !versionId) return installInto(target, project)
  const gv = project.game_versions || project.versions || []
  const ld = project.loaders || project.categories || []
  const compat = i => {
    if (gv.length && !gv.includes(i.mcVersion)) return false
    if (type === 'mod' && i.loader !== 'vanilla') return ld.includes(i.loader) || (i.loader === 'quilt' && ld.includes('fabric'))
    if (type === 'mod') return false
    return true
  }
  const list = [...state.instances].sort((a, b) => compat(b) - compat(a))
  const { el, close } = modal({
    title: t('Установить «{name}»', { name: project.title }),
    body: list.length ? `<div class="col" style="gap:2px">${list.map(i => `
      <div class="inst-choice ${compat(i) ? '' : 'incompatible'}" data-id="${esc(i.id)}">${instIcon(i)}<div class="grow"><div style="font-weight:700">${esc(i.name)}</div><div class="dim" style="font-size:12px">${LOADERS[i.loader]} ${esc(i.mcVersion)}</div></div>${compat(i) ? `<button class="btn sm primary">${icon('download')}${t('Установить')}</button>` : `<span class="dim" style="font-size:12px">${t('несовместимо')}</span>`}</div>`).join('')}</div>`
      : `<div class="empty" style="padding:20px">${t('Сначала создайте сборку')}</div>`,
    foot: `<button class="btn" id="if-new">${icon('plus')}${t('Новая сборка под этот проект')}</button>`,
  })
  on(el, '.inst-choice', 'click', async (_, row) => { close(); await installInto(row.dataset.id, project, versionId) })
  el.querySelector('#if-new').onclick = () => {
    close()
    const loaders = (project.loaders || project.categories || []).filter(l => LOADERS[l])
    const mc = (project.game_versions || project.versions || []).filter(v => /^\d/.test(v)).at(-1)
    openCreate({ name: project.title, loader: loaders[0] || 'fabric', mcVersion: mc })
  }
}

export async function installInto(instId, project, versionId) {
  const pid = project.id || project.project_id
  let world
  if (project.project_type === 'datapack') {
    const worlds = await call('instances:worlds', instId)
    if (!worlds.length) return toast(t('Нет миров'), t('Датапаки ставятся в мир. Сначала создайте мир в игре.'), 'error')
    world = await new Promise(resolve => {
      const { el, close } = modal({ title: t('В какой мир?'), body: worlds.map(w => `<div class="inst-choice" data-w="${esc(w.name)}">${icon('globe')} ${esc(w.name)}</div>`).join(''), onClose: () => resolve(null) })
      on(el, '[data-w]', 'click', (_, r) => { const v = r.dataset.w; close(); resolve(v) })
    })
    if (!world) return
  }
  try {
    const installed = await call('modrinth:install', instId, pid, { versionId, world, force: !!versionId })
    if (!installed.length) toast(t('Уже установлено'), project.title, 'info')
    else toast(t('Установлено'), installed.length > 1 ? t('{a} + зависимости: {b}', { a: installed[0], b: installed.slice(1).join(', ') }) : installed[0], 'success')
    document.dispatchEvent(new CustomEvent('content-changed', { detail: instId }))
    return true
  } catch (e) { errToast(e, t('Не удалось установить')); return false }
}

export async function accountMenu() {
  const { refreshAccounts } = await import('./core.js')
  const render_ = () => {
    const accs = state.accounts.accounts
    return `${accs.length ? accs.map(a => `
      <div class="acc-row ${a.id === state.accounts.active ? 'active' : ''}">
        <img src="https://mc-heads.net/avatar/${esc(a.type === 'msa' ? a.id : a.name)}/36" alt="">
        <div class="grow"><div style="font-weight:700">${esc(a.name)}</div><div class="dim" style="font-size:12px">${a.type === 'msa' ? 'Microsoft' : t('Офлайн')}</div></div>
        ${a.id === state.accounts.active ? `<span class="chip accent">${t('Активный')}</span>` : `<button class="btn sm" data-use="${a.id}">${t('Выбрать')}</button>`}
        <button class="btn sm icon ghost" data-del="${a.id}" data-tip="${t('Удалить')}">${icon('trash')}</button>
      </div>`).join('') : `<p class="muted">${t('Аккаунтов пока нет.')}</p>`}
      <hr class="sep">
      <button class="btn primary" id="acc-ms" style="width:100%">${icon('shield')}${t('Войти через Microsoft')}</button>
      <div class="row"><input class="input grow" id="acc-name" placeholder="${t('Ник для офлайн-игры')}" maxlength="16"><button class="btn" id="acc-off">${icon('plus')}${t('Офлайн')}</button></div>`
  }
  const { el } = modal({ title: t('Аккаунты'), body: render_() })
  const body = el.querySelector('.modal-body')
  const rerender = async () => { await refreshAccounts(); body.innerHTML = render_() }
  on(body, '[data-use]', 'click', async (_, b) => { await call('accounts:setActive', b.dataset.use); rerender() })
  on(body, '[data-del]', 'click', async (_, b) => { await call('accounts:remove', b.dataset.del); rerender() })
  on(body, '#acc-ms', 'click', async () => {
    try { await call('accounts:addMicrosoft'); await rerender(); toast(t('Вход выполнен'), '', 'success') } catch (e) { errToast(e, t('Вход не удался')) }
  })
  const off = async () => {
    try { await call('accounts:addOffline', body.querySelector('#acc-name').value); await rerender(); toast(t('Аккаунт добавлен'), '', 'success') } catch (e) { errToast(e) }
  }
  on(body, '#acc-off', 'click', off)
  on(body, '#acc-name', 'keydown', e => { if (e.key === 'Enter') off() })
}
