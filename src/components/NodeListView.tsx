import { memo } from "react"
import { Flag } from "@/lib/flags"
import type { Node } from "@/lib/api"
import type { PingSummary } from "@/components/NodeCard"
import {
  bytes, diskPercent, expiry, latencySeverity, lossSeverity, percent, statsUrl, traffic, uptime,
} from "@/lib/format"

const SEV_HEX: Record<string, string> = {
  excellent: "#22c55e", good: "#4ade80", fair: "#facc15", poor: "#fb923c", bad: "#f87171",
  offline: "var(--secondary-text-color)",
}

/** 列表视图：桌面端一行一节点的紧凑表格；移动端改为带标签的两段式行。 */
export function NodeListView({ nodes, ping, historyMessages, historyStatuses }: {
  nodes: Node[]
  ping: Map<number, PingSummary>
  historyMessages?: Map<number, string>
  historyStatuses?: ReadonlyMap<number, {loading: boolean; retained: boolean}>
}) {
  return (
    <div className="surface-card divide-y divide-line overflow-hidden">
      <div className="hidden items-center gap-3 px-3 py-2 text-xs text-secondary md:flex">
        <span className="w-44 shrink-0">节点</span>
        <span className="w-36 shrink-0">到期 / 在线</span>
        <span className="flex-1 text-center">CPU</span>
        <span className="flex-1 text-center">内存</span>
        <span className="flex-1 text-center">硬盘</span>
        <span className="flex-1 text-center">IN / OUT</span>
        <span className="flex-1 text-center">↓总 / ↑总</span>
        <span className="flex-1 text-center">PING / LOSS</span>
        <span className="flex-1 text-center">月度用量</span>
      </div>
      {nodes.map((n) => (
        <NodeRow key={n.id} node={n} ping={ping.get(n.id) ?? null} historyMessage={historyMessages?.get(n.id)} historyLoading={historyStatuses?.get(n.id)?.loading ?? false} historyRetained={historyStatuses?.get(n.id)?.retained ?? false} />
      ))}
    </div>
  )
}

function Latency({ s }: { s: NonNullable<PingSummary> }) {
  const sev = latencySeverity(s.latency)
  return (
    <span className="tabular-nums" style={{ color: SEV_HEX[sev] }}>
      {s.latency !== null ? s.latency.toFixed(0) : "--"}
    </span>
  )
}

function Loss({ s }: { s: NonNullable<PingSummary> }) {
  const sev = lossSeverity(s.loss)
  return (
    <span className="tabular-nums" style={{ color: SEV_HEX[sev] }}>
      {s.loss !== null ? s.loss.toFixed(1) : "--"}
    </span>
  )
}

