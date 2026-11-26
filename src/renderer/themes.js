// Темы оформления
import { applyLogo } from './logo.js'
export const THEMES = {
  axolotl: { name: 'Аксолотль', nameEn: 'Axolotl', bg: '#0f0d14', raised: '#1a1722', inset: '#13111a', surface: '#262230', hover: '#312c3d', text: '#ece8f4', muted: '#a49cb5', dim: '#6e6680', accent: '#ff7ab8', contrast: '#1a0b14' },
  modrinth: { name: 'Modrinth', bg: '#16181c', raised: '#1f2228', inset: '#111215', surface: '#2b2e35', hover: '#353943', text: '#e4e6eb', muted: '#a0a6b1', dim: '#6b717c', accent: '#1bd96a', contrast: '#04140a' },
  oled: { name: 'OLED', bg: '#000000', raised: '#0b0b0d', inset: '#000000', surface: '#17171a', hover: '#222226', text: '#f2f2f2', muted: '#9b9ba3', dim: '#5f5f66', accent: '#8ab4ff', contrast: '#000814' },
  light: { name: 'Светлая', nameEn: 'Light', bg: '#f3f1f7', raised: '#ffffff', inset: '#ebe8f1', surface: '#e4e0ec', hover: '#d8d3e3', text: '#1d1a24', muted: '#5f586d', dim: '#938ca1', accent: '#d9468f', contrast: '#ffffff', light: true },
  nether: { name: 'Незер', nameEn: 'Nether', bg: '#140707', raised: '#220d0c', inset: '#0f0505', surface: '#341512', hover: '#441c18', text: '#f8e6e1', muted: '#c39a90', dim: '#80584f', accent: '#ff6a2b', contrast: '#1c0700' },
  end: { name: 'Энд', nameEn: 'The End', bg: '#0b0a12', raised: '#15132a', inset: '#08070f', surface: '#211e3d', hover: '#2c284f', text: '#efeaff', muted: '#aaa2d4', dim: '#6c6596', accent: '#c58bff', contrast: '#140728' },
  ocean: { name: 'Океан', nameEn: 'Ocean', bg: '#06121a', raised: '#0b1d29', inset: '#041018', surface: '#13303f', hover: '#1a3d50', text: '#e1f3fb', muted: '#8fb6c7', dim: '#567b8b', accent: '#2bd4e0', contrast: '#021417' },
  forest: { name: 'Лес', nameEn: 'Forest', bg: '#0b120b', raised: '#131e13', inset: '#080e08', surface: '#1e2e1d', hover: '#283c26', text: '#e6f2e2', muted: '#9fb898', dim: '#647a5e', accent: '#8fdc5a', contrast: '#0b1704' },
  cherry: { name: 'Вишня', nameEn: 'Cherry', bg: '#170d12', raised: '#22141b', inset: '#120a0e', surface: '#331e28', hover: '#432735', text: '#fbe9f1', muted: '#d4a3b8', dim: '#8e6576', accent: '#ffb3d1', contrast: '#2a0716' },
  retro: { name: 'Ретро-терминал', nameEn: 'Retro terminal', bg: '#020a02', raised: '#051405', inset: '#010601', surface: '#0b220b', hover: '#103010', text: '#7dff7d', muted: '#46c646', dim: '#2a7a2a', accent: '#33ff33', contrast: '#001400', font: "'JetBrains Mono', ui-monospace, Consolas, monospace" },
}
export const ACCENTS = ['#ff7ab8', '#1bd96a', '#8ab4ff', '#c58bff', '#ff6a2b', '#ffc04d', '#2bd4e0', '#ff5c6c', '#8fdc5a', '#ffffff']
export const FONTS = {
  Manrope: "'Manrope', 'Segoe UI', system-ui, sans-serif",
  Onest: "'Onest', 'Segoe UI', system-ui, sans-serif",
  Inter: "'Inter', 'Segoe UI', system-ui, sans-serif",
  Nunito: "'Nunito', 'Segoe UI', system-ui, sans-serif",
  Rubik: "'Rubik', 'Segoe UI', system-ui, sans-serif",
  'JetBrains Mono': "'JetBrains Mono', ui-monospace, Consolas, monospace",
  System: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
}
export const themeName = t => (document.documentElement.lang === 'en' && t.nameEn) || t.name

function contrastFor(hex) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0'), 16)
  const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#120a10' : '#ffffff'
}

export function applyTheme(s) {
  const t = THEMES[s.theme] || THEMES.axolotl
  const root = document.documentElement.style
  const accent = s.accent || t.accent
  const map = { '--bg': t.bg, '--bg-raised': t.raised, '--bg-raised-base': t.raised, '--bg-inset': t.inset, '--surface': t.surface, '--surface-hover': t.hover, '--text': t.text, '--text-muted': t.muted, '--text-dim': t.dim, '--accent': accent, '--accent-contrast': s.accent ? contrastFor(accent) : t.contrast }
  for (const [k, v] of Object.entries(map)) root.setProperty(k, v)
  root.setProperty('--radius', (s.radius ?? 14) + 'px')
  root.setProperty('--font', t.font || FONTS[s.font] || FONTS.Manrope)
  root.setProperty('--border', t.light ? '#0000001a' : '#ffffff12')
  document.documentElement.style.colorScheme = t.light ? 'light' : 'dark'
  document.body.classList.toggle('compact', !!s.compact)
  document.body.classList.toggle('no-anim', s.animations === false)
  const bg = document.getElementById('bg')
  if (s.background) {
    bg.style.backgroundImage = `url("${s.background}")`
    bg.style.filter = `blur(${s.backgroundBlur ?? 0}px)`
    bg.style.inset = `-${(s.backgroundBlur ?? 0) * 2}px`
    root.setProperty('--bg-dim', s.backgroundDim ?? 0.6)
    root.setProperty('--bg-blur', (s.backgroundBlur ?? 8) + 'px')
    document.body.classList.add('has-bg')
    document.body.style.background = t.bg
    document.getElementById('app').style.background = 'transparent'
    root.setProperty('--bg-inset', t.inset + 'cc')
  } else {
    bg.style.backgroundImage = ''
    document.body.classList.remove('has-bg')
  }
  document.getElementById('custom-css').textContent = s.customCss || ''
  applyLogo(s)
}
