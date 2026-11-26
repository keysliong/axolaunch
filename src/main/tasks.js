// Простой менеджер фоновых задач с прогрессом и отменой, транслируемый в интерфейс.
const { EventEmitter } = require('events')
const { AsyncLocalStorage } = require('async_hooks')
const { t: tr } = require('./i18n')
const bus = new EventEmitter()
const tasks = new Map()
const controllers = new Map()
const als = new AsyncLocalStorage()
let seq = 0

// отладка: AXO_TASKLOG=файл — журнал состояний задач
let lastLog = ''
function emit() {
  const list = [...tasks.values()]
  if (process.env.AXO_TASKLOG) {
    const line = list.map(t => `${t.title} | ${t.state} | ${Math.round(t.progress * 100)}% | ${t.status}`).join(' || ')
    if (line !== lastLog) { lastLog = line; require('fs').appendFileSync(process.env.AXO_TASKLOG, `${new Date().toISOString().slice(11, 19)} ${line}\n`) }
  }
  bus.emit('update', list)
}

class CancelledError extends Error {
  constructor() { super(tr('Отменено')); this.name = 'AbortError'; this.cancelled = true }
}
const isCancel = e => !!(e?.cancelled || e?.name === 'AbortError' || e?.code === 'ABORT_ERR')

function createTask(title, meta = {}) {
  const id = 't' + (++seq)
  const t = { id, title, status: tr('Подготовка…'), progress: 0, state: 'running', ...meta }
  const ctrl = new AbortController()
  tasks.set(id, t)
  controllers.set(id, ctrl)
  emit()
  let last = 0
  const finish = (ms) => { controllers.delete(id); setTimeout(() => { tasks.delete(id); emit() }, ms) }
  return {
    id,
    signal: ctrl.signal,
    update(progress, status) {
      if (t.state !== 'running') return
      if (progress != null) t.progress = Math.max(0, Math.min(1, progress))
      if (status) t.status = status
      const now = Date.now()
      if (now - last > 120) { last = now; emit() }
    },
    done(status) {
      t.progress = 1; t.state = 'done'; t.status = status || tr('Готово'); emit(); finish(4000)
    },
    fail(err) {
      if (isCancel(err) || ctrl.signal.aborted) { t.state = 'cancelled'; t.status = tr('Отменено'); emit(); finish(3000); return }
      t.state = 'error'; t.status = String(err?.message || err); emit(); finish(15000)
    },
  }
}

async function runTask(title, fn, meta) {
  const t = createTask(title, meta)
  try {
    const r = await als.run(t, () => fn(t))
    if (t.signal.aborted) throw new CancelledError()
    t.done()
    return r
  } catch (e) {
    if (!isCancel(e) && !t.signal.aborted) console.error(e)
    t.fail(e)
    throw t.signal.aborted ? new CancelledError() : e
  }
}

function cancel(id) {
  const c = controllers.get(id)
  if (!c) return false
  const t = tasks.get(id)
  if (t) { t.status = tr('Отмена…'); emit() }
  c.abort(new CancelledError())
  return true
}
/** Отменить все задачи, привязанные к сборке */
function cancelFor(instId) {
  for (const t of tasks.values()) if (t.instance === instId && t.state === 'running') cancel(t.id)
}

/** Сигнал отмены текущей задачи (если код выполняется внутри runTask) */
const currentSignal = () => als.getStore()?.signal
function throwIfCancelled(signal = currentSignal()) { if (signal?.aborted) throw new CancelledError() }

module.exports = { bus, createTask, runTask, cancel, cancelFor, currentSignal, throwIfCancelled, isCancel, CancelledError, list: () => [...tasks.values()] }
