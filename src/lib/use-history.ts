import { useDeadline } from "./use-deadline"
import { useEffect, useRef, useState } from 'react'
import type { MetricsHistory } from './api'
import { historyClient, historyKey, type HistoryQuery } from './history-client'
import { createHistoryBatchRunner, type BatchSnapshot } from './history-batch'

type BatchState = BatchSnapshot & { key: string }
const emptyState = (key: string, ids: number[] = []): BatchState => ({ key, histories: new Map<number, MetricsHistory>(), timestamps: new Map(), errors: new Map(), pendingIds: new Set(ids),
  progress: {total: ids.length, pending: ids.length, settled: 0, succeeded: 0, failed: 0}, loading: ids.length > 0 })
/** Shared lifecycle for single and batch consumers; ordering does not change query identity. */
export function useHistoryBatch(queries: HistoryQuery[], refreshKey = 0, options?: {priorityIds?: readonly number[]}) {
  const priorityIds = useRef(options?.priorityIds)
  priorityIds.current = options?.priorityIds
  const priorityHandle = useRef<ReturnType<typeof historyClient.createPriority> | null>(null)
  const key = [...new Set(queries.map(historyKey))].sort().join(',')
  const [state, setState] = useState(() => emptyState(key, queries.map(q => q.id)))
  const stateRef = useRef(state)
  const owner = useRef<object | null>(null)
  useEffect(() => {
    const current: HistoryQuery[] = key ? key.split(',').map(part => {
      const [id, hours, points, series] = part.split(':')
      return { id: Number(id), hours: Number(hours), points: Number(points), series: series as HistoryQuery['series'] }
    }) : []
    const priorityQueries = () => [...new Set(priorityIds.current ?? [])].flatMap(id => current.filter(q => q.id === id))
    const handle = historyClient.createPriority(priorityQueries().map(historyKey))
    priorityHandle.current = handle
    const token = {}
    owner.current = token
    let live = true, running: Promise<void> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const valid = () => live && owner.current === token
    const runner = createHistoryBatchRunner({
      getSnapshot: (query, force) => historyClient.getSnapshot(query, force),
      seed: () => stateRef.current.key === key ? stateRef.current : emptyState(key),
      publish: snapshot => {
        if (!valid()) return
        const next = {...snapshot, key}
        stateRef.current = next
        setState(previous => valid() ? next : previous)
      },
    })
    const load = (force = false): Promise<void> | undefined => {
      if (!valid() || document.hidden) return
      if (running) return running
      if (timer) clearTimeout(timer)
      const preferred = priorityQueries()
      const preferredKeys = new Set(preferred.map(historyKey))
      running = runner.run([...preferred, ...current.filter(q => !preferredKeys.has(historyKey(q)))], force).finally(() => {
        running = undefined
        if (valid() && !document.hidden && current.length) timer = setTimeout(() => { void load() }, 60000)
      })
      return running
    }
    const visible = () => { if (timer) clearTimeout(timer); if (!document.hidden) void load() }
    document.addEventListener('visibilitychange', visible)
    const unsubscribe = historyClient.subscribeClear(() => {
      live = false
      handle.dispose()
      runner.dispose()
      if (timer) clearTimeout(timer)
      if (owner.current === token) {
        const cleared = emptyState(key)
        stateRef.current = cleared
        setState(previous => owner.current === token ? cleared : previous)
      }
    })
    void load(refreshKey > 0)
    return () => { live = false; handle.dispose(); if (priorityHandle.current === handle) priorityHandle.current = null; runner.dispose(); if (owner.current === token) owner.current = null; if (timer) clearTimeout(timer); unsubscribe(); document.removeEventListener('visibilitychange', visible) }
  }, [key, refreshKey])
  useEffect(() => {
    const ids = new Set(priorityIds.current ?? [])
    priorityHandle.current?.update(queries.filter(q => ids.has(q.id)).map(historyKey))
  }, [key, options?.priorityIds])
  const visible = state.key === key ? state : emptyState(key, queries.map(q => q.id))
  const evaluatedAt = useDeadline([...visible.timestamps.values()].map(time => time + 120001))
  const updatedAt = visible.timestamps.size ? Math.min(...visible.timestamps.values()) : null
  return { ...visible, updatedAt, evaluatedAt, stale: visible.errors.size > 0 || (updatedAt !== null && Math.max(evaluatedAt, Date.now()) - updatedAt > 120000) }
}
export function useHistory(query: HistoryQuery | null, refreshKey = 0) {
  const batch = useHistoryBatch(query ? [query] : [], refreshKey)
  return { data: query ? batch.histories.get(query.id) ?? null : null, loading: query ? batch.pendingIds.has(query.id) : false,
    error: query ? batch.errors.get(query.id) ?? null : null, updatedAt: batch.updatedAt, stale: batch.stale }
}
