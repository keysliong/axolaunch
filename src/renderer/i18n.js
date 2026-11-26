// Локализация: ключ — русская строка, для английского берём перевод из словаря
import EN from './lang/en.js'

let lang = 'ru'
export const LANGS = { ru: 'Русский', en: 'English' }
export function setLang(l) { lang = LANGS[l] ? l : 'ru'; document.documentElement.lang = lang }
export const getLang = () => lang
export const isEn = () => lang === 'en'
export const locale = () => (lang === 'en' ? 'en-US' : 'ru-RU')

/** t('Привет, {name}!', { name }) */
export function t(s, vars) {
  let r = lang === 'en' ? (EN[s] ?? s) : s
  if (vars) r = r.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''))
  return r
}
/** Выбор по языку для данных, которые не переводятся построчно (сплэши, советы…) */
export const pick = (ru, en) => (lang === 'en' ? en : ru)
export const fmtDate = d => new Date(d).toLocaleDateString(locale())
