// Логотип Axolaunch (неоновая «A»), перекрашиваемый под тему
import { THEMES } from './themes.js'

// n — три цвета неонового градиента, bg — три цвета фона, aura — свечение, glint — блёстки
const PALETTES = {
  axolotl: { n: ['#ff5dbd', '#dc51ff', '#8d6bff'], bg: ['#100d18', '#08080e', '#130a18'], aura: '#8224a4', glint: '#ffd0f2' },
  modrinth: { n: ['#a6ffcb', '#1bd96a', '#0f9fa6'], bg: ['#141a19', '#0b0e10', '#0b1612'], aura: '#10804a', glint: '#d6ffe6' },
  oled: { n: ['#d2e3ff', '#8ab4ff', '#6f6bff'], bg: ['#06070a', '#000000', '#05060d'], aura: '#24448f', glint: '#eef4ff' },
  light: { n: ['#ff5aa8', '#d9468f', '#8d4bff'], bg: ['#ffffff', '#f6f3fa', '#efe4f6'], aura: '#f2b8de', glint: '#b03a7a', light: true },
  nether: { n: ['#ffd24d', '#ff6a2b', '#d81e2a'], bg: ['#1d0a07', '#0f0404', '#1a0603'], aura: '#a3290f', glint: '#ffe4c9' },
  end: { n: ['#f3d2ff', '#c58bff', '#6656ff'], bg: ['#100d20', '#06050c', '#110a22'], aura: '#5a2aa8', glint: '#f4eaff' },
  ocean: { n: ['#9ef9ff', '#2bd4e0', '#2b78ff'], bg: ['#071925', '#030b10', '#061420'], aura: '#0a6a8c', glint: '#d9fcff' },
  forest: { n: ['#eaff80', '#8fdc5a', '#22b46a'], bg: ['#0f190d', '#060b05', '#0b160c'], aura: '#3d7a1a', glint: '#f0fcd9' },
  cherry: { n: ['#ffe0ec', '#ffb3d1', '#ff6aa6'], bg: ['#201118', '#0f080b', '#1d0c15'], aura: '#8a2a58', glint: '#fff2f7' },
  retro: { n: ['#c2ffc2', '#33ff33', '#11b83a'], bg: ['#041404', '#010601', '#021102'], aura: '#0f6a0f', glint: '#dcffdc' },
}

const hex2hsl = hex => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0'), 16)
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  let h = 0, s = 0
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1))
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
  }
  return [(h + 360) % 360, s, l]
}
const hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360} ${Math.round(Math.min(1, s) * 100)}% ${Math.round(Math.max(0, Math.min(1, l)) * 100)}%)`

/** Палитра для настроек: тема + (необязательный) свой акцентный цвет */
export function logoPalette(themeKey, accent) {
  const base = PALETTES[themeKey] || PALETTES.axolotl
  if (!accent) return base
  const [h, s, l] = hex2hsl(accent)
  const sat = Math.max(s, 0.55)
  const lit = base.light ? Math.min(l, 0.55) : Math.max(l, 0.6)
  return {
    ...base,
    n: [hsl(h - 22, sat, lit + 0.1), hsl(h, sat, lit), hsl(h + 32, sat, lit - 0.06)],
    aura: hsl(h, sat * 0.8, base.light ? 0.85 : 0.3),
    glint: hsl(h, 1, base.light ? 0.35 : 0.9),
  }
}

let seq = 0
/** SVG логотипа. full=false — без угловых узоров (для маленьких размеров) */
export function logoSVG(pal = PALETTES.axolotl, { full = true } = {}) {
  const id = 'lg' + (seq++)
  const [a, b, c] = pal.n
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs>
 <linearGradient id="${id}n" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${a}"/><stop offset=".48" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
 <linearGradient id="${id}e" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${c}"/></linearGradient>
 <radialGradient id="${id}a"><stop stop-color="${pal.aura}" stop-opacity="${pal.light ? '.55' : '.32'}"/><stop offset="1" stop-color="${pal.bg[1]}" stop-opacity="0"/></radialGradient>
 <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${pal.bg[0]}"/><stop offset=".48" stop-color="${pal.bg[1]}"/><stop offset="1" stop-color="${pal.bg[2]}"/></linearGradient>
 <filter id="${id}g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${pal.light ? 10 : 16}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
 <filter id="${id}s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<rect width="1024" height="1024" fill="url(#${id}b)"/><ellipse cx="512" cy="510" rx="450" ry="390" fill="url(#${id}a)"/>
${full ? `<g fill="none" stroke="url(#${id}e)" opacity=".58">
 <path d="M-30 220h206q44 0 67-37L354 -25" stroke-width="2"/><path d="M-25 258h191q61 0 91-49l116-189" stroke-width="1" opacity=".38"/>
 <path d="M1054 804H848q-44 0-67 37L670 1050" stroke-width="2"/><path d="M1049 766H858q-61 0-91 49L651 1004" stroke-width="1" opacity=".38"/>
