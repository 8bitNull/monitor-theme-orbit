import { qualityEmptyMessage } from '@/lib/history-status'
import { Echart, tooltipBase } from "@/components/Echart"
import type { MetricsHistory } from "@/lib/api"
import { latencySeverity } from "@/lib/format"
import { summarizeQuality, probeJitter } from "@/lib/quality"
import { useMemo, useState } from "react"

/**
 * 详情页的网络质量标签：概览（延迟/抖动/丢包/成功率）、监控目标列表、趋势折线。
 * 数据全部来自 hub 的 ping 序列。
 */

const PROBE_COLORS = ["#60a5fa", "#818cf8", "#f97316", "#34d399", "#f472b6", "#facc15", "#22d3ee", "#a3e635"]

export function NodeQuality({ history, hours, onHours, loading = false, error = null, stale = false, onRefresh }: {
  history: MetricsHistory | null
  hours: number
  onHours: (h: number) => void
  loading?: boolean
  error?: string | null
  stale?: boolean
  onRefresh?: () => void
}) {
  const probes = history?.probes ?? {}
  const ping = history?.ping ?? []
  const taskIds = useMemo(() => [...new Set([...Object.keys(probes).map(Number), ...ping.map((p) => p.task_id)])].sort((a, b) => a - b), [ping, probes])

  const overview = useMemo(() => history ? summarizeQuality(history) : null, [history])
  const jit = useMemo(() => probeJitter(ping), [ping])

  const [hidden, setHidden] = useState<number[]>([])

  const ranges = [
    { h: 1, label: "1h" },
    { h: 6, label: "6h" },
    { h: 24, label: "24h" },
    { h: 168, label: "7d" },
  ]

  return (
    <div className="space-y-4">
      {loading && <p role="status">正在加载历史…</p>}
      {error && <p role="alert">{error}</p>}
      {stale && history && <p role="status">数据已过期</p>}
      <section className="surface-card p-3">
        <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-base font-bold">网络质量 <span className="text-xs font-normal text-secondary">{hours === 168 ? "7d" : `${hours}h`}</span></h1>
          <button className="toolbar-chip min-h-11" onClick={onRefresh} aria-label="刷新网络质量"><i className="ti ti-refresh" aria-hidden /></button>
          <div className="toolbar-btn-group">
            {ranges.map(r => <button key={r.h} aria-pressed={hours === r.h} onClick={() => onHours(r.h)} className={`toolbar-btn-group-item !min-h-11 !w-auto !px-3 ${hours === r.h ? "active" : ""}`}>{r.label}</button>)}
          </div>
        </header>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="有效桶延迟均值" value={overview?.avgLatency != null ? overview.avgLatency.toFixed(0) : "--"} unit="ms" />
          <Stat label="抖动（波动）" value={jit !== null ? jit.toFixed(0) : "--"} unit="ms" />
          <Stat label="目标平均丢包率" value={overview?.windowLoss != null ? overview.windowLoss.toFixed(1) : "--"} unit="%" />
        </div>
        {overview?.estimatedLoss && <p className="mt-2 text-xs text-secondary">丢包为桶均值估算。</p>}
        <div className="mt-2 text-xs text-secondary"><h2 className="mb-1 font-medium">统计说明</h2>
          <p>延迟为有效桶的算术平均；丢包为各目标窗口统计的平均。目标平均成功率：{overview?.success != null ? `${overview.success.toFixed(1)}%` : "--"}</p>
          <p className="mt-1">灰色：无延迟值，可能为超时；目标详情保留窗口丢包和样本状态。</p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr]">

        <section className="surface-card p-4">
          <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <i className="ti ti-chart-line text-accent" aria-hidden />趋势
            </h2>
          </header>
          {ping.length ? (
            <Echart label={`网络延迟趋势，最近 ${hours} 小时；各目标延迟与丢包概况见监控目标列表`} className="h-96 w-full" option={trendOption(ping, probes, taskIds, hidden)} />
          ) : (
            <p className="flex h-96 items-center justify-center text-sm text-secondary">{loading ? "正在加载历史…" : error ? "历史数据获取失败" : qualityEmptyMessage(history)}</p>
          )}
        </section>
        <div className="quality-targets xl:order-first">
        <section className="surface-card h-fit w-full max-w-2xl p-4 xl:max-w-none">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <i className="ti ti-list-details text-accent" aria-hidden />监控目标
              <span className="text-xs font-normal text-secondary">{taskIds.length} 个</span>
            </h2>
          </header>
          <div className="space-y-2">
            {taskIds.map((id) => {
              const series = ping.filter((p) => p.task_id === id)
              const summary = summarizeQuality(history!, id)
              const avg = summary.avgLatency
              const jit = probeJitter(series)
              const loss = summary.windowLoss
              const shown = !hidden.includes(id)
              // 最近 10 个桶的点阵：一眼看出最近探测的成色。
              const dots = recentDots(series)
              return (
                <button key={id} aria-pressed={shown} onClick={() => setHidden((h) => h.includes(id) ? h.filter((x) => x !== id) : [...h, id])}
                  className={`inner-card w-full p-3 text-left transition-opacity ${shown ? "" : "opacity-40"}`}>
                  <div className="break-words text-sm font-semibold" title={probes[String(id)] ?? `目标 ${id}`}>
                    {probes[String(id)] ?? `目标 ${id}`}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-secondary">
                    <span>TCPING · 有效桶延迟均值 {avg !== null ? `${avg.toFixed(0)}ms` : series.length ? "无延迟值" : "暂无样本"}</span>
                    <span>
                      {loss !== null ? `窗口丢包 ${loss.toFixed(1)}%` : ""}
                      {jit !== null ? `${loss !== null ? " · " : ""}抖动 ${jit.toFixed(0)}ms` : ""}
                    </span>
                  </div>
                  <div role="img" aria-label={`最近 ${hours} 小时探测，最新延迟 ${summary.latestLatency === null ? "无延迟值" : `${summary.latestLatency.toFixed(0)}ms`}，窗口丢包率 ${loss === null ? "暂无样本" : `${loss.toFixed(1)}%`}`} className="mt-2 flex items-center gap-[3px]">
                    {dots.map((d, i) => (
                      <span key={i} className="h-1.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: d.v === null ? "var(--hover-bg-color)" : SEVERITY_BG[latencySeverity(d.v)] }}
                        title={d.v === null ? d.loss === 100 ? "全部超时（丢包 100%）" : "无延迟值或缺少样本" : `${d.v.toFixed(0)} ms`} />
                    ))}
                  </div>
                </button>
              )
            })}
            {taskIds.length === 0 && (
              <p className="py-6 text-center text-xs text-secondary">{loading ? "正在加载历史…" : error ? "历史数据获取失败" : qualityEmptyMessage(history)}</p>
            )}
          </div>
        </section>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-lg bg-inner p-2">
      <div className="text-xs text-secondary">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">
        {value}<span className="ml-1 text-xs font-medium text-secondary">{unit}</span>
      </div>
    </div>
  )
}

