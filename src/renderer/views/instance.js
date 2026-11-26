import { call, esc, icon, on, $, $$, instIcon, fmtTime, fmtAgo, fmtSize, toast, errToast, LOADERS, lightbox, modal, contextMenu, t } from '../ui.js'
import { state, registerView, navigate, refreshInstances, isRunning, taskFor, chrome } from '../core.js'
import { play, exportDialog, deleteInstance, instanceMenu, iconPicker, bindIconPicker } from '../actions.js'
import { randomName } from '../fun.js'

const CT = { mod: ['Моды', 'box'], resourcepack: ['Ресурспаки', 'image'], shader: ['Шейдеры', 'sun'] }

registerView('instance', async (el, params) => {
  let inst = await call('instances:get', params.id)
  const tab = params.tab || 'content'
  const cleanups = []

  const header = () => {
    const run = isRunning(inst.id), tk = taskFor(inst.id)
    return `
      <div class="inst-head">
        <div id="ih-icon" data-tip="${t('Сменить иконку')}">${instIcon(inst)}</div>
        <div class="grow">
          <h1>${esc(inst.name)}</h1>
          <div class="row wrap" style="gap:8px">
            <span class="chip">${icon(inst.loader)}${LOADERS[inst.loader]} ${esc(inst.loaderVersion)}</span>
            <span class="chip">${icon('box')}Minecraft ${esc(inst.mcVersion)}</span>
            <span class="chip">${icon('clock')}${fmtTime(inst.playtime || 0)}</span>
            <span class="chip">${icon('calendar')}${inst.lastPlayed ? fmtAgo(inst.lastPlayed) : t('не запускалась')}</span>
            ${inst.modpack ? `<span class="chip accent">${icon('package')}${esc(inst.modpack.name)} ${esc(inst.modpack.version || '')}</span>` : ''}
            ${inst.group ? `<span class="chip">${icon('tag')}${esc(inst.group)}</span>` : ''}
          </div>
          ${tk ? `<div style="margin-top:10px;max-width:420px"><div class="dim" style="font-size:12px;margin-bottom:4px">${esc(tk.status)}</div><div class="row" style="gap:8px"><div class="progress grow"><div style="width:${tk.progress * 100}%"></div></div><button class="btn sm ghost" data-cancel="${tk.id}">${icon('x')}${t('Отменить')}</button></div></div>` : ''}
        </div>
        <div class="row">
          <button class="btn ${run ? 'stop' : 'play'}" id="ih-play" style="height:44px;padding:0 24px" ${tk ? 'disabled' : ''}>${icon(run ? 'stop' : 'play')}${run ? t('Остановить') : tk ? t('Установка…') : t('Играть')}</button>
          <button class="btn icon" id="ih-folder" data-tip="${t('Открыть папку')}" style="height:44px;width:44px">${icon('folder')}</button>
          <button class="btn icon" id="ih-export" data-tip="${t('Экспорт .mrpack')}" style="height:44px;width:44px">${icon('upload')}</button>
          <button class="btn icon" id="ih-more" style="height:44px;width:44px">${icon('more')}</button>
        </div>
      </div>`
  }

  el.innerHTML = `
    <div id="ih">${header()}</div>
    <div class="tabs" style="margin-bottom:18px">
      ${[['content', t('Контент'), 'box'], ['worlds', t('Миры'), 'world'], ['screenshots', t('Скриншоты'), 'image'], ['logs', t('Логи'), 'terminal'], ['settings', t('Настройки'), 'settings']]
        .map(([k, n, ic]) => `<button class="tab ${k === tab ? 'active' : ''}" data-itab="${k}">${icon(ic)}${n}</button>`).join('')}
    </div>
    <div id="itab"></div>`

  const bindHeader = () => {
    $('#ih-play', el).onclick = () => play(inst.id)
    $('#ih-folder', el).onclick = () => call('instances:openFolder', inst.id)
    $('#ih-export', el).onclick = () => exportDialog(inst.id)
    $('#ih-more', el).onclick = e => { const r = e.currentTarget.getBoundingClientRect(); instanceMenu(r.left - 160, r.bottom + 6, inst) }
    $('#ih-icon', el).onclick = e => {
      const r = e.currentTarget.getBoundingClientRect()
      contextMenu(r.left, r.bottom + 6, [
        { icon: 'image', label: t('Выбрать картинку…'), action: async () => { const r = await call('instances:pickIcon', inst.id); if (r) { inst = r; redrawHeader(); refreshInstances() } } },
        { icon: 'x', label: t('Сбросить иконку'), action: async () => { inst = await call('instances:update', inst.id, { icon: '' }); redrawHeader(); refreshInstances() } },
      ])
    }
  }
  const redrawHeader = () => { $('#ih', el).innerHTML = header(); bindHeader() }
  bindHeader()
  const onState = async () => { inst = await call('instances:get', inst.id); redrawHeader() }
  document.addEventListener('running-changed', onState)
  document.addEventListener('tasks-changed', redrawHeader)
  cleanups.push(() => { document.removeEventListener('running-changed', onState); document.removeEventListener('tasks-changed', redrawHeader) })

  let tabCleanup = null
  async function showTab(name) {
    tabCleanup?.(); tabCleanup = null
    state.route.params.tab = name
    $$('[data-itab]', el).forEach(b => b.classList.toggle('active', b.dataset.itab === name))
    const box = $('#itab', el)
    box.innerHTML = '<div class="spinner"></div>'
    tabCleanup = await TABS[name](box, inst, v => { inst = v; redrawHeader(); chrome() }, params) || null
  }
  on(el, '[data-itab]', 'click', (_, b) => showTab(b.dataset.itab))
  // рендер вкладки после того, как элемент окажется в DOM
  setTimeout(() => showTab(tab), 0)
  return () => { tabCleanup?.(); cleanups.forEach(f => f()) }
})

