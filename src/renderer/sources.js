// Источники контента: Modrinth и CurseForge
import { call, esc, icon, modal, toast, t } from './ui.js'
import { state, navigate } from './core.js'

export const SOURCE_ICONS = {
  modrinth: `<svg viewBox="0 0 24 24" class="src-logo"><rect width="24" height="24" rx="6" fill="#1bd96a"/><path d="M12 4.6a7.4 7.4 0 1 0 7.2 9.1" fill="none" stroke="#0b2a17" stroke-width="2.2" stroke-linecap="round"/><path d="M12 8.4a3.6 3.6 0 1 0 3.5 4.4" fill="none" stroke="#0b2a17" stroke-width="2.2" stroke-linecap="round"/><path d="m13.2 12.1 5.6-3.2" stroke="#0b2a17" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  curseforge: `<svg viewBox="0 0 24 24" class="src-logo"><rect width="24" height="24" rx="6" fill="#f16436"/><path d="M4 8h10.5c.3 2.1 2.2 3.2 5.5 3.2v1.2c-2.6.1-3.9 1.1-4.4 2.7h-1.4l.9 2.4h1.3V19H7.6v-1.5h1.3l.9-2.4H8.6C6 15.1 4 13 4 10.4Z" fill="#fff"/></svg>`,
}
export const SOURCE_NAMES = { modrinth: 'Modrinth', curseforge: 'CurseForge' }

/** Окно ввода API-ключа CurseForge. Возвращает true, если ключ сохранён */
export function cfKeyDialog() {
  return new Promise(resolve => {
    let ok = false
    const { el, close } = modal({
      title: t('Подключить CurseForge'),
      body: `<div class="col" style="gap:12px">
        <div class="row" style="gap:12px;align-items:flex-start">${SOURCE_ICONS.curseforge.replace('src-logo', 'src-logo big')}
          <p class="muted" style="margin:0">${t('CurseForge пускает лаунчеры только с личным API-ключом. Он бесплатный: войдите на console.curseforge.com, создайте ключ в разделе «API keys» и вставьте его сюда. Ключ хранится только на этом компьютере.')}</p></div>
        <button class="btn sm ghost" id="cf-site" style="align-self:flex-start">${icon('external')}${t('Открыть console.curseforge.com')}</button>
        <input class="input" id="cf-key" placeholder="${t('Вставьте API-ключ')}" value="${esc(state.settings.cfApiKey || '')}" spellcheck="false">
      </div>`,
      foot: `<button class="btn" data-no>${t('Отмена')}</button><button class="btn primary" data-ok>${icon('check')}${t('Сохранить')}</button>`,
      onClose: () => resolve(ok),
    })
    el.querySelector('#cf-site').onclick = () => call('app:openExternal', 'https://console.curseforge.com/')
    el.querySelector('[data-no]').onclick = close
    el.querySelector('[data-ok]').onclick = async () => {
      const v = el.querySelector('#cf-key').value.trim()
      if (!v) return toast(t('Вставьте ключ'), '', 'error')
      state.settings = await call('settings:set', { cfApiKey: v })
      ok = true
      close()
    }
  })
}

export async function ensureSource(source) {
  if (source !== 'curseforge') return true
  if (await call('cf:hasKey')) return true
  return cfKeyDialog()
}

/** «Добавить контент»: выбор, откуда брать моды/ресурспаки/шейдеры */
export function chooseSource(targetId, type = 'mod') {
  const { el, close } = modal({
    title: t('Откуда добавить контент?'),
    body: `<div class="src-pick">
      ${['modrinth', 'curseforge'].map(s => `
        <button class="src-card" data-src="${s}">
          ${SOURCE_ICONS[s].replace('src-logo', 'src-logo big')}
          <div class="grow"><div class="src-name">${SOURCE_NAMES[s]}</div>
          <div class="dim">${s === 'modrinth' ? t('Моды, ресурспаки, шейдеры и датапаки. Без ключей и рекламы.') : t('Крупнейший каталог модов. Нужен бесплатный API-ключ.')}</div></div>
          ${icon('forward')}
        </button>`).join('')}
    </div>`,
  })
  el.querySelectorAll('[data-src]').forEach(b => b.onclick = async () => {
    const s = b.dataset.src
    close()
    if (!(await ensureSource(s))) return
    navigate('discover', { type, target: targetId, source: s })
  })
}
