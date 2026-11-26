const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('axo', {
  call: async (name, ...args) => {
    const r = await ipcRenderer.invoke('call', name, ...args)
    if (!r.ok) throw new Error(r.error)
    return r.value
  },
  // сырой ответ {ok, value, error, cancelled} — флаги ошибок не теряются при передаче через contextBridge
  invoke: (name, ...args) => ipcRenderer.invoke('call', name, ...args),
  on: (channel, fn) => {
    const allowed = ['tasks:update', 'game:log', 'game:exit', 'game:state', 'game:fatal', 'achievement', 'open-file', 'window:state']
    if (!allowed.includes(channel)) return
    const h = (_, d) => fn(d)
    ipcRenderer.on(channel, h)
    return () => ipcRenderer.removeListener(channel, h)
  },
  pathForFile: file => webUtils.getPathForFile(file),
})
