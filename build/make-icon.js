// Генерирует иконку Axolaunch (пиксельный аксолотль) в PNG / ICO / SVG без внешних зависимостей.
// Запуск: node build/make-icon.js
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const GRID = [
  '................',
  '.G............G.',
  '..G.PPPPPPPP.G..',
  'GG.PPPPPPPPPP.GG',
  '..GPPPPPPPPPPG..',
  'GGPPPPPPPPPPPPGG',
  '..PPWEPPPPWEPP..',
  'GPPPEEPPPPEEPPPG',
  '..PPPPPPPPPPPP..',
  '..PDPPMPPMPPDP..',
  '..PPPPPMMPPPPP..',
  '...PPPPPPPPPP...',
  '....PPPPPPPP....',
  '....PP....PP....',
  '................',
  '................',
]
const COLORS = {
  P: [255, 156, 207],
  D: [255, 102, 170],
  G: [214, 51, 127],
  E: [42, 26, 46],
  W: [255, 255, 255],
  M: [184, 50, 110],
}
GRID.forEach((r, i) => { if (r.length !== 16) throw new Error('row ' + i + ' len ' + r.length) })

function render(size) {
  const px = Buffer.alloc(size * size * 4)
  const radius = size * 0.22
  const cell = Math.floor(size * 0.86 / 16)
  const off = Math.floor((size - cell * 16) / 2) + Math.floor(cell * 0.6)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      // скруглённый квадрат-фон
      const dx = Math.max(radius - x, 0, x - (size - 1 - radius))
      const dy = Math.max(radius - y, 0, y - (size - 1 - radius))
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > radius) continue
      const alpha = Math.min(1, radius - d + 0.5)
      const t = (x + y) / (2 * size)
      let c = [Math.round(74 - 40 * t), Math.round(38 - 20 * t), Math.round(110 - 50 * t)]
      const gx = Math.floor((x - off + cell * 0.6) / cell), gy = Math.floor((y - off) / cell)
      if (gx >= 0 && gx < 16 && gy >= 0 && gy < 16) {
        const ch = GRID[gy][gx]
        if (COLORS[ch]) c = COLORS[ch]
      }
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = Math.round(alpha * 255)
    }
  }
  return encodePNG(size, size, px)
}

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}
function encodeICO(pngs) {
  const header = Buffer.alloc(6); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4)
  const entries = []; let offset = 6 + 16 * pngs.length
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size; e[1] = size >= 256 ? 0 : size
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12)
    offset += data.length; entries.push(e)
  }
  return Buffer.concat([header, ...entries, ...pngs.map(p => p.data)])
}
function svg() {
  let rects = ''
  GRID.forEach((row, y) => [...row].forEach((ch, x) => {
    if (COLORS[ch]) rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="rgb(${COLORS[ch].join(',')})"/>`
  }))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects}</svg>`
}

const out = path.join(__dirname, '..', 'assets')
fs.mkdirSync(out, { recursive: true })
const sizes = [16, 32, 48, 64, 128, 256].map(size => ({ size, data: render(size) }))
fs.writeFileSync(path.join(out, 'icon.png'), sizes.at(-1).data)
fs.writeFileSync(path.join(out, 'icon.ico'), encodeICO(sizes))
fs.writeFileSync(path.join(out, 'axolotl.svg'), svg())
fs.copyFileSync(path.join(out, 'axolotl.svg'), path.join(__dirname, '..', 'src', 'renderer', 'axolotl.svg'))
console.log('icons written to', out)