function NodeRowView({ node, ping, historyMessage, historyLoading = false, historyRetained = false }: { node: Node; ping: PingSummary; historyMessage?: string; historyLoading?: boolean; historyRetained?: boolean }) {
  const loadingLabel = historyLoading ? (historyRetained ? "正在刷新历史…" : "正在加载历史…") : undefined
  const m = node.metrics
  const memPct = m && node.mem_total > 0 ? (m.mem_used / node.mem_total) * 100 : null
  const diskPct = m && node.disk_total > 0 ? diskPercent(m.disk_used, node.disk_total) : null
  const monthUsed = node.month_used ?? node.month_rx + node.month_tx
  const down = m ? (m.net_rx / 125_000).toFixed(1) : "--"
  const up = m ? (m.net_tx / 125_000).toFixed(1) : "--"

  return (
    <>
      {/* 桌面端表格行 */}
      <a data-node-id={node.id} href={statsUrl(node.id)}
        className={`hidden items-center gap-3 px-3 py-2.5 text-xs transition-colors hover:bg-hover md:flex ${!node.online ? "opacity-70" : ""}`}>
        <span className="flex w-44 min-w-0 shrink-0 items-center gap-1.5">
          <Flag code={node.country} title={node.country} />

          <span className={`truncate font-medium ${node.online ? "text-main" : "text-secondary"}`}>{node.name}</span>
          {!node.online && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-error" title="离线" />}
        </span>
        <span className="w-36 shrink-0 tabular-nums text-secondary">
          {expiry(node.expires_in, node.expires_at)} | {uptime(m ? m.uptime : null)}
        </span>
        <span className="flex-1 text-center tabular-nums">{percent(m ? m.cpu : null)}</span>
        <span className="flex-1 text-center tabular-nums">{percent(memPct)}</span>
        <span className="flex-1 text-center tabular-nums">{percent(diskPct, 0)}</span>
        <span className="flex-1 text-center tabular-nums">
          <span className="text-success">{down}</span> / <span className="text-info">{up}</span>
          <span className="text-secondary"> Mbps</span>
        </span>
        <span className="flex-1 text-center tabular-nums text-secondary">
          {bytes(node.total_rx, 1)} / {bytes(node.total_tx, 1)}
        </span>
        <span className="flex-1 text-center">
          <span className="inline-block w-3" role="status" aria-label={loadingLabel} title={loadingLabel}>{historyLoading ? "↻" : ""}</span>{ping ? <><Latency s={ping} /> / <Loss s={ping} /></> : <span className="text-secondary">--</span>}
          {historyMessage && <span className="block text-secondary">{historyMessage}</span>}
        </span>
        <span className="flex-1 text-center tabular-nums">
          已用 {traffic(monthUsed)} / {node.traffic_limit > 0 ? traffic(node.traffic_limit) : "不限"}
        </span>
      </a>

      {/* 移动端两段式行：名称行 + 带标签的指标网格 */}
      <a data-node-id={node.id} href={statsUrl(node.id)}
        className={`block px-3 py-3 transition-colors hover:bg-hover md:hidden ${!node.online ? "opacity-70" : ""}`}>
        <div className="flex items-center gap-1.5">
          <Flag code={node.country} title={node.country} />

          <span className={`min-w-0 flex-1 truncate text-sm font-medium ${node.online ? "text-main" : "text-secondary"}`}>
            {node.name}
          </span>
          {!node.online && <span className="shrink-0 rounded bg-error/15 px-1.5 py-0.5 text-[10px] font-medium text-error">离线</span>}
          <span className={`shrink-0 text-xs tabular-nums ${node.online ? "text-secondary" : "text-secondary"}`}>
            {expiry(node.expires_in, node.expires_at)}
          </span>
        </div>
        {historyMessage && <p className="mt-2 text-xs text-secondary">{historyMessage}</p>}
        <div className="mt-2.5 grid grid-cols-3 gap-x-2 gap-y-2 text-xs">
          <Cell label="CPU" value={percent(m ? m.cpu : null)} />
          <Cell label="内存" value={percent(memPct)} />
          <Cell label="硬盘" value={percent(diskPct, 0)} />
          <Cell label="下载" value={<><span className="text-success">{down}</span><span className="text-secondary"> Mbps</span></>} />
          <Cell label="上传" value={<><span className="text-info">{up}</span><span className="text-secondary"> Mbps</span></>} />
          <Cell label="月度" value={`已用 ${traffic(monthUsed)} / ${node.traffic_limit > 0 ? traffic(node.traffic_limit) : "不限"}`} />
          <Cell label={<span role="status" aria-label={loadingLabel} title={loadingLabel}>{historyLoading ? (historyRetained ? "刷新中" : "加载中") : "PING"}</span>} value={ping ? <Latency s={ping} /> : "--"} />
          <Cell label="丢包" value={ping ? <><Loss s={ping} /><span className="text-secondary"> %</span></> : "--"} />
          <Cell label="在线" value={uptime(m ? m.uptime : null)} />
        </div>
      </a>
    </>
  )
}

function Cell({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-secondary">{label}</div>
      <div className="mt-0.5 truncate tabular-nums text-main">{value}</div>
    </div>
  )
}

const NodeRow = memo(NodeRowView)
