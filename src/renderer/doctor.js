// Окно «Доктор сборки»: показывает причину вылета и чинит сборку с разрешения пользователя
import { call, esc, icon, modal, toast, errToast, t } from './ui.js'
import { state, refreshInstances } from './core.js'

const SEV_IC = { error: 'alert', warn: 'help' }

/**
 * auto=true — вызвано само после вылета: если ничего не нашли, окно не показываем.
 * Возвращает true, если окно было показано.
 */
export async function openDoctor(instId, { auto = false } = {}) {
  const inst = state.instances.find(i => i.id === instId)
  const name = inst?.name || instId
  let diag
  if (auto) {
    try { diag = await call('doctor:diagnose', instId) } catch { return false }
    if (!diag.problems.length) return false
  }
  const { el, close } = modal({
    title: auto ? t('Игра вылетела — нашли причину') : t('Доктор сборки'),
    wide: true,
    body: `<div class="doc-body"><div class="doc-loading">${icon('search')}${t('Изучаю логи и отчёт о вылете…')}</div></div>`,
    foot: `<button class="btn" data-no>${t('Закрыть')}</button><button class="btn primary" data-fix disabled>${icon('wrench')}${t('Починить')}</button>`,
  })
  el.querySelector('[data-no]').onclick = close
  const body = el.querySelector('.doc-body')
  const fixBtn = el.querySelector('[data-fix]')
  try { diag ||= await call('doctor:diagnose', instId) } catch (e) { body.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return true }

  if (!diag.problems.length) {
    body.innerHTML = `<div class="doc-empty">${icon('checkCircle')}<div><b>${t('Явных проблем не нашёл')}</b><p class="muted">${t('В логах нет известных ошибок модов. Если игра всё равно вылетает — загляните во вкладку «Логи» или отключайте моды по одному.')}</p></div></div>`
    return true
  }

  const choice = diag.problems.map(p => (p.fixes.length ? 0 : -1))
  body.innerHTML = `
    <p class="muted" style="margin:0 0 12px">${t('Выберите, что сделать с каждой проблемой. Без вашего согласия ничего не меняется; отключённые моды можно включить обратно во вкладке «Контент».')}</p>
    ${diag.problems.map((p, i) => `
      <div class="doc-item ${p.severity}">
        <div class="doc-head">
          ${p.icon || p.mod?.icon ? `<img class="doc-ic" src="${esc(p.icon || p.mod.icon)}">` : `<span class="doc-ic sev">${icon(SEV_IC[p.severity] || 'alert')}</span>`}
          <div class="grow"><div class="doc-t">${esc(p.title)}</div>
            <div class="doc-d">${esc(p.detail || '')}${p.mod ? ` <span class="dim">· ${esc(p.mod.file)}</span>` : ''}</div></div>
        </div>
        ${p.fixes.length ? `<div class="doc-fixes">
          ${p.fixes.map((f, j) => `<label class="doc-fix"><input type="radio" name="fx${i}" value="${j}" ${j === 0 ? 'checked' : ''}><span>${esc(f.label)}</span></label>`).join('')}
          <label class="doc-fix"><input type="radio" name="fx${i}" value="-1"><span class="dim">${t('Ничего не делать')}</span></label>
        </div>` : ''}
      </div>`).join('')}
    ${diag.crashFile ? `<button class="btn ghost sm" id="doc-report" style="margin-top:4px">${icon('file')}${t('Открыть отчёт о вылете')}</button>` : ''}`
  body.querySelectorAll('input[type=radio]').forEach(r => r.onchange = () => {
    choice[Number(r.name.slice(2))] = Number(r.value)
    sync()
  })
  body.querySelector('#doc-report')?.addEventListener('click', () => call('instances:openFolder', instId, 'crash-reports'))
  const picked = () => diag.problems.map((p, i) => choice[i] >= 0 ? p.fixes[choice[i]] : null).filter(Boolean)
  const sync = () => { fixBtn.disabled = !picked().length }
  sync()

  fixBtn.onclick = async () => {
    const fixes = picked()
    fixBtn.disabled = true
    fixBtn.innerHTML = `${icon('timer')}${t('Чиню…')}`
    try {
      await call('doctor:fix', instId, fixes)
      await refreshInstances()
      body.innerHTML = `<div class="doc-empty ok">${icon('checkCircle')}<div><b>${t('Сборка починена')}</b><p class="muted">${t('Выполнено действий: {n}. Попробуйте запустить игру снова.', { n: fixes.length })}</p></div></div>`
      el.querySelector('.modal-foot').innerHTML = `<button class="btn" data-no>${t('Закрыть')}</button><button class="btn primary" data-play>${icon('play')}${t('Запустить снова')}</button>`
      el.querySelector('[data-no]').onclick = close
      el.querySelector('[data-play]').onclick = async () => {
        close()
        const { play } = await import('./actions.js')
        play(instId)
      }
      toast(t('Сборка починена'), name, 'success', 'wrench')
    } catch (e) {
      fixBtn.disabled = false
      fixBtn.innerHTML = `${icon('wrench')}${t('Починить')}`
      errToast(e)
    }
  }
  return true
}
