import { call, esc, icon, on, $, $$, toast, errToast, fmtTime, setSounds, confirmDialog, t } from '../ui.js'
import { LANGS, setLang, fmtDate } from '../i18n.js'
import { state, registerView, saveSettings, render, chrome } from '../core.js'
import { THEMES, ACCENTS, FONTS, applyTheme, themeName } from '../themes.js'
import { logoSVG, logoPalette } from '../logo.js'
import { achievements, PET_COLORS, petName, axolotlSVG, unlock, confetti } from '../fun.js'
import { accountMenu } from '../actions.js'

const SECTIONS = () => [
  ['look', t('Внешний вид'), 'palette'], ['java', t('Java и память'), 'cpu'], ['launch', t('Запуск'), 'rocket'],
  ['fun', t('Приколюхи'), 'sparkles'], ['ach', t('Достижения'), 'trophy'], ['about', t('О программе'), 'info'],
]

registerView('settings', async (el, params) => {
  const sec = params.sec || 'look'
  el.innerHTML = `
    <h1 style="margin-bottom:18px">${t('Настройки')}</h1>
    <div class="settings-layout">
      <nav class="settings-nav">${SECTIONS().map(([k, n, ic]) => `<button data-sec="${k}" class="${k === sec ? 'active' : ''}">${icon(ic)}${n}</button>`).join('')}
        <button data-acc>${icon('user')}${t('Аккаунты')}</button></nav>
      <div id="sec"></div>
    </div>`
  const show = async k => {
    state.route.params.sec = k
    $$('[data-sec]', el).forEach(b => b.classList.toggle('active', b.dataset.sec === k))
    await SEC[k]($('#sec', el))
  }
  on(el, '[data-sec]', 'click', (_, b) => show(b.dataset.sec))
  on(el, '[data-acc]', 'click', () => accountMenu())
  await show(sec)
})

async function set(patch) {
  const s = await saveSettings(patch)
  applyTheme(s)
  return s
}
const toggleRow = (id, title, desc, val) => `<div class="setting"><div><div class="t">${title}</div>${desc ? `<div class="d">${desc}</div>` : ''}</div><label class="toggle"><input type="checkbox" id="${id}" ${val ? 'checked' : ''}><span></span></label></div>`