const TABS = {
  async content(box, inst, setInst, params) {
    let type = params.contentType || (inst.loader === 'vanilla' ? 'resourcepack' : 'mod')
    let updates = {}
    let q = ''
    const types = Object.entries(CT).filter(([k]) => k !== 'mod' || inst.loader !== 'vanilla')
    box.innerHTML = `
      <div class="row between wrap" style="margin-bottom:14px">
        <div class="tabs">${types.map(([k, [n, ic]]) => `<button class="tab ${k === type ? 'active' : ''}" data-ct="${k}">${icon(ic)}${t(n)} <span class="dim" data-count="${k}"></span></button>`).join('')}</div>
        <div class="row">
          <button class="btn" id="c-upd">${icon('refresh')}${t('Проверить обновления')}</button>
          <button class="btn" id="c-file" data-tip="${t('Добавить файлы с диска')}">${icon('upload')}</button>
          <button class="btn" id="c-folder" data-tip="${t('Открыть папку')}">${icon('folder')}</button>
          <button class="btn primary" id="c-add">${icon('plus')}${t('Добавить')}</button>
        </div>
      </div>
      <div class="search" style="margin-bottom:10px">${icon('search')}<input class="input" id="c-q" placeholder="${t('Фильтр…')}"></div>
      <div id="c-list" class="panel" style="padding:6px"></div>`

    async function draw() {
      const list = await call('instances:content', inst.id, type)
      const listEl = $('#c-list', box)
      if (!listEl) return
      const shown = list.filter(c => !q || (c.title || c.name).toLowerCase().includes(q))
      $(`[data-count="${type}"]`, box).textContent = list.length || ''
      const updN = Object.keys(updates).filter(k => k.startsWith(type === 'mod' ? 'mods/' : type === 'shader' ? 'shaderpacks/' : 'resourcepacks/')).length
      $('#c-upd', box).innerHTML = updN ? `${icon('download')}${t('Обновить всё ({n})', { n: updN })}` : `${icon('refresh')}${t('Проверить обновления')}`
      $('#c-upd', box).classList.toggle('primary', !!updN)
      listEl.innerHTML = shown.length ? shown.map(c => `
        <div class="content-row ${c.enabled ? '' : 'off'}" data-file="${esc(c.file)}">
          ${c.icon ? `<img src="${esc(c.icon)}" loading="lazy">` : `<div class="ph">${icon(CT[type][1])}</div>`}
          <div style="min-width:0">
            <div class="n" ${c.projectId ? `data-pid="${esc(c.projectId)}" data-url="${esc(c.url || '')}" style="cursor:pointer"` : ''}>${c.source === 'curseforge' ? '<span class="cf-dot" data-tip="CurseForge"></span>' : ''}${esc(c.title || c.name)}</div>
            <div class="f">${c.versionNumber ? esc(c.versionNumber) + ' · ' : ''}${esc(c.file)} · ${fmtSize(c.size)}</div>
          </div>
          <div class="row" style="gap:6px">${updates[c.rel] ? `<button class="chip click update-badge" data-update="${esc(c.rel)}">${icon('download')}${esc(updates[c.rel].versionNumber)}</button>` : ''}</div>
          <div class="row" style="gap:4px">
            <label class="toggle" data-tip="${c.enabled ? t('Выключить') : t('Включить')}"><input type="checkbox" data-toggle="${esc(c.file)}" ${c.enabled ? 'checked' : ''}><span></span></label>
            <button class="btn sm icon ghost" data-del="${esc(c.file)}" data-tip="${t('Удалить')}">${icon('trash')}</button>
          </div>
        </div>`).join('')
        : `<div class="empty"><div class="big">${icon(type === 'mod' ? 'puzzle' : type === 'shader' ? 'sun' : 'palette')}</div>${q ? t('Ничего не найдено') : t('Пусто. Нажмите «Добавить» или перетащите файлы сюда.')}</div>`
      if (list.some(c => !c.projectId && !c.isDir) && !draw.identified) {
        draw.identified = true
        call('modrinth:identify', inst.id).then(n => { if (n) draw() }).catch(() => {})
      }
    }
    draw()
    // счётчики других типов
    for (const [k] of types) if (k !== type) call('instances:content', inst.id, k).then(l => { const c = $(`[data-count="${k}"]`, box); if (c) c.textContent = l.length || '' })

    on(box, '[data-ct]', 'click', (_, b) => { type = b.dataset.ct; state.route.params.contentType = type; $$('[data-ct]', box).forEach(x => x.classList.toggle('active', x === b)); draw() })
    $('#c-q', box).oninput = e => { q = e.target.value.toLowerCase(); draw() }
    on(box, '[data-toggle]', 'change', async (_, cb) => { await call('instances:toggle', inst.id, type, cb.dataset.toggle); draw() })
    on(box, '[data-del]', 'click', async (_, b) => { await call('instances:removeContent', inst.id, type, b.dataset.del); toast(t('Удалено (в корзину)'), b.dataset.del, 'success'); draw() })
    on(box, '[data-pid]', 'click', (_, n) => n.dataset.pid.startsWith('cf:') ? (n.dataset.url && call('app:openExternal', n.dataset.url)) : navigate('project', { id: n.dataset.pid, target: inst.id }))
    on(box, '[data-update]', 'click', async (_, b) => {
      const rel = b.dataset.update
      await call('modrinth:applyUpdates', inst.id, { [rel]: updates[rel] }).catch(errToast)
      delete updates[rel]; draw()
    })
    $('#c-add', box).onclick = () => import('../sources.js').then(m => m.chooseSource(inst.id, type))
    $('#c-file', box).onclick = async () => { await call('instances:addFiles', inst.id, type); draw() }
    $('#c-folder', box).onclick = () => call('instances:openFolder', inst.id, { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' }[type])
    $('#c-upd', box).onclick = async e => {
      const b = e.currentTarget
      const pending = Object.keys(updates).length
      b.disabled = true
      try {
        if (pending) {
          await call('modrinth:applyUpdates', inst.id, updates)
          toast(t('Обновлено'), t('Файлов: {n}', { n: pending }), 'success')
          updates = {}
        } else {
          b.innerHTML = `${icon('refresh')}${t('Проверяю…')}`
          updates = await call('modrinth:checkUpdates', inst.id)
          const n = Object.keys(updates).length
          toast(n ? t('Доступно обновлений: {n}', { n }) : t('Всё актуально'), '', n ? 'info' : 'success', n ? 'arrowUp' : 'sparkles')
        }
      } catch (er) { errToast(er) } finally { b.disabled = false; draw() }
    }
    const onChanged = e => { if (e.detail === inst.id) draw() }
    document.addEventListener('content-changed', onChanged)
    return () => document.removeEventListener('content-changed', onChanged)
  },

  async worlds(box, inst) {
    const worlds = await call('instances:worlds', inst.id)
    box.innerHTML = `
      <div class="row between" style="margin-bottom:14px"><span class="muted">${t('Миров: {n}', { n: worlds.length })}</span><button class="btn" id="w-open">${icon('folder')}${t('Папка миров')}</button></div>
      ${worlds.length ? `<div class="worlds">${worlds.map(w => `
        <div class="world">${w.icon ? `<img src="axo://inst/${encodeURIComponent(inst.id)}/${w.icon.split('/').map(encodeURIComponent).join('/')}">` : `<div class="ph">${icon('globe')}</div>`}
        <div class="grow" style="min-width:0"><div style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.name)}</div><div class="dim" style="font-size:12px">${fmtAgo(w.mtime)}</div></div>
        <button class="btn sm icon ghost" data-wopen="${esc(w.name)}" data-tip="${t('Открыть папку')}">${icon('folder')}</button></div>`).join('')}</div>`
      : `<div class="empty"><div class="big">${icon('globe')}</div>${t('Миров пока нет — зайдите в игру и создайте первый!')}</div>`}`
    $('#w-open', box).onclick = () => call('instances:openFolder', inst.id, 'saves')
    on(box, '[data-wopen]', 'click', (_, b) => call('instances:openFolder', inst.id, 'saves/' + b.dataset.wopen))
  },

  async screenshots(box, inst) {
    const shots = await call('instances:screenshots', inst.id)
    box.innerHTML = `
      <div class="row between" style="margin-bottom:14px"><span class="muted">${t('Скриншотов: {n} · F2 в игре', { n: shots.length })}</span><button class="btn" id="s-open">${icon('folder')}${t('Открыть папку')}</button></div>
      ${shots.length ? `<div class="shots">${shots.map(s => `<img loading="lazy" data-shot src="axo://inst/${encodeURIComponent(inst.id)}/screenshots/${encodeURIComponent(s.name)}">`).join('')}</div>`
      : `<div class="empty"><div class="big">${icon('camera')}</div>${t('Нажмите F2 в игре, чтобы сделать скриншот')}</div>`}`
    $('#s-open', box).onclick = () => call('instances:openFolder', inst.id, 'screenshots')
    on(box, '[data-shot]', 'click', (_, img) => lightbox(img.src))
  },

  async logs(box, inst) {
    const live = isRunning(inst.id)
    let lines = live ? (state.logs[inst.id]?.length ? state.logs[inst.id] : await call('game:logs', inst.id)) : (await call('instances:readLog', inst.id)).split(/\r?\n/)
    let filter = ''
    let auto = true
    box.innerHTML = `
      <div class="row wrap" style="margin-bottom:10px">
        <span class="chip ${live ? 'accent' : ''}">${live ? '● Live' : 'latest.log'}</span>
        <div class="search grow">${icon('search')}<input class="input" id="l-f" placeholder="${t('Фильтр строк…')}"></div>
        <label class="row" style="gap:6px;cursor:pointer"><span class="toggle"><input type="checkbox" id="l-auto" checked><span></span></span><span class="muted">${t('Автопрокрутка')}</span></label>
        <button class="btn primary" id="l-doc" data-tip="${t('Найти причину вылета и починить сборку')}">${icon('wrench')}${t('Доктор')}</button>
        <button class="btn" id="l-copy">${icon('copy')}${t('Копировать')}</button>
        <button class="btn" id="l-folder">${icon('folder')}${t('Логи')}</button>
        <button class="btn" id="l-crash">${icon('alert')}${t('Краш-репорты')}</button>
      </div>
      <div class="console" id="l-out"></div>`
    const out = $('#l-out', box)
    const cls = l => /\b(ERROR|FATAL|Exception|Caused by)\b/.test(l) ? 'l-err' : /\bWARN\b/.test(l) ? 'l-warn' : 'l-info'
    const draw = () => {
      const shown = filter ? lines.filter(l => l.toLowerCase().includes(filter)) : lines
      out.innerHTML = shown.slice(-3000).map(l => `<div class="${cls(l)}">${esc(l)}</div>`).join('') || `<span class="dim">${t('Логов пока нет. Запустите игру!')}</span>`
      if (auto) out.scrollTop = out.scrollHeight
    }
    draw()
    $('#l-f', box).oninput = e => { filter = e.target.value.toLowerCase(); draw() }
    $('#l-auto', box).onchange = e => { auto = e.target.checked }
    $('#l-copy', box).onclick = () => { navigator.clipboard.writeText(lines.join('\n')); toast(t('Скопировано'), t('Строк: {n}', { n: lines.length }), 'success') }
    $('#l-doc', box).onclick = () => import('../doctor.js').then(m => m.openDoctor(inst.id))
    $('#l-folder', box).onclick = () => call('instances:openFolder', inst.id, 'logs')
    $('#l-crash', box).onclick = () => call('instances:openFolder', inst.id, 'crash-reports')
    const onLog = e => {
      if (e.detail.id !== inst.id) return
      if (!live) { lines = []; }
      lines = state.logs[inst.id] || lines
      if (filter) return draw()
      const frag = e.detail.lines.map(l => `<div class="${cls(l)}">${esc(l)}</div>`).join('')
      out.insertAdjacentHTML('beforeend', frag)
      while (out.childElementCount > 3000) out.firstElementChild.remove()
      if (auto) out.scrollTop = out.scrollHeight
    }
    document.addEventListener('game-log', onLog)
    return () => document.removeEventListener('game-log', onLog)
  },

  async settings(box, inst, setInst) {
    const g = state.settings
    const s = inst.settings || {}
    const mcAll = await call('versions:minecraft').catch(() => ({ versions: [] }))
    box.innerHTML = `
      <div class="settings-grid">
        <div class="card"><h2>${t('Основное')}</h2>
          <label class="field">${t('Название')}<div class="row"><input class="input grow" id="s-name" value="${esc(inst.name)}"><button class="btn icon" id="s-dice" data-tip="${t('Случайное имя')}">${icon('dice')}</button></div></label>
          <label class="field" style="margin-top:12px">${t('Группа')}<input class="input" id="s-group" value="${esc(inst.group || '')}" placeholder="${t('Без группы')}"></label>
          <div class="field" style="margin-top:12px">${t('Иконка')}<span class="hint">${t('Свою картинку можно выбрать, кликнув по иконке сверху')}</span>${iconPicker(inst.icon?.startsWith('i:') ? inst.icon : '')}</div>
          <label class="field" style="margin-top:12px">${t('Заметки')}<textarea class="input" id="s-notes" rows="3" placeholder="${t('Сид мира, IP сервера, список дел…')}">${esc(inst.notes || '')}</textarea></label>
        </div>
        <div class="card"><h2>${t('Версия')}</h2>
          <label class="field">${t('Загрузчик')}<select class="select" id="s-loader">${Object.entries(LOADERS).map(([k, v]) => `<option value="${k}" ${k === inst.loader ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field" style="margin-top:12px">Minecraft<select class="select" id="s-mc"></select></label>
          <label class="field" style="margin-top:12px" id="s-lv-wrap">${t('Версия загрузчика')}<select class="select" id="s-lv"></select></label>
          <div class="row" style="margin-top:14px"><button class="btn primary" id="s-ver-save">${icon('check')}${t('Применить версию')}</button><button class="btn" id="s-repair">${icon('wrench')}${t('Починить')}</button></div>
          <p class="dim" style="font-size:12px;margin-bottom:0">${t('Смена версии не удаляет моды, но несовместимые нужно будет обновить.')}</p>
        </div>
        <div class="card"><h2>${t('Java и память')}</h2>
          <div class="setting"><div><div class="t">${t('Свои настройки')}</div><div class="d">${t('Иначе — глобальные из настроек лаунчера')}</div></div><label class="toggle"><input type="checkbox" id="s-ovr-java" ${s.memory || s.javaPath || s.jvmArgs ? 'checked' : ''}><span></span></label></div>
          <div id="s-java-box">
            <label class="field">${t('Память:')} <span id="s-mem-v"></span><input type="range" id="s-mem" min="512" max="32768" step="256" value="${(s.memory || g.memory).max}"></label>
            <label class="field" style="margin-top:12px">${t('Путь к Java')}<span class="hint">${t('Пусто — автоматически (Java {v})', { v: inst.javaMajor || '?' })}</span><div class="row"><input class="input grow" id="s-java" value="${esc(s.javaPath || '')}" placeholder="${t('Автоматически')}"><button class="btn" id="s-java-pick">${icon('folder')}</button><button class="btn" id="s-java-test">${t('Тест')}</button></div></label>
            <label class="field" style="margin-top:12px">${t('Аргументы JVM')}<input class="input" id="s-jvm" value="${esc(s.jvmArgs || '')}" placeholder="-XX:+UseG1GC"></label>
          </div>
        </div>
        <div class="card"><h2>${t('Окно игры')}</h2>
          <div class="setting"><div><div class="t">${t('Свои настройки окна')}</div></div><label class="toggle"><input type="checkbox" id="s-ovr-win" ${s.window ? 'checked' : ''}><span></span></label></div>
          <div id="s-win-box">
            <div class="row"><label class="field grow">${t('Ширина')}<input class="input" type="number" id="s-w" value="${(s.window || g.window).width}"></label><label class="field grow">${t('Высота')}<input class="input" type="number" id="s-h" value="${(s.window || g.window).height}"></label></div>
            <div class="setting"><div class="t">${t('Полный экран')}</div><label class="toggle"><input type="checkbox" id="s-fs" ${(s.window || g.window).fullscreen ? 'checked' : ''}><span></span></label></div>
          </div>
        </div>
        <div class="card"><h2>${t('Хуки и окружение')}</h2>
          <label class="field">${t('Перед запуском')}<span class="hint">${t('Команда выполняется в папке сборки')}</span><input class="input" id="s-pre" value="${esc(s.hooks?.pre || '')}"></label>
          <label class="field" style="margin-top:12px">${t('После выхода')}<input class="input" id="s-post" value="${esc(s.hooks?.post || '')}"></label>
          <label class="field" style="margin-top:12px">${t('Переменные окружения')}<span class="hint">${t('KEY=VALUE, по одной на строку')}</span><textarea class="input" id="s-env" rows="3">${esc(s.env || '')}</textarea></label>
        </div>
        <div class="card"><h2>${t('Опасная зона')}</h2>
          <div class="setting"><div><div class="t">${t('Дублировать сборку')}</div><div class="d">${t('Копия со всеми модами и мирами')}</div></div><button class="btn" id="s-dup">${icon('copy')}${t('Копировать')}</button></div>
          <div class="setting"><div><div class="t">${t('Удалить сборку')}</div><div class="d">${t('Будет перемещена в корзину')}</div></div><button class="btn danger" id="s-del">${icon('trash')}${t('Удалить')}</button></div>
        </div>
      </div>
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn primary" id="s-save">${icon('check')}${t('Сохранить')}</button></div>`

    const mem = $('#s-mem', box)
    const memV = () => $('#s-mem-v', box).textContent = (mem.value / 1024).toFixed(1) + t(' ГБ')
    mem.oninput = memV; memV()
    let pickedIcon
    bindIconPicker(box, v => { pickedIcon = v })
    const sync = () => {
      $('#s-java-box', box).style.opacity = $('#s-ovr-java', box).checked ? 1 : .4
      $('#s-win-box', box).style.opacity = $('#s-ovr-win', box).checked ? 1 : .4
    }
    $('#s-ovr-java', box).onchange = sync; $('#s-ovr-win', box).onchange = sync; sync()
    $('#s-dice', box).onclick = () => $('#s-name', box).value = randomName()
    $('#s-java-pick', box).onclick = async () => { const p = await call('java:pick'); if (p) $('#s-java', box).value = p }
    $('#s-java-test', box).onclick = async () => {
      const p = $('#s-java', box).value
      if (!p) return toast(t('Путь пуст'), t('Будет выбрана Java автоматически'), 'info')
      const r = await call('java:test', p)
      r ? toast(t('Java работает'), t('Версия {v}', { v: r.version }), 'success') : toast(t('Java не найдена'), p, 'error')
    }

    const loaderSel = $('#s-loader', box), mcSel = $('#s-mc', box), lvSel = $('#s-lv', box)
    async function fillMc() {
      const l = loaderSel.value
      const supported = l === 'vanilla' ? null : new Set(await call('versions:loaderGames', l).catch(() => []))
      const list = mcAll.versions.filter(v => (v.type === 'release' || v.id === inst.mcVersion || g.showSnapshots) && (!supported || supported.has(v.id)))
      mcSel.innerHTML = list.map(v => `<option ${v.id === inst.mcVersion ? 'selected' : ''}>${esc(v.id)}</option>`).join('')
      await fillLv()
    }
    async function fillLv() {
      const l = loaderSel.value
      $('#s-lv-wrap', box).hidden = l === 'vanilla'
      if (l === 'vanilla') return
      const list = await call('versions:loader', l, mcSel.value).catch(() => [])
      lvSel.innerHTML = list.map(v => `<option value="${esc(v.id)}">${esc(v.id)}${v.stable ? ' ★' : ''}</option>`).join('')
      if (l === inst.loader && mcSel.value === inst.mcVersion && list.some(v => v.id === inst.loaderVersion)) lvSel.value = inst.loaderVersion
      else { const st = list.find(v => v.stable); if (st) lvSel.value = st.id }
    }
    loaderSel.onchange = fillMc; mcSel.onchange = fillLv
    fillMc()

    $('#s-ver-save', box).onclick = async () => {
      const patch = { loader: loaderSel.value, mcVersion: mcSel.value, loaderVersion: loaderSel.value === 'vanilla' ? '' : lvSel.value }
      if (patch.loader === inst.loader && patch.mcVersion === inst.mcVersion && patch.loaderVersion === inst.loaderVersion) return toast(t('Версия не изменилась'), '', 'info')
      try { setInst(await call('instances:update', inst.id, patch)); await refreshInstances(); toast(t('Версия изменена'), t('Переустанавливаю файлы игры…'), 'success') } catch (e) { errToast(e) }
    }
    $('#s-repair', box).onclick = () => { call('instances:repair', inst.id).then(() => toast(t('Сборка починена'), '', 'success')).catch(errToast) }
    $('#s-dup', box).onclick = async () => { const c = await call('instances:duplicate', inst.id); await refreshInstances(); navigate('instance', { id: c.id }) }
    $('#s-del', box).onclick = () => deleteInstance(inst)
    $('#s-save', box).onclick = async () => {
      const ovrJava = $('#s-ovr-java', box).checked, ovrWin = $('#s-ovr-win', box).checked
      const patch = {
        name: $('#s-name', box).value.trim() || inst.name,
        group: $('#s-group', box).value.trim(),
        notes: $('#s-notes', box).value,
        settings: {
          memory: ovrJava ? { min: Math.min(1024, Number(mem.value)), max: Number(mem.value) } : null,
          javaPath: ovrJava ? $('#s-java', box).value.trim() : '',
          jvmArgs: ovrJava ? $('#s-jvm', box).value : '',
          window: ovrWin ? { width: Number($('#s-w', box).value) || 1280, height: Number($('#s-h', box).value) || 720, fullscreen: $('#s-fs', box).checked } : null,
          hooks: { pre: $('#s-pre', box).value, post: $('#s-post', box).value },
          env: $('#s-env', box).value,
        },
      }
      if (pickedIcon !== undefined) patch.icon = pickedIcon
      try { setInst(await call('instances:update', inst.id, patch)); await refreshInstances(); toast(t('Сохранено'), '', 'success') } catch (e) { errToast(e) }
    }
  },
}
