import type { HistoryStatus } from './history-status'
import { useCallback, useMemo, useState } from 'react'
import type { Node, MetricsHistory } from './api'
import { summarizeQuality, type QualitySummary } from './quality'
import type { PingSummary } from '@/components/NodeCard'
import { useHistoryBatch } from './use-history'

export function useQualitySummaries(ids: number[], hours: number, targetId?: number, priorityIds?: readonly number[]) {
  const idsKey = [...new Set(ids)].sort((a, b) => a - b).join(',')
  const [nonce, setNonce] = useState(0)
  const queries = idsKey ? idsKey.split(',').map(Number).map(id => ({ id, hours, points: 288, series: 'ping' as const })) : []
  const batch = useHistoryBatch(queries, nonce, {priorityIds})
  const summaries = useMemo(() => new Map([...batch.histories].map(([id, history]) => [id, cachedQuality(history, targetId)])), [batch.histories, targetId])
  const probes = useMemo(() => {
    const targets = new Map<number, string>()
    for (const history of batch.histories.values()) {
      for (const [id, name] of Object.entries(history.probes)) targets.set(Number(id), name)
      for (const point of history.ping) if (!targets.has(point.task_id)) targets.set(point.task_id, `目标 ${point.task_id}`)
    }
    return targets
  }, [batch.histories])
  const statuses = useMemo(() => new Map<number, HistoryStatus>((idsKey ? idsKey.split(',').map(Number) : []).map(id => {
    const timestamp = batch.timestamps.get(id)
    return [id, { loading: batch.pendingIds.has(id), failed: batch.errors.has(id), retained: batch.histories.has(id),
      stale: batch.errors.has(id) || (timestamp !== undefined && Math.max(batch.evaluatedAt, Date.now()) - timestamp > 120000) }]
  })), [idsKey, batch.pendingIds, batch.errors, batch.histories, batch.timestamps, batch.evaluatedAt])
  const refresh = useCallback(() => setNonce(n => n + 1), [])
  return { statuses, summaries, histories: batch.histories, probes, timestamps: batch.timestamps, updatedAt: batch.updatedAt,
    progress: batch.progress, pendingIds: batch.pendingIds, loading: batch.loading, stale: batch.stale, errorIds: [...batch.errors.keys()], refresh }
}
/** Cards and quality page share exactly the same 24h/288-point cache keys. */
export function usePingSummaries(nodes: Node[] | null): Map<number, PingSummary> {
  const result = useQualitySummaries((nodes ?? []).map(node => node.id), 24)
  return useMemo(() => new Map([...result.histories].map(([id, history]) => [id, summarize(history)])), [result.histories])
}
const qualityCache = new WeakMap<MetricsHistory, Map<number | string, QualitySummary>>()
const pingCache = new WeakMap<MetricsHistory, PingSummary>()
export function cachedQuality(history: MetricsHistory, targetId?: number): QualitySummary {
  let targets = qualityCache.get(history)
  if (!targets) { targets = new Map(); qualityCache.set(history, targets) }
  const key = targetId ?? 'all'
  let summary = targets.get(key)
  if (!summary) { summary = summarizeQuality(history, targetId); targets.set(key, summary) }
  return summary
}
export function summarize(history: MetricsHistory): PingSummary {
  if (pingCache.has(history)) return pingCache.get(history)!
  const s = cachedQuality(history)
  if (!s.targets) { pingCache.set(history, null); return null }
  const result = { bars: s.bars.slice(-24), barsLoss: s.barsLoss.slice(-24), latency: s.latestLatency, loss: s.latestLoss, targets: s.targets }
  pingCache.set(history, result)
  return result
}
