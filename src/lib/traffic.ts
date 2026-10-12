import type { MetricsPoint } from './api'
export type TrafficInterval = { start: number; end: number; rx: number | null; tx: number | null }
export const toMbps = (rate: number) => rate / 125000
export function sampleStep(hours: number, points: number): number {
  const budget = Math.max(60, Math.min(1440, Math.floor(points)))
  return 60 * Math.max(1, Math.ceil(hours * 60 / budget))
}
export function estimateTraffic(points: MetricsPoint[], stepSeconds: number): TrafficInterval[] {
  const unique = new Map<number, MetricsPoint>()
  for (const p of points) if (Number.isFinite(p.ts)) unique.set(p.ts, p)
  const rows = [...unique.values()].sort((a, b) => a.ts - b.ts)
  return rows.slice(1).map((b, i) => {
    const a = rows[i], dt = b.ts - a.ts
    const valid = Number.isFinite(stepSeconds) && stepSeconds > 0 && dt > 0 && dt <= stepSeconds * 1.5
    const volume = (v: number) => valid && Number.isFinite(v) && v >= 0 ? v * dt : null
    return { start: a.ts, end: b.ts, rx: volume(a.net_rx), tx: volume(a.net_tx) }
  })
}
export function quota(used: number, limit: number): { percent: number | null; tone: 'neutral' | 'normal' | 'warning' | 'danger' } {
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(used) || used < 0) return { percent: null, tone: 'neutral' }
  const raw = used / limit * 100
  return { percent: Math.min(100, raw), tone: raw >= 100 ? 'danger' : raw >= 80 ? 'warning' : 'normal' }
}
