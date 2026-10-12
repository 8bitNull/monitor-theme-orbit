import { memo } from "react"
import { SEVERITY_COLOR, latencySeverity, lossSeverity } from "@/lib/format"

/**
 * 卡片里的延迟/丢包最近 24 个时间桶迷你图：越近的越靠右，
 * 颜色按分级取值，悬停显示该时间桶的数值。
 */
function MiniChartView({ kind, points, active = true }: {
  active?: boolean
  kind: "latency" | "loss"
  points: { v: number | null; ts: number }[]
}) {
  const samples = points.slice(-24)
  const cells = [...samples]
  while (cells.length < 24) cells.unshift({ v: null, ts: 0 })
  const severityOf = kind === "latency" ? latencySeverity : lossSeverity
  const unit = kind === "latency" ? "ms" : "%"
  const sampleTime = samples.length
    ? `${new Date(samples[0].ts * 1000).toISOString()} 至 ${new Date(samples.at(-1)!.ts * 1000).toISOString()}`
    : "暂无样本"
  return (
    <div className="mini-chart" role="img" aria-label={`${kind === "latency" ? "延迟" : "丢包率"}最近 ${samples.length} 个时间桶，样本时间 ${sampleTime}，最新${points.at(-1)?.v != null ? `${points.at(-1)!.v!.toFixed(kind === "latency" ? 0 : 1)}${unit}` : "无数据"}`}>
      {active && cells.map((c, i) => {
        const sev = severityOf(c.v)
        const color = c.v === null ? SEVERITY_COLOR.offline : SEVERITY_COLOR[sev]
        return (
          <div key={i} style={{ background: color, height: c.v === null ? 2 : 10, opacity: c.v === null ? 0.5 : 1 }}
            title={c.v === null ? "无数据" : `${c.v.toFixed(unit === "ms" ? 0 : 1)} ${unit}`} />
        )
      })}
    </div>
  )
}

export const MiniChart = memo(MiniChartView)