const SEC = {
  look(box) {
    const s = state.settings
    box.innerHTML = `
      <div class="card section"><h2 class="h-ic">${icon('languages')}${t('Язык')} · Language</h2>
        <div class="seg">${Object.entries(LANGS).map(([k, n]) => `<button class="${(s.language || 'ru') === k ? 'on' : ''}" data-lang="${k}">${n}</button>`).join('')}</div>
      </div>
      <div class="card section"><h2>${t('Тема')}</h2>
        <div class="themes">${Object.entries(THEMES).map(([k, th]) => `
          <button class="theme-card ${s.theme === k ? 'active' : ''}" data-theme="${k}">
            <div class="pv" style="background:${th.bg}"><span class="lg">${logoSVG(logoPalette(k), { full: false })}</span><i style="flex:1;background:${th.raised};display:flex;align-items:flex-end;padding:5px"><b style="display:block;width:60%;height:8px;border-radius:4px;background:${th.accent}"></b></i></div>
            <div class="nm">${esc(themeName(th))}</div>
          </button>`).join('')}</div>
      </div>
      <div class="card section"><h2>${t('Акцентный цвет')}</h2>
        <div class="row wrap"><div class="swatches">
          <div class="swatch ${!s.accent ? 'on' : ''}" data-accent="" style="background:conic-gradient(${THEMES[s.theme]?.accent || '#ff7ab8'} 0 50%, var(--surface) 0)" data-tip="${t('Как в теме')}"></div>
          ${ACCENTS.map(c => `<div class="swatch ${s.accent === c ? 'on' : ''}" data-accent="${c}" style="background:${c}"></div>`).join('')}
        </div><input type="color" id="l-color" value="${s.accent || THEMES[s.theme]?.accent || '#ff7ab8'}" data-tip="${t('Свой цвет')}"></div>
      </div>
      <div class="card section"><h2 class="h-ic">${icon('type')}${t('Шрифт')}</h2>
        <div class="fonts">${Object.entries(FONTS).map(([k, css]) => `
          <button class="font-card ${(FONTS[s.font] ? s.font : 'Manrope') === k ? 'active' : ''}" data-font="${esc(k)}" style="font-family:${esc(css)}">
            <span class="aa">Аа Bb</span><span class="fn">${esc(k)}</span>
          </button>`).join('')}</div>
      </div>
      <div class="card section"><h2>${t('Фон')}</h2>
        <div class="row wrap"><button class="btn" id="l-bg">${icon('image')}${t('Выбрать картинку')}</button>${s.background ? `<button class="btn ghost" id="l-bg-clear">${icon('x')}${t('Убрать фон')}</button>` : ''}</div>
        <div class="settings-grid" style="margin-top:12px">
          <label class="field">${t('Размытие:')} <span id="l-blur-v">${s.backgroundBlur}px</span><input type="range" id="l-blur" min="0" max="30" value="${s.backgroundBlur}"></label>
          <label class="field">${t('Затемнение:')} <span id="l-dim-v">${Math.round(s.backgroundDim * 100)}%</span><input type="range" id="l-dim" min="0" max="0.95" step="0.05" value="${s.backgroundDim}"></label>
        </div>
      </div>
      <div class="card section"><h2>${t('Интерфейс')}</h2>
        <label class="field">${t('Скругление углов:')} <span id="l-rad-v">${s.radius}px</span><input type="range" id="l-rad" min="0" max="24" value="${s.radius}"></label>
        ${toggleRow('l-compact', t('Компактный режим'), t('Меньше отступы и шрифт'), s.compact)}
        ${toggleRow('l-anim', t('Анимации'), t('Плавные переходы и эффекты'), s.animations !== false)}
        ${toggleRow('l-sounds', t('Звуки интерфейса'), t('Тихие «бульки» при нажатиях'), s.sounds !== false)}
      </div>
      <div class="card section"><h2>${t('Свой CSS')}</h2>
        <p class="muted" style="margin-top:0">${t('Полная свобода. Переменные:')} <code>--accent</code>, <code>--bg</code>, <code>--bg-raised</code>, <code>--radius</code>, <code>--font</code>…</p>
        <textarea class="input" id="l-css" rows="8" style="width:100%" placeholder=".inst-card { transform: rotate(1deg); }">${esc(s.customCss || '')}</textarea>
        <div class="row" style="margin-top:10px"><button class="btn primary" id="l-css-save">${icon('check')}${t('Применить')}</button><button class="btn ghost" id="l-reset">${icon('refresh')}${t('Сбросить всё оформление')}</button></div>
      </div>`
    on(box, '[data-lang]', 'click', async (_, b) => {
      await set({ language: b.dataset.lang })
      setLang(b.dataset.lang)
      document.getElementById('pet-slot').innerHTML = ''
      await render()
    })
    on(box, '[data-theme]', 'click', async (_, b) => { await set({ theme: b.dataset.theme }); unlock('stylist'); SEC.look(box) })
    on(box, '[data-accent]', 'click', async (_, b) => { await set({ accent: b.dataset.accent }); SEC.look(box) })
    on(box, '[data-font]', 'click', async (_, b) => { await set({ font: b.dataset.font }); SEC.look(box) })
    $('#l-color', box).onchange = async e => { await set({ accent: e.target.value }); SEC.look(box) }
    $('#l-bg', box).onclick = async () => { const s2 = await call('settings:pickBackground'); if (s2) { state.settings = s2; applyTheme(s2); SEC.look(box) } }
    if ($('#l-bg-clear', box)) $('#l-bg-clear', box).onclick = async () => { await set({ background: '' }); SEC.look(box) }
    const range = (id, key, fmt, num = Number) => {
      const r = $('#' + id, box)
      r.oninput = () => { $(`#${id}-v`, box).textContent = fmt(r.value); state.settings[key] = num(r.value); applyTheme(state.settings) }
      r.onchange = () => set({ [key]: num(r.value) })
    }
    range('l-blur', 'backgroundBlur', v => v + 'px')
    range('l-dim', 'backgroundDim', v => Math.round(v * 100) + '%')
    range('l-rad', 'radius', v => v + 'px')
    $('#l-compact', box).onchange = e => set({ compact: e.target.checked })
    $('#l-anim', box).onchange = e => set({ animations: e.target.checked })
    $('#l-sounds', box).onchange = e => { setSounds(e.target.checked); set({ sounds: e.target.checked }) }
    $('#l-css-save', box).onclick = async () => { const css = $('#l-css', box).value; await set({ customCss: css }); if (css.trim()) unlock('css_hacker'); toast(t('CSS применён'), '', 'success') }
    $('#l-reset', box).onclick = async () => {
      if (!await confirmDialog(t('Сбросить оформление?'), t('Тема, цвета, фон и CSS вернутся к стандартным.'))) return
      await set({ theme: 'axolotl', accent: '', background: '', backgroundBlur: 8, backgroundDim: 0.6, radius: 14, font: 'Manrope', compact: false, animations: true, customCss: '' })
      SEC.look(box)
    }
  },

  async java(box) {
    const s = state.settings
    const installed = await call('java:list').catch(() => [])
    const majors = [8, 17, 21, 25]
    box.innerHTML = `
      <div class="card section"><h2>${t('Память по умолчанию')}</h2>
        <label class="field">${t('Максимум:')} <span id="j-mem-v"></span><input type="range" id="j-mem" min="512" max="32768" step="256" value="${s.memory.max}"></label>
        <p class="dim" style="font-size:12px;margin-bottom:0">${t('Для ванильной игры хватит 2–4 ГБ, для больших сборок — 6–10 ГБ.')}</p>
      </div>
      <div class="card section"><h2>${t('Аргументы JVM')}</h2>
        <input class="input" id="j-args" style="width:100%" value="${esc(s.jvmArgs || '')}" placeholder="-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions">
        <div class="row wrap" style="margin-top:10px;gap:6px">
          <button class="chip click" data-preset="-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20">Aikar's flags</button>
          <button class="chip click" data-preset="-XX:+UseZGC -XX:+ZGenerational">ZGC</button>
          <button class="chip click" data-preset="">${t('Очистить')}</button>
        </div>
      </div>
      <div class="card section"><h2>${t('Установки Java')}</h2>
        ${toggleRow('j-auto', t('Автоустановка Java'), t('Лаунчер сам скачает нужную версию (Eclipse Temurin)'), s.autoJava !== false)}
        ${majors.map(m => {
          const inst = installed.find(j => j.major === m)
          return `<div class="setting"><div style="min-width:0;flex:1"><div class="t">Java ${m}</div><div class="d" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.java?.[m] || inst?.path || t('не установлена'))}</div></div>
            <div class="row"><button class="btn sm" data-jpick="${m}">${icon('folder')}${t('Указать')}</button>${inst ? `<span class="chip accent">${icon('check')}</span>` : `<button class="btn sm" data-jinst="${m}">${icon('download')}${t('Скачать')}</button>`}${s.java?.[m] ? `<button class="btn sm ghost icon" data-jclear="${m}">${icon('x')}</button>` : ''}</div></div>`
        }).join('')}
        <p class="dim" style="font-size:12px;margin-bottom:0">${t('1.16 и ниже — Java 8, 1.17–1.20.4 — Java 17, 1.20.5+ — Java 21, новейшие версии — Java 25.')}</p>
      </div>`
    const mem = $('#j-mem', box)
    const upd = () => $('#j-mem-v', box).textContent = (mem.value / 1024).toFixed(1) + t(' ГБ')
    upd(); mem.oninput = upd
    mem.onchange = () => set({ memory: { min: Math.min(1024, Number(mem.value)), max: Number(mem.value) } })
    $('#j-args', box).onchange = e => set({ jvmArgs: e.target.value })
    on(box, '[data-preset]', 'click', (_, b) => { $('#j-args', box).value = b.dataset.preset; set({ jvmArgs: b.dataset.preset }); toast(t('Аргументы применены'), '', 'success') })
    $('#j-auto', box).onchange = e => set({ autoJava: e.target.checked })
    on(box, '[data-jpick]', 'click', async (_, b) => {
      const p = await call('java:pick'); if (!p) return
      const r = await call('java:test', p)
      if (!r) return toast(t('Это не Java'), p, 'error')
      await set({ java: { ...state.settings.java, [b.dataset.jpick]: p } }); toast(`Java ${r.version}`, t('Сохранено'), 'success'); SEC.java(box)
    })
    on(box, '[data-jclear]', 'click', async (_, b) => { const j = { ...state.settings.java }; delete j[b.dataset.jclear]; await set({ java: j }); SEC.java(box) })
    on(box, '[data-jinst]', 'click', async (_, b) => { b.disabled = true; try { await call('java:install', b.dataset.jinst); toast(t('Java установлена'), '', 'success') } catch (e) { errToast(e) } SEC.java(box) })
  },

  launch(box) {
    const s = state.settings
    box.innerHTML = `
      <div class="card section"><h2>${t('При запуске игры')}</h2>
        <div class="col" style="gap:6px">${[['keep', t('Ничего не делать')], ['minimize', t('Свернуть лаунчер')], ['close', t('Закрыть лаунчер')]].map(([k, n]) => `<label class="row" style="gap:8px;cursor:pointer"><input type="radio" name="onl" value="${k}" ${s.onLaunch === k ? 'checked' : ''} style="accent-color:var(--accent)">${n}</label>`).join('')}</div>
      </div>
      <div class="card section"><h2>${t('Окно игры по умолчанию')}</h2>
        <div class="row"><label class="field grow">${t('Ширина')}<input class="input" type="number" id="g-w" value="${s.window.width}"></label><label class="field grow">${t('Высота')}<input class="input" type="number" id="g-h" value="${s.window.height}"></label></div>
        ${toggleRow('g-fs', t('Полный экран'), '', s.window.fullscreen)}
      </div>
      <div class="card section"><h2>${t('Хуки')}</h2>
        <label class="field">${t('Перед запуском')}<input class="input" id="g-pre" value="${esc(s.hooks?.pre || '')}" placeholder="${t('например: echo started')}"></label>
        <label class="field" style="margin-top:12px">${t('После выхода')}<input class="input" id="g-post" value="${esc(s.hooks?.post || '')}"></label>
      </div>
      <div class="card section"><h2>${t('Загрузки')}</h2>
        <label class="field">${t('Параллельных загрузок:')} <span id="g-conc-v">${s.concurrency}</span><input type="range" id="g-conc" min="1" max="32" value="${s.concurrency}"></label>
        ${toggleRow('g-snap', t('Показывать снапшоты'), t('В списке версий при создании сборки'), s.showSnapshots)}
      </div>
      <div class="card section"><h2>CurseForge</h2>
        <div class="setting"><div><div class="t">${t('API-ключ CurseForge')}</div><div class="d">${t('Нужен для поиска и установки модов с CurseForge.')} · ${s.cfApiKey ? '••••' + esc(s.cfApiKey.slice(-4)) : t('Не указан')}</div></div><button class="btn" id="g-cf">${icon('lock')}${t('Изменить')}</button></div>
      </div>`
    on(box, 'input[name=onl]', 'change', (_, r) => set({ onLaunch: r.value }))
    const win = () => set({ window: { width: Number($('#g-w', box).value) || 1280, height: Number($('#g-h', box).value) || 720, fullscreen: $('#g-fs', box).checked } })
    $('#g-w', box).onchange = win; $('#g-h', box).onchange = win; $('#g-fs', box).onchange = win
    const hooks = () => set({ hooks: { pre: $('#g-pre', box).value, post: $('#g-post', box).value } })
    $('#g-pre', box).onchange = hooks; $('#g-post', box).onchange = hooks
    $('#g-conc', box).oninput = e => $('#g-conc-v', box).textContent = e.target.value
    $('#g-conc', box).onchange = e => set({ concurrency: Number(e.target.value) })
    $('#g-snap', box).onchange = e => set({ showSnapshots: e.target.checked })
    $('#g-cf', box).onclick = async () => { const { cfKeyDialog } = await import('../sources.js'); if (await cfKeyDialog()) SEC.launch(box) }
  },

  fun(box) {
    const s = state.settings
    box.innerHTML = `
      <div class="card section"><h2>${t('Аксолотль-питомец')}</h2>
        ${toggleRow('f-pet', t('Показывать питомца'), t('Живёт в боковой панели, любит, когда его гладят'), s.pet !== false)}
        <div class="row wrap" style="gap:10px;margin-top:10px">${Object.keys(PET_COLORS).map(k => {
          const locked = k === 'blue' && !state.stats.achievements?.blue_axolotl && s.petColor !== 'blue'
          return `<button class="theme-card ${s.petColor === k ? 'active' : ''}" data-pet="${k}" ${locked ? `disabled data-tip="${t('Синего аксолотля можно только встретить (шанс 1/1200)')}"` : ''} style="width:96px;${locked ? 'opacity:.4;cursor:not-allowed' : ''}"><div class="pet-pv">${locked ? icon('help') : axolotlSVG(k)}</div><div class="nm">${esc(locked ? '???' : petName(k))}</div></button>`
        }).join('')}</div>
        <button class="btn" id="f-reroll" style="margin-top:12px">${icon('dice')}${t('Призвать случайного (шанс на синего!)')}</button>
      </div>
      <div class="card section"><h2>${t('Разное')}</h2>
        ${toggleRow('f-splash', t('Жёлтые надписи'), t('Как на титульном экране Minecraft'), s.splashes !== false)}
        <div class="setting"><div><div class="t">${t('Вечеринка')}</div><div class="d">${t('Или введите ↑↑↓↓←→←→BA где угодно')}</div></div><button class="btn" id="f-party">${icon('party')}${t('Запустить')}</button></div>
      </div>`
    $('#f-pet', box).onchange = async e => { await set({ pet: e.target.checked }); chrome() }
    on(box, '[data-pet]', 'click', async (_, b) => { await set({ petColor: b.dataset.pet }); document.getElementById('pet-slot').innerHTML = ''; chrome(); SEC.fun(box) })
    $('#f-reroll', box).onclick = async () => {
      await set({ petColor: '' })
      document.getElementById('pet-slot').innerHTML = ''
      chrome()
      setTimeout(async () => {
        state.settings = await call('settings:get')
        const col = state.settings.petColor
        toast(col === 'blue' ? t('НЕВЕРОЯТНО! Синий аксолотль!') : t('Новый друг: {name}', { name: petName(col) }), '', col === 'blue' ? 'ach' : 'success', 'heartFill')
        if (col === 'blue') confetti(80)
        SEC.fun(box)
      }, 200)
    }
    $('#f-splash', box).onchange = e => set({ splashes: e.target.checked })
    $('#f-party', box).onclick = () => {
      confetti(60); document.body.classList.add('party'); setTimeout(() => document.body.classList.remove('party'), 6000)
    }
  },

  async ach(box) {
    state.stats = await call('stats:get')
    const got = state.stats.achievements || {}
    const ACH = achievements()
    const total = Object.keys(ACH).length
    const n = Object.keys(got).filter(k => ACH[k]).length
    box.innerHTML = `
      <div class="card section">
        <div class="row between"><h2 style="margin:0">${t('Достижения')}</h2><span class="chip accent">${n} / ${total}</span></div>
        <div class="progress" style="margin:12px 0 18px"><div style="width:${n / total * 100}%"></div></div>
        <div class="ach-grid">${Object.entries(ACH).map(([k, a]) => `
          <div class="ach ${got[k] ? '' : 'locked'}"><div class="em" style="${got[k] ? `--c:${a.c}` : ''}">${icon(got[k] ? a.i : 'lock')}</div><div><div style="font-weight:800">${esc(a.t)}</div><div class="dim" style="font-size:12px">${esc(a.d)}</div>${got[k] ? `<div class="dim" style="font-size:11px;margin-top:2px">${fmtDate(got[k])}</div>` : ''}</div></div>`).join('')}</div>
      </div>
      <div class="card section"><h2>${t('Статистика')}</h2>
        <div class="stat-row">
          <div class="stat"><div class="v">${fmtTime(state.stats.playtime || 0)}</div><div class="k">${t('Время в игре')}</div></div>
          <div class="stat"><div class="v">${state.stats.launches || 0}</div><div class="k">${t('Запусков')}</div></div>
          <div class="stat"><div class="v">${state.stats.modsInstalled || 0}</div><div class="k">${t('Установлено проектов')}</div></div>
          <div class="stat"><div class="v">${state.stats.exports || 0}</div><div class="k">${t('Экспортов')}</div></div>
        </div>
        <p class="dim" style="font-size:12px;margin-bottom:0">${t('С нами с {date}', { date: fmtDate(state.stats.firstRun || Date.now()) })}</p>
      </div>`
  },

  async about(box) {
    const info = await call('app:info')
    box.innerHTML = `
      <div class="card section" style="text-align:center;padding:36px">
        <div style="width:110px;margin:0 auto 10px;image-rendering:pixelated">${axolotlSVG(state.settings.petColor || 'pink')}</div>
        <h1>Axolaunch</h1>
        <p class="muted">${t('Версия {v}', { v: esc(info.version) })} · Electron ${esc(info.electron)}</p>
        <p class="muted" style="max-width:480px;margin:10px auto">${t('Лаунчер Minecraft с полной интеграцией Modrinth: все версии, Fabric, Quilt, Forge и NeoForge, сборки .mrpack и много аксолотлей.')}</p>
        <div class="row" style="justify-content:center;margin-top:16px"><button class="btn" id="a-data">${icon('folder')}${t('Папка данных')}</button><button class="btn" data-ext="https://modrinth.com">${icon('globe')}Modrinth</button></div>
        <p class="dim" style="font-size:12px;margin-top:20px">${t('Не является официальным продуктом Minecraft. Не одобрено Mojang или Microsoft.')}<br>${t('Данные:')} ${esc(info.dataDir)}</p>
      </div>
      <div class="card"><h2>${t('Горячие клавиши')}</h2>
        <div class="col" style="gap:8px">
          <div class="row between"><span>${t('Поиск модов')}</span><span><kbd>Ctrl</kbd> + <kbd>K</kbd></span></div>
          <div class="row between"><span>${t('Новая сборка')}</span><span><kbd>Ctrl</kbd> + <kbd>N</kbd></span></div>
          <div class="row between"><span>${t('Назад / вперёд')}</span><span><kbd>Alt</kbd> + <kbd>←</kbd> / <kbd>→</kbd></span></div>
          <div class="row between"><span>${t('Обновить страницу')}</span><span><kbd>F5</kbd></span></div>
          <div class="row between"><span>???</span><span><kbd>↑↑↓↓←→←→BA</kbd></span></div>
        </div>
      </div>`
    $('#a-data', box).onclick = () => call('app:openData')
    on(box, '[data-ext]', 'click', (_, b) => call('app:openExternal', b.dataset.ext))
  },
}
