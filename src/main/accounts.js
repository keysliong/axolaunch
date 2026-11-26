// Аккаунты: офлайн и Microsoft (Xbox Live → Minecraft Services)
const { t: tr } = require('./i18n')
const crypto = require('crypto')
const { BrowserWindow, safeStorage } = require('electron')
const { P, readJson, writeJson } = require('./store')

const CLIENT_ID = '00000000402b5328'
const REDIRECT = 'https://login.live.com/oauth20_desktop.srf'
const SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL'

function load() {
  const data = readJson(P.accounts, { active: null, accounts: [] })
  for (const a of data.accounts) {
    if (a.enc && safeStorage.isEncryptionAvailable()) {
      try { Object.assign(a, JSON.parse(safeStorage.decryptString(Buffer.from(a.enc, 'base64')))) } catch {}
    }
  }
  return data
}
function persist(data) {
  const copy = {
    active: data.active,
    accounts: data.accounts.map(a => {
      const { refreshToken, accessToken, enc, ...pub } = a
      if (a.type !== 'msa') return pub
      const secret = JSON.stringify({ refreshToken, accessToken })
      return safeStorage.isEncryptionAvailable()
        ? { ...pub, enc: safeStorage.encryptString(secret).toString('base64') }
        : { ...pub, refreshToken, accessToken }
    }),
  }
  writeJson(P.accounts, copy)
}

function publicList() {
  const d = load()
  return { active: d.active, accounts: d.accounts.map(({ refreshToken, accessToken, enc, ...a }) => a) }
}

function offlineUUID(name) {
  const h = crypto.createHash('md5').update('OfflinePlayer:' + name).digest()
  h[6] = (h[6] & 0x0f) | 0x30
  h[8] = (h[8] & 0x3f) | 0x80
  return h.toString('hex')
}

function addOffline(name) {
  name = String(name).trim()
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error(tr('Ник: 3–16 символов, латиница, цифры и _'))
  const d = load()
  const id = offlineUUID(name)
  d.accounts = d.accounts.filter(a => a.id !== id)
  d.accounts.push({ type: 'offline', id, name })
  d.active = id
  persist(d)
  return publicList()
}

function remove(id) {
  const d = load()
  d.accounts = d.accounts.filter(a => a.id !== id)
  if (d.active === id) d.active = d.accounts[0]?.id || null
  persist(d)
  return publicList()
}

function setActive(id) {
  const d = load()
  if (d.accounts.some(a => a.id === id)) d.active = id
  persist(d)
  return publicList()
}

async function post(url, body, form = false) {
  const res = await fetch(url, {
    method: 'POST',
    headers: form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
  })
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = {} }
  if (!res.ok) {
    if (json.XErr === 2148916233) throw new Error(tr('У этого аккаунта нет Xbox-профиля. Зайдите на xbox.com и создайте его.'))
    if (json.XErr === 2148916238) throw new Error(tr('Детский аккаунт: нужно добавить его в семейную группу Microsoft.'))
    throw new Error(tr('Ошибка авторизации ({status}): {msg}', { status: res.status, msg: json.error_description || json.errorMessage || text.slice(0, 200) }))
  }
  return json
}

function askCode() {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 520, height: 680, title: tr('Вход в Microsoft'), autoHideMenuBar: true,
      webPreferences: { partition: 'msa-login', nodeIntegration: false, contextIsolation: true },
    })
    const url = `https://login.live.com/oauth20_authorize.srf?client_id=${CLIENT_ID}&response_type=code&scope=${encodeURIComponent(SCOPE)}&redirect_uri=${encodeURIComponent(REDIRECT)}&prompt=select_account`
    let finished = false
    const check = u => {
      if (!u.startsWith(REDIRECT)) return
      const q = new URL(u).searchParams
      finished = true
      win.close()
      if (q.get('code')) resolve(q.get('code'))
      else reject(new Error(q.get('error_description') || tr('Вход отменён')))
    }
    win.webContents.on('will-redirect', (_, u) => check(u))
    win.webContents.on('did-navigate', (_, u) => check(u))
    win.on('closed', () => { if (!finished) reject(new Error(tr('Окно входа закрыто'))) })
    win.loadURL(url)
  })
}

async function msaChain(tokens) {
  const xbl = await post('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: tokens.access_token },
    RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT',
  })
  const xsts = await post('https://xsts.auth.xboxlive.com/xsts/authorize', {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
    RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT',
  })
  const uhs = xsts.DisplayClaims.xui[0].uhs
  const mc = await post('https://api.minecraftservices.com/authentication/login_with_xbox', { identityToken: `XBL3.0 x=${uhs};${xsts.Token}` })
  const res = await fetch('https://api.minecraftservices.com/minecraft/profile', { headers: { Authorization: 'Bearer ' + mc.access_token } })
  if (res.status === 404) throw new Error(tr('На этом аккаунте не куплен Minecraft: Java Edition'))
  if (!res.ok) throw new Error(tr('Не удалось получить профиль Minecraft'))
  const profile = await res.json()
  return {
    type: 'msa', id: profile.id, name: profile.name,
    skin: profile.skins?.find(s => s.state === 'ACTIVE')?.url || '',
    accessToken: mc.access_token, expires: Date.now() + (mc.expires_in - 60) * 1000,
    refreshToken: tokens.refresh_token,
  }
}

async function addMicrosoft() {
  const code = await askCode()
  const tokens = await post('https://login.live.com/oauth20_token.srf', { client_id: CLIENT_ID, code, grant_type: 'authorization_code', redirect_uri: REDIRECT, scope: SCOPE }, true)
  const acc = await msaChain(tokens)
  const d = load()
  d.accounts = d.accounts.filter(a => a.id !== acc.id)
  d.accounts.push(acc)
  d.active = acc.id
  persist(d)
  return publicList()
}

/** Возвращает активный аккаунт с актуальным токеном (обновляет при необходимости) */
async function getForLaunch() {
  const d = load()
  const acc = d.accounts.find(a => a.id === d.active)
  if (!acc) return null
  if (acc.type === 'offline') return { name: acc.name, id: acc.id, accessToken: crypto.randomBytes(16).toString('hex'), userType: 'mojang' }
  if (!acc.accessToken || Date.now() > acc.expires) {
    const tokens = await post('https://login.live.com/oauth20_token.srf', { client_id: CLIENT_ID, refresh_token: acc.refreshToken, grant_type: 'refresh_token', redirect_uri: REDIRECT, scope: SCOPE }, true)
    Object.assign(acc, await msaChain(tokens))
    persist(d)
  }
  return { name: acc.name, id: acc.id, accessToken: acc.accessToken, userType: 'msa' }
}

module.exports = { publicList, addOffline, addMicrosoft, remove, setActive, getForLaunch }
