import { focusRouteMain } from "@/lib/navigation"
import { useVisibleNodes } from '@/lib/use-visible-nodes'
import { historyMessage, qualityEmptyMessage } from '@/lib/history-status'
import { useQualitySummaries } from "@/lib/ping"
import { MiniChart } from "@/components/MiniChart"
import { Flag } from "@/lib/flags"
import { Skeleton } from "@/components/ui"
import { type Node } from "@/lib/api"
import { type QualitySummary } from "@/pages/quality-data"
import { latencySeverity, lossSeverity, statsUrl } from "@/lib/format"
import { useMemo, useState } from "react"

/**
 * 全局网络质量页：DStatus 的布局外壳（页头统计 + 搜索/时间范围/状态/布局筛选），
 * 内容区为每节点一张延迟/丢包摘要卡（经典卡片视图）。
 */

const EMPTY_BARS: { v: number | null; ts: number }[] = []

type Layout = "explore" | "classic"
type StatusF = "all" | "online" | "offline"

export function NetworkQualityPage({ nodes, dark, query, onQuery }: { nodes: Node[] | null; dark: boolean; query: string; onQuery: (value: string) => void }) {
  void dark
  const [layout, setLayout] = useState<Layout>("classic")
  const [status, setStatus] = useState<StatusF>("all")
  const [range, setRange] = useState(24)
  const [target,setTarget]=useState("all")
  const candidates = useMemo(
    () => (nodes ?? []).filter((n) => {
      if (status === "online" && !n.online) return false
      if (status === "offline" && n.online) return false
      return true
    }),
    [nodes, status],
  )

  const filtered = useMemo(() => candidates.filter((n) => !query.trim() || n.name.toLowerCase().includes(query.trim().toLowerCase())), [candidates, query])

  const {rootRef,priorityIds}=useVisibleNodes(filtered.map(n=>n.id))
  const { statuses, histories, probes, summaries, updatedAt: updated, loading, progress, errorIds, stale, refresh } = useQualitySummaries((nodes ?? []).map(n => n.id), range,target==="all"?undefined:Number(target),priorityIds)

  const nodeMessage = (id: number) => {
    const status = statuses.get(id)
    return (status && historyMessage(status)) || qualityEmptyMessage(histories.get(id), target === 'all' ? undefined : Number(target))
  }

  const visibleSummaries = useMemo(() => filtered.map(n => summaries.get(n.id) ?? null), [filtered, summaries])
  const totals = useMemo(() => ({
    nodes: filtered.length,
    targets: visibleSummaries.reduce((acc, s) => acc + (s ? s.targets : 0), 0),
    latency: avgOf(visibleSummaries.map((s) => s ? avgOf(s.bars.map(b=>b.v)) : null)),
    success: successOf(visibleSummaries),
    estimatedLoss: visibleSummaries.some(s => s?.success != null && s.estimatedLoss),
  }), [filtered.length, visibleSummaries])

  return (
    <main ref={focusRouteMain} tabIndex={-1} className="w-full mx-auto max-w-screen-2xl quality-page space-y-3 px-4 pb-8 pt-20 sm:px-6 lg:px-8">
      <section className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <i className="ti ti-wifi text-accent" aria-hidden />网络质量监控
          </h1>
          <details className="quality-help text-xs text-secondary"><summary className="inline-flex min-h-11 cursor-pointer items-center">统计口径</summary><p>当前范围有样本的节点×目标组合；延迟为节点有效桶均值的等权平均，成功率为目标窗口成功率的平均{totals.estimatedLoss ? "；包含旧接口桶均值估算" : ""}</p></details>
        </div>
        {progress.pending > 0 && <p className="text-xs text-secondary">历史仍在加载，统计暂不完整</p>}
        <div className="quality-totals grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Chip label="总节点" value={String(totals.nodes)} tone="primary" />
          <Chip label="监测组合数" value={String(totals.targets)} tone="success" />
          <Chip label="有效桶延迟均值" value={totals.latency !== null ? `${totals.latency.toFixed(0)}ms` : "--"} tone="info" />
          <Chip label="目标平均成功率" value={totals.success !== null ? `${totals.success.toFixed(1)}%${totals.estimatedLoss ? "（估算）" : ""}` : "--"} tone="warning" />
        </div>
      </section>

      <section className="surface-card quality-controls space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 basis-full flex-col gap-1 sm:basis-auto">
            <span className="text-xs text-secondary">搜索节点名称</span>
            <span className="relative block">
              <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-sm text-secondary" aria-hidden />
              <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="搜索节点名称"
                className="w-full rounded-lg border border-line bg-inner min-h-11 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-secondary focus:border-accent" />
            </span>
          </label>
          <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs text-secondary"><span className="sr-only">监控目标</span>
            <select aria-label="监控目标" value={target} onChange={e=>setTarget(e.target.value)} className="min-h-11 max-w-full rounded-lg border border-line bg-inner px-2 text-primary">
              <option value="all">全部目标</option>
              {[...probes].sort(([a],[b])=>a-b).map(([id,name])=><option key={id} value={id}>{[...probes.values()].filter(n=>n===name).length>1?`${name}（#${id}）`:name}</option>)}
            </select>
          </label>
          <div role="group" aria-label="时间范围" className="flex flex-col gap-1">
            <span className="text-xs text-secondary">时间范围</span>
            <span className="toolbar-btn-group">
              {[1, 6, 24, 168].map((h) => (
                <button key={h} aria-pressed={range === h} onClick={() => setRange(h)}
                  className={`toolbar-btn-group-item !w-auto !px-2.5 ${range === h ? "active" : ""}`}>
                  {h === 168 ? "7 天" : `${h} 小时`}
                </button>
              ))}
            </span>
          </div>
          <button onClick={refresh} className="toolbar-chip min-h-11" aria-label="刷新网络质量">刷新</button>
        </div>
        <details className="quality-more text-xs">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-secondary">更多筛选{(status !== "all" || layout !== "classic") && <span className="text-accent"> · {status === "online" ? "在线" : status === "offline" ? "离线" : "全部"} · {layout === "explore" ? "探索视图" : "经典卡片"}</span>}</summary>
          <div className="flex flex-wrap gap-3 pb-2">
          <div role="group" aria-label="节点状态" className="flex flex-col gap-1">
            <span className="text-xs text-secondary">节点状态</span>
            <span className="toolbar-btn-group">
              {([["all", "全部"], ["online", "在线"], ["offline", "离线"]] as const).map(([v, l]) => (
                <button key={v} aria-pressed={status === v} onClick={() => setStatus(v)}
                  className={`toolbar-btn-group-item !w-auto !px-2.5 ${status === v ? "active" : ""}`}>{l}</button>
              ))}
            </span>
          </div>
          <div role="group" aria-label="布局" className="flex flex-col gap-1">
            <span className="text-xs text-secondary">布局</span>
            <span className="toolbar-btn-group">
              <button aria-pressed={layout === "explore"} onClick={() => setLayout("explore")} className={`toolbar-btn-group-item !w-auto !px-2.5 ${layout === "explore" ? "active" : ""}`}>探索视图</button>
              <button aria-pressed={layout === "classic"} onClick={() => setLayout("classic")} className={`toolbar-btn-group-item !w-auto !px-2.5 ${layout === "classic" ? "active" : ""}`}>经典卡片</button>
            </span>
          </div>
          </div>
          <p className="text-secondary">{!loading && errorIds.length === 0 && !stale && <>历史已完成 {progress.settled}/{progress.total} · </>}最后更新：{updated ? new Date(updated).toLocaleTimeString("zh-CN") : "--"}</p>
        </details>
        <div role="status" className="flex flex-wrap gap-2 text-xs text-secondary">
          {(loading || errorIds.length > 0 || stale) && <span>历史已完成 {progress.settled}/{progress.total}</span>}
          {loading && <span>正在加载历史… </span>}
          {errorIds.length > 0 && <span>部分历史获取失败（{errorIds.length}） </span>}
          {stale && <span>数据已过期 </span>}
        </div>
      </section>

      <div ref={rootRef}>
      {!nodes ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : layout === "classic" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((n) => (
            <QualityCard key={n.id} node={n} summary={summaries.get(n.id) ?? null} hours={range} message={nodeMessage(n.id)} />
          ))}
        </div>
      ) : (
        <div className="surface-card divide-y divide-line overflow-hidden">
          {filtered.map((n) => {
            const s = summaries.get(n.id) ?? null
            const sev = latencySeverity(s?.avgLatency ?? null)
            return (
              <a key={n.id} data-node-id={n.id} href={`${statsUrl(n.id)}?tab=quality&hours=${range}`} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-hover">
                <Flag code={n.country} title={n.country} />
                <span className="w-40 truncate text-sm font-medium">{n.name}</span>
                <span className="text-xs tabular-nums text-secondary">
                  {s?.avgLatency !== null && s?.avgLatency !== undefined ? `${s.avgLatency.toFixed(0)} ms` : "--"} · 目标平均丢包率{" "}
                  {s?.windowLoss !== null && s?.windowLoss !== undefined ? `${s.windowLoss.toFixed(1)}%` : "--"}
                  {s?.estimatedLoss && "（桶均值估算）"}
                </span>
                {nodeMessage(n.id) && <span className="text-xs text-secondary">{nodeMessage(n.id)}</span>}
                <span className="ml-auto flex h-2 w-2 rounded-full"
                  style={{ background: SEV_HEX[sev] }} />
              </a>
            )
          })}
        </div>
      )}

      </div>
      {nodes && filtered.length === 0 && (
        <p className="py-16 text-center text-sm text-secondary">没有符合条件的节点。</p>
      )}
    </main>
  )
}

