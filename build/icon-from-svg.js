// Рендерит assets/logo.svg в assets/icon.png и assets/icon.ico (через Chromium из Electron).
// Запуск: npx electron build/icon-from-svg.js
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const svgPath = path.join(root, 'assets', 'logo.svg')

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

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('about:blank')
  const svg = fs.readFileSync(svgPath, 'utf8')
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512]
  const out = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image()
    img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))}
    await img.decode()
    const res = {}
    for (const s of ${JSON.stringify(sizes)}) {
      const c = document.createElement('canvas'); c.width = c.height = s
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'
      g.drawImage(img, 0, 0, s, s)
      res[s] = c.toDataURL('image/png').split(',')[1]
    }
    return res
  })()`)
  const pngs = sizes.map(size => ({ size, data: Buffer.from(out[size], 'base64') }))
  fs.writeFileSync(path.join(root, 'assets', 'icon.png'), pngs.find(p => p.size === 512).data)
  fs.writeFileSync(path.join(root, 'assets', 'icon.ico'), encodeICO(pngs.filter(p => p.size <= 256)))
  console.log('ok', pngs.map(p => `${p.size}:${p.data.length}`).join(' '))
  app.quit()
})
