import { memo } from "react"
import { useNearViewport } from "@/lib/use-near-viewport"
import { TrafficQuota } from "./TrafficQuota"
import { Flag } from "@/lib/flags"
import type { Node } from "@/lib/api"
import { MiniChart } from "@/components/MiniChart"
import {
  bytes, diskPercent, expiry, expiryLevel, latencySeverity, lossSeverity, percent,
  platformOf, statsUrl, uptime,
} from "@/lib/format"

const EMPTY_BARS: { v: number | null; ts: number }[] = []

export type PingBar = { v: number | null; ts: number }

export type PingSummary = {
  bars: PingBar[]
  barsLoss: PingBar[]
  latency: number | null
  loss: number | null
  targets: number
} | null

const SEV_COLOR: Record<string, string> = {
  excellent: "#22c55e",
  good: "#4ade80",
  fair: "#facc15",
  poor: "#fb923c",
  bad: "#f87171",
  offline: "var(--secondary-text-color)",
}

function platformIcon(p: string): string {
  switch (p) {
    case "windows": return "ti-device-desktop"
    case "darwin": return "ti-device-laptop"
    default: return "ti-server"
  }
}

/** 节点卡片：名称行、两列资源、两列网速、延迟/丢包、到期/在线。 */
function NodeCardView({ node, ping, historyMessage, historyLoading = false, historyRetained = false, deferCharts = false }: { deferCharts?: boolean; node: Node; ping: PingSummary; historyMessage?: string; historyLoading?: boolean; historyRetained?: boolean }) {
  const { ref, ready } = useNearViewport(deferCharts)
  const m = node.metrics
  const offline = !node.online
  const platform = platformOf(node.os, node.virt)
  const cpuPct = m ? Math.min(100, m.cpu) : 0
  const memPct = m && node.mem_total > 0 ? Math.min(100, (m.mem_used / node.mem_total) * 100) : null
  const diskPct = m && node.disk_total > 0 ? diskPercent(m.disk_used, node.disk_total) : null
  const monthUsed = node.month_used ?? node.month_rx + node.month_tx
  const limit = node.traffic_limit
  const expLevel = expiryLevel(node.expires_in, !!node.expires_at)

  const expClass = expLevel === "expired" ? "text-error" : "text-warning"
  const latency = node.online && ping ? ping.latency : null
  const loss = node.online && ping ? ping.loss : null
  const latColor = latency === null ? "var(--secondary-text-color)" : SEV_COLOR[latencySeverity(latency)]
  const lossColor = loss === null ? "var(--secondary-text-color)" : SEV_COLOR[lossSeverity(loss)]

  return (
    <article ref={ref} data-node-id={node.id} data-testid="node-card" className={`server-card surface-card relative overflow-visible ${offline ? "is-offline" : ""}`}>
      {offline && (
        <div className="pointer-events-none absolute inset-0 z-[100] flex items-center justify-center overflow-hidden rounded-xl">
          <span className="offline-badge">
            <i className="ti ti-power mr-1.5" aria-hidden />
            离线{node.last_seen > 0 ? ` · ${new Date(node.last_seen * 1000).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
        </div>
      )}

      <div className="flex flex-col">
        <header className="flex items-center justify-between gap-1 px-3 pt-3">
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">
            <Flag code={node.country} title={node.country} />
            <h3 className="flex min-w-0 flex-1 items-center gap-1 text-xs font-medium" title={node.name}>
              <a href={statsUrl(node.id)} className="truncate hover:text-accent">{node.name}</a>
              <a href={statsUrl(node.id)} aria-label="查看详情"
                className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-secondary transition-colors hover:text-accent">
                <i className="ti ti-external-link text-[10px] leading-none" aria-hidden />
              </a>

            </h3>
          </div>
          <div className="ml-1 flex shrink-0 items-center gap-1.5">
            <span className="text-secondary" title={node.os || undefined}>
              <i className={`ti ${platformIcon(platform)} text-base`} aria-hidden />
            </span>
            <span className={`h-2 w-2 rounded-full ${offline ? "bg-error" : "bg-success"}`} title={offline ? "离线" : "在线"} />
          </div>
        </header>

        <div className="flex flex-col gap-2.5 px-3 pb-3 pt-2">
          {historyMessage && <p className="text-xs text-secondary">{historyMessage}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Metric label="CPU" icon="ti-cpu" value={percent(m ? m.cpu : null)} pct={cpuPct} fill="fill-cpu"
              tip={m ? `使用率 ${percent(m.cpu)}\n核心 ${node.cpu_cores || "--"}${node.cpu_name ? `\n${node.cpu_name}` : ""}` : undefined} />
            <Metric label="内存" icon="ti-device-sd-card" value={percent(memPct)} pct={memPct ?? 0} fill="fill-mem"
              tip={m ? `已用 ${bytes(m.mem_used)} / ${bytes(node.mem_total)}` : undefined} />
            <Metric label="磁盘" icon="ti-database" value={percent(diskPct, 0)} pct={diskPct ?? 0} fill="fill-disk"
              tip={m ? `已用 ${bytes(m.disk_used)} / ${bytes(node.disk_total)}` : undefined} />
            <div className="min-w-0"><span className="text-xs text-secondary">月度</span><TrafficQuota used={monthUsed} limit={limit} /></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between gap-2">
                <i className="ti ti-arrow-down md-12 text-secondary" aria-hidden />
                <span className="text-sm font-semibold tabular-nums text-success">
                  {m ? `${(m.net_rx / 125_000).toFixed(2)}` : "--"}<span className="text-[10px] font-medium"> Mbps</span>
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <i className="ti ti-cloud-download md-12 text-secondary" aria-hidden />
                <span className="text-xs tabular-nums text-secondary">{bytes(node.total_rx, 1)}</span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <i className="ti ti-arrow-up md-12 text-secondary" aria-hidden />
                <span className="text-sm font-semibold tabular-nums text-info">
                  {m ? `${(m.net_tx / 125_000).toFixed(2)}` : "--"}<span className="text-[10px] font-medium"> Mbps</span>
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <i className="ti ti-cloud-upload md-12 text-secondary" aria-hidden />
                <span className="text-xs tabular-nums text-secondary">{bytes(node.total_tx, 1)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 text-secondary">
                  <i className="ti ti-clock md-14" aria-hidden />
                  <span className="text-xs font-medium" role="status" aria-label={historyLoading ? (historyRetained ? "正在刷新历史…" : "正在加载历史…") : undefined} title={historyLoading ? (historyRetained ? "正在刷新历史…" : "正在加载历史…") : undefined}>{historyLoading ? (historyRetained ? "刷新中" : "加载中") : "延迟"}</span>
                </span>
                <span className="text-xs font-normal tabular-nums" style={{ color: latColor }}>
                  {latency !== null ? latency.toFixed(0) : "--"} ms
                </span>
              </div>
              <MiniChart active={ready} kind="latency" points={ping?.bars ?? EMPTY_BARS} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 text-secondary">
                  <i className="ti ti-antenna-bars-off md-14" aria-hidden />
                  <span className="text-xs font-medium">丢包率</span>
                </span>
                <span className="text-xs font-normal tabular-nums" style={{ color: lossColor }}>
                  {loss !== null ? loss.toFixed(1) : "--"} %
                </span>
              </div>
              <MiniChart active={ready} kind="loss" points={ping?.barsLoss ?? EMPTY_BARS} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-line pt-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-secondary">
                <i className="ti ti-calendar md-12" aria-hidden />
                <span className="text-xs font-medium">到期</span>
              </span>
              <span className={`text-xs font-normal tabular-nums ${expClass}`}>{expiry(node.expires_in, node.expires_at)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-secondary">
                <i className="ti ti-refresh md-12" aria-hidden />
                <span className="text-xs font-medium">在线</span>
              </span>
              <span className="text-xs font-normal tabular-nums text-info">{uptime(m ? m.uptime : null)}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

function Metric({ label, icon, value, pct, fill, tip }: {
  label: string
  icon: string
  value: string
  pct: number
  fill: string
  tip?: string
}) {
  return (
    <div className="min-w-0" title={tip}>
      <div className="mb-1 flex min-w-0 items-center justify-between">
        <span className="flex shrink-0 items-center gap-1 text-secondary">
          <i className={`ti ${icon} md-14`} aria-hidden />
          <span className="text-xs font-medium">{label}</span>
        </span>
        <span className="truncate text-xs tabular-nums text-main">{value}</span>
      </div>
      <div className="progress-track">
        <div className={`progress-fill ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export const NodeCard = memo(NodeCardView)