</g>` : ''}
<path d="M330 724 501 303q7-17 25-17t25 17l169 421q8 21-14 21h-77q-14 0-20-15l-83-218-83 218q-6 15-20 15h-79q-22 0-14-21Z" fill="none" stroke="url(#${id}n)" stroke-width="30" stroke-linejoin="round" opacity=".27" filter="url(#${id}s)"/>
<g fill="none" stroke="url(#${id}n)" stroke-linecap="round" stroke-linejoin="round" filter="url(#${id}g)">
 <path d="M319 714 493 302q10-24 34-24t34 24l174 412" stroke-width="48"/>
 <path d="M399 566h252" stroke-width="39"/>
 <path d="M372 713q36-73 87-112 29-22 68-22t68 22q51 39 87 112" stroke-width="13" opacity=".94"/>
 <path d="M450 445q28-57 77-57t77 57" stroke-width="13" opacity=".94"/>
 <path d="M482 713q30-42 45-79 15 37 45 79" stroke-width="12" opacity=".9"/>
</g>
<g fill="none" stroke="url(#${id}e)" stroke-width="5" stroke-linecap="round" opacity=".96">
 <path d="M346 650q-30-28-54-8 15 30 47 20m339-12q30-28 54-8-15 30-47 20"/>
 <path d="M456 386q-26-29-49-9 11 27 40 23m163-14q26-29 49-9-11 27-40 23"/>
 <path d="M494 641q-34-10-43 16 28 16 51-5m44-11q34-10 43 16-28 16-51-5"/>
</g>
<g fill="${pal.glint}"><path d="m288 656 8 8-8 8-8-8zM736 656l8 8-8 8-8-8zM410 371l7 7-7 7-7-7zM614 371l7 7-7 7-7-7z"/></g>
<g fill="${pal.glint}" opacity=".9"><circle cx="512" cy="238" r="3"/><circle cx="261" cy="512" r="2"/><circle cx="763" cy="512" r="2"/><circle cx="512" cy="786" r="3"/></g>
</svg>`
}

let lastKey = '', railHtml = ''
export const railLogo = () => railHtml
/** Обновляет логотип в боковой панели и иконку окна/панели задач под текущую тему */
export function applyLogo(s) {
  const key = `${s.theme}|${s.accent || ''}`
  const pal = logoPalette(THEMES[s.theme] ? s.theme : 'axolotl', s.accent)
  railHtml = logoSVG(pal, { full: false })
  const el = document.querySelector('.rail-logo')
  if (el) el.innerHTML = railHtml
  if (key === lastKey) return
  lastKey = key
  // иконка окна: рисуем SVG в PNG 256×256 и отдаём в main
  const img = new Image()
  img.onload = () => {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 256
      c.getContext('2d').drawImage(img, 0, 0, 256, 256)
      window.axo.invoke('app:setIcon', c.toDataURL('image/png')).catch(() => {})
    } catch {}
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logoSVG(pal))
}