function QualityCard({ node, summary, hours, message }: { node: Node; summary: QualitySummary | null; hours:number; message:string }) {
  const latSev = latencySeverity(summary?.avgLatency ?? null)
  const lossSev = lossSeverity(summary?.windowLoss ?? null)
  return (
    <a data-node-id={node.id} href={`${statsUrl(node.id)}?tab=quality&hours=${hours}`} className="surface-card block p-4 transition-shadow hover:shadow-lg">
      <div className="flex items-center gap-2">
        <Flag code={node.country} title={node.country} />
        <span className={`truncate text-sm font-semibold ${node.online ? "" : "text-secondary"}`}>{node.name}</span>
        {!node.online && <span className="ml-auto rounded bg-error/15 px-1.5 py-0.5 text-[10px] font-medium text-error">离线</span>}
      </div>
      {message && <p className="mt-2 text-xs text-secondary">{message}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-secondary">有效桶延迟均值</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: summary?.avgLatency != null ? SEV_HEX[latSev] : undefined }}>
            {summary?.avgLatency != null ? summary.avgLatency.toFixed(0) : "--"}<span className="ml-0.5 text-xs font-medium text-secondary">ms</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-secondary">目标平均丢包率</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: summary?.windowLoss != null ? SEV_HEX[lossSev] : undefined }}>
            {summary?.windowLoss != null ? summary.windowLoss.toFixed(1) : "--"}<span className="ml-0.5 text-xs font-medium text-secondary">%</span>
          </div>
        </div>
      </div>
      {summary?.estimatedLoss && <p className="mt-2 text-xs text-secondary">丢包为桶均值估算</p>}
      <div className="mt-3">
        <MiniChart kind="latency" points={summary?.bars ?? EMPTY_BARS} />
      </div>
    </a>
  )
}

function Chip({ label, value, tone }: { label: string; value: string; tone: "primary" | "success" | "info" | "warning" }) {
  const cls = { primary: "text-accent border-accent/30", success: "text-success border-success/30 bg-success/10",
    info: "text-info border-info/30", warning: "text-warning border-warning/30 bg-warning/10" }[tone]
  return (
    <div className={`rounded-lg px-2 py-1 text-left ${cls}`}>
      <div className="text-[11px] opacity-80">{label}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
    </div>
  )
}

const SEV_HEX: Record<string, string> = {
  excellent: "#22c55e", good: "#4ade80", fair: "#facc15", poor: "#fb923c", bad: "#f87171",
  offline: "var(--secondary-text-color)",
}

function avgOf(values: (number | null)[]): number | null {
  const list = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (!list.length) return null
  return list.reduce((a, b) => a + b, 0) / list.length
}

function successOf(list: (QualitySummary | null)[]): number | null {
  const measured = list.filter((s): s is QualitySummary => !!s && s.success !== null)
  const targets = measured.reduce((sum, s) => sum + s.targets, 0)
  return targets ? measured.reduce((sum, s) => sum + s.success! * s.targets, 0) / targets : null
}
