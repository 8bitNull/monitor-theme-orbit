import { api } from './http'
import type { MetricsHistory } from './api'
export type HistoryQuery = { id: number; hours: number; points: number; series: 'metrics' | 'ping' }
export const historyKey = (q: HistoryQuery) => `${q.id}:${q.hours}:${q.points}:${q.series}`
export const HISTORY_AGING_MS = 5000
type QueueItem = { key: string; sequence: number; enqueuedAt: number; run: () => void; cancel: () => void }
export function createHistoryClient(loader: (q: HistoryQuery, signal: AbortSignal) => Promise<MetricsHistory>, now = Date.now) {
  const cache = new Map<string, { data: MetricsHistory; ts: number }>()
  const snapshots = new WeakMap<Promise<MetricsHistory>, { data: MetricsHistory; ts: number }>()
  const inflight = new Map<string, Promise<MetricsHistory>>()
  const running = new Set<{ controller: AbortController; cancel: () => void }>()
  const queue: QueueItem[] = []
  const owners = new Map<symbol, readonly string[]>()
  let priorityKeys = new Set<string>()
  let sequence = 0
  const listeners = new Set<() => void>()
  let active = 0, generation = 0
  const aborted = () => new DOMException('History query invalidated', 'AbortError')
  const rank = (item: QueueItem) => now() - item.enqueuedAt >= HISTORY_AGING_MS ? 2 : priorityKeys.has(item.key) ? 1 : 0
  const pump = () => {
    while (active < 4 && queue.length) {
      const pick = queue.reduce((best, item, index) => rank(item) > rank(queue[best]) ||
        rank(item) === rank(queue[best]) && item.sequence < queue[best].sequence ? index : best, 0)
      queue.splice(pick, 1)[0].run()
    }
  }
  function createPriority(keys: readonly string[]) {
    const token = Symbol(), epoch = generation
    let disposed = false
    const rebuild = () => { priorityKeys = new Set([...owners.values()].flat()) }
    owners.set(token, [...keys]); rebuild()
    return {
      update: (next: readonly string[]) => {
        if (disposed || epoch !== generation) return
        owners.set(token, [...next]); rebuild(); pump()
      },
      dispose: () => {
        if (disposed || epoch !== generation) return
        disposed = true; owners.delete(token); rebuild()
      },
    }
  }
  function get(q: HistoryQuery, force = false): Promise<MetricsHistory> {
    const key = historyKey(q), shared = inflight.get(key), found = cache.get(key)
    if (shared) return shared
    if (!force && found && now() - found.ts < 60000) {
      const hit = Promise.resolve(found.data)
      snapshots.set(hit, found)
      return hit
    }
    const epoch = generation
    let resolve!: (data: MetricsHistory) => void, reject!: (error: unknown) => void
    const promise = new Promise<MetricsHistory>((yes, no) => { resolve = yes; reject = no })
    inflight.set(key, promise)
    queue.push({ key, sequence: sequence++, enqueuedAt: now(), cancel: () => reject(aborted()), run: () => {
      active++
      const item = { controller: new AbortController(), cancel: () => reject(aborted()) }
      running.add(item)
      Promise.resolve().then(() => { if (epoch !== generation) throw aborted(); return loader(q, item.controller.signal) }).then(data => {
        if (epoch !== generation) throw aborted()
        const entry = { data, ts: now() }
        cache.set(key, entry); snapshots.set(promise, entry)
        if (inflight.get(key) === promise) inflight.delete(key)
        resolve(data)
      }).catch(error => {
        if (inflight.get(key) === promise) inflight.delete(key)
        reject(error)
      }).finally(() => {
        running.delete(item); active--
        if (inflight.get(key) === promise) inflight.delete(key)
        pump()
      })
    } })
    pump(); return promise
  }
  function clear() {
    generation++; cache.clear(); inflight.clear(); owners.clear(); priorityKeys.clear()
    running.forEach(item => { item.cancel(); item.controller.abort() })
    queue.splice(0).forEach(item => item.cancel())
    listeners.forEach(listener => listener())
  }
  const getSnapshot = (q: HistoryQuery, force = false) => {
    const promise = get(q, force)
    return promise.then(() => snapshots.get(promise)!)
  }
  return { get, getSnapshot, createPriority, peekTimestamp: (q: HistoryQuery) => cache.get(historyKey(q))?.ts ?? null, clear,
    subscribeClear: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } }
}
export const historyClient = createHistoryClient((q, signal) => {
  const params = new URLSearchParams({ hours: String(q.hours), points: String(q.points), series: q.series })
  return api<MetricsHistory>(`/nodes/${q.id}/metrics?${params}`, { signal })
})
