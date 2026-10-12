import type { MetricsHistory, PingPoint } from './api'
export type QualitySummary = {
  targets: number; avgLatency: number | null; windowLoss: number | null
  success: number | null; estimatedLoss: boolean
  latestLatency: number | null; latestLoss: number | null; latestTs: number | null
  bars: { ts: number; v: number | null }[]; barsLoss: { ts: number; v: number | null }[]
}
const mean = (xs: number[]) => xs.length ? xs.reduce((a,b) => a+b,0)/xs.length : null
const validLatency = (p: PingPoint) => p.latency !== null && Number.isFinite(p.latency) && p.latency >= 0
const rowLoss = (p: PingPoint) => p.loss === undefined ? 0 : Number.isFinite(p.loss) && p.loss >= 0 && p.loss <= 100 ? p.loss : null
export function summarizeQuality(h: MetricsHistory, targetId?: number): QualitySummary {
  const rows = h.ping.filter(p => Number.isFinite(p.ts) && (targetId === undefined || p.task_id === targetId))
  const targets = new Map<number, PingPoint[]>()
  const buckets = new Map<number, PingPoint[]>()
  for (const p of rows) {
    targets.set(p.task_id, [...(targets.get(p.task_id) ?? []), p])
    buckets.set(p.ts, [...(buckets.get(p.ts) ?? []), p])
  }
  const stamps = [...buckets.keys()].sort((a,b) => a-b)
  const bars = stamps.map(ts => ({ts, v: mean(buckets.get(ts)!.filter(validLatency).map(p => p.latency!))}))
  const barsLoss = stamps.map(ts => ({ts, v: mean(buckets.get(ts)!.map(rowLoss).filter((v): v is number => v !== null))}))
  const estimatedLoss = h.loss === undefined && targets.size > 0
  const losses = [...targets].map(([id, points]) => {
    if (h.loss === undefined) return mean(points.map(rowLoss).filter((v): v is number => v !== null))
    const loss = h.loss[String(id)] ?? 0
    return Number.isFinite(loss) && loss >= 0 && loss <= 100 ? loss : null
  }).filter((v): v is number => v !== null)
  const windowLoss = mean(losses)
  return {targets: targets.size, avgLatency: mean(rows.filter(validLatency).map(p => p.latency!)), windowLoss,
    success: windowLoss === null ? null : 100-windowLoss, estimatedLoss,
    latestLatency: bars.at(-1)?.v ?? null, latestLoss: barsLoss.at(-1)?.v ?? null, latestTs: stamps.at(-1) ?? null, bars, barsLoss}
}
/** Adjacent buckets within each target; a timeout breaks adjacency. */
export function probeJitter(rows: PingPoint[]): number | null {
  const targets = new Map<number, PingPoint[]>()
  for (const row of rows.filter(p => Number.isFinite(p.ts))) targets.set(row.task_id, [...(targets.get(row.task_id) ?? []), row])
  const changes: number[] = []
  for (const points of targets.values()) {
    points.sort((a,b) => a.ts-b.ts)
    for (let i=1;i<points.length;i++) {
      const a=points[i-1], b=points[i]
      if (b.ts > a.ts && validLatency(a) && validLatency(b)) changes.push(Math.abs(b.latency!-a.latency!))
    }
  }
  return mean(changes)
}