export function trendOption(ping: MetricsHistory["ping"], probes: Record<string, string>, taskIds: number[], hidden: number[]) {
  return {
    tooltip: tooltipBase(),
    legend: { top: 0, type: "scroll", textStyle: { color: "#a0a0a0", fontSize: 12 } },
    grid: { left: 56, right: 12, top: 34, bottom: 26 },
    xAxis: {
      type: "time",
      axisLabel: { color: "#a0a0a0", fontSize: 11, formatter: (v: number) => new Date(v).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
    },
    yAxis: { type: "value", axisLabel: { color: "#a0a0a0", fontSize: 11, formatter: "{value} ms" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } } },
    series: taskIds.filter((id) => !hidden.includes(id)).map((id, i) => ({
      name: probes[String(id)] ?? `目标 ${id}`,
      type: "line",
      smooth: true,
      showSymbol: false,
      connectNulls: false,
      data: ping.filter((p) => p.task_id === id).sort((a, b) => a.ts - b.ts).map((p) => [p.ts * 1000, p.latency]),
      lineStyle: { color: PROBE_COLORS[i % PROBE_COLORS.length], width: 1.5 },
      itemStyle: { color: PROBE_COLORS[i % PROBE_COLORS.length] },
    })),
  }
}

/** Preserve every timestamp, including timeout-only buckets. */
function recentDots(series: MetricsHistory["ping"]) {
  const s = summarizeQuality({ metrics: [], probes: {}, ping: series })
  const dots = s.bars.slice(-10).map(bar => ({v: bar.v, loss: s.barsLoss.find(p => p.ts === bar.ts)?.v ?? null}))
  while (dots.length < 10) dots.unshift({v: null, loss: null})
  return dots
}

const SEVERITY_BG: Record<string, string> = {
  excellent: "#22c55e",
  good: "#4ade80",
  fair: "#facc15",
  poor: "#fb923c",
  bad: "#f87171",
  offline: "var(--hover-bg-color)",
}
