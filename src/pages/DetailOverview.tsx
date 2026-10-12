import { useCallback, useMemo, useSyncExternalStore } from "react"
import { HistoryNotice } from '@/components/HistoryNotice'
import { TrafficQuota } from "@/components/TrafficQuota"
import { estimateTraffic, sampleStep, toMbps } from "@/lib/traffic"
import { Echart, chartBase, tooltipBase } from "@/components/Echart"
import { Flag } from "@/lib/flags"
import type { MetricsPoint, Node } from "@/lib/api"
import { bytes, cycleLabel, percent, platformOf } from "@/lib/format"

/**
 * 概况标签：紧凑身份与资源指标、负载及带宽趋势，完整统计直接展示。
 */

const ACCENT = "#3b82f6"
const MEM_COLOR = "#a855f7"
const DOWN_COLOR = "#34d399"
const UP_COLOR = "#3b82f6"
const DISK_COLOR = "#eab308"
const cpuSample = (point: MetricsPoint) => point.cpu

export function Overview({ node, history, dark, hours, points, onRefresh }: {
  node: Node
  history: { metrics: MetricsPoint[]; loading: boolean; error: string | null; stale: boolean; retained: boolean }
  onRefresh: () => void
  dark: boolean
  hours: number
  points: number
}) {
  // History options depend on samples and capacities, not two-second live metrics.
  const metrics = history.metrics
  const memTotal = node.mem_total
  const diskTotal = node.disk_total
  const load = useMemo(() => loadOption(metrics, dark, memTotal), [metrics, dark, memTotal])
  const bandwidth = useMemo(() => bandOption(metrics, dark), [metrics, dark])
  const step = sampleStep(hours, points)
  const traffic = useMemo(() => trafficOption(metrics, dark, step), [metrics, dark, step])
  const disk = useMemo(() => diskOption(metrics, dark, diskTotal), [metrics, dark, diskTotal])
  const memorySample = useCallback((point: MetricsPoint) => memTotal > 0 ? (point.mem_used / memTotal) * 100 : null, [memTotal])
  const diskSample = useCallback((point: MetricsPoint) => diskTotal > 0 ? (point.disk_used / diskTotal) * 100 : null, [diskTotal])
  const rangeLabel = hours === 168 ? "近7天" : `近${hours}小时`
  const m = node.metrics
  const cpuPct = m ? Math.min(100, m.cpu) : null
  const memPct = m && node.mem_total > 0 ? (m.mem_used / node.mem_total) * 100 : null
  const diskPct = m && node.disk_total > 0 ? (m.disk_used / node.disk_total) * 100 : null
  const platform = platformOf(node.os, node.virt)
  const monthUsed = node.month_used ?? node.month_rx + node.month_tx
  const swappable = node.swap_total > 0

  const uptimeDays = m && m.uptime > 0 ? Math.floor(m.uptime / 86400) : null

  return (
    <div className="space-y-4">
      <section className="surface-card overview-identity flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <Flag code={node.country} title={node.country} />
          <h1 className="truncate text-base font-bold">{node.name}</h1>
          <span className={`text-xs ${node.online ? "text-success" : "text-error"}`}>{node.online ? "在线" : "离线"}</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-secondary">
          {node.group && <span>{node.group}</span>}
          {uptimeDays !== null && <span>运行 {uptimeDays}天</span>}
          {node.expires_at && <span>到期 {node.expires_at}</span>}
        </div>
        <div className="w-full text-xs text-secondary">
          <h2 className="mb-2 font-medium">系统与计费信息</h2>
          <p className="pb-2 break-words">{node.os || (platform === "unknown" ? "未知系统" : platform)} {node.arch} {node.virt}</p>
          {node.price > 0 && <p className="pb-2">{node.price.toFixed(2)} {node.currency} / {cycleLabel(node.billing_cycle)}</p>}
        </div>
      </section>

      <HistoryNotice status={{loading:history.loading, failed:!!history.error, stale:history.stale, retained:history.retained}} onRefresh={onRefresh} />
      {!history.loading && !history.error && history.retained && history.metrics.length === 0 && <p className="text-xs text-secondary">当前时间范围没有资源样本</p>}
      {/* 四张统计卡 */}
      <div className="overview-metrics grid grid-cols-2 gap-3 xl:grid-cols-4">
        <GaugeCard icon="ti-cpu" title="处理器" head={node.cpu_cores ? `${node.cpu_cores} 核心` : ""}>
          <GaugeBody value={cpuPct} unit="%" color={ACCENT}
            sub={node.cpu_name || "使用率"} />
          <SparkFooter points={history.metrics} pick={cpuSample} format={(v) => `${v.toFixed(0)}%`}
            leftLabel={rangeLabel} right={m ? `Load ${m.load.map((l) => l.toFixed(2)).join(" ")}` : ""} />
        </GaugeCard>

        <GaugeCard icon="ti-device-sd-card" title="内存" head={node.mem_total ? `总量 ${bytes(node.mem_total)}` : ""}>
          <GaugeBody value={memPct} unit="% RAM" color={ACCENT}
            sub={m ? `已用 ${bytes(m.mem_used)}` : undefined}>
            {m && swappable && (
              <div className="text-xs text-secondary">
                Swap <span className="font-semibold text-warning">{percent((m.swap_used / node.swap_total) * 100, 0)}</span>{" "}
                {bytes(m.swap_used)} / {bytes(node.swap_total)}
              </div>
            )}
          </GaugeBody>
          <SparkFooter points={history.metrics} pick={memorySample}
            format={(v) => `${v.toFixed(0)}%`} leftLabel={rangeLabel}
            right={m ? `可用 ${bytes(node.mem_total - m.mem_used)}` : ""} />
        </GaugeCard>

        <GaugeCard icon="ti-database" title="硬盘" head={node.disk_total ? `总量 ${bytes(node.disk_total)}` : ""}>
          <GaugeBody value={diskPct} unit="%" color={DISK_COLOR}
            sub={m ? `已用 ${bytes(m.disk_used)}` : undefined} />
          <SparkFooter points={history.metrics} pick={diskSample}
            format={(v) => `${v.toFixed(0)}%`} leftLabel={rangeLabel} right={m ? `可用 ${bytes(node.disk_total - m.disk_used)}` : ""}
            color={DISK_COLOR} area />
        </GaugeCard>

        <GaugeCard icon="ti-arrows-exchange" title="网络流量" head={
          node.traffic_limit > 0 ? "限量" : "实时速率"
        }>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 w-full space-y-1.5">
              <div className="flex items-center justify-between gap-2 rounded-md bg-accent-soft px-2.5 py-1.5">
                <span className="text-xs text-secondary">下载</span>
                <span className="text-sm font-bold tabular-nums text-success">
                  {m ? toMbps(m.net_rx).toFixed(2) : "--"}<span className="text-[10px]">Mbps</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-md bg-accent-soft px-2.5 py-1.5">
                <span className="text-xs text-secondary">上传</span>
                <span className="text-sm font-bold tabular-nums text-info">
                  {m ? toMbps(m.net_tx).toFixed(2) : "--"}<span className="text-[10px]">Mbps</span>
                </span>
              </div>
            </div>
          </div>
          <div className="mt-3 border-t border-line pt-2">
            <TrafficQuota used={monthUsed} limit={node.traffic_limit} />
          </div>
        </GaugeCard>
      </div>

      {/* 负载详情 + 带宽监控 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard icon="ti-gauge" title="负载详情">
          <p className="text-xs text-secondary">{rangeLabel}负载趋势；当前负载见上方概况。</p>
          <Echart label={`负载详情，最近 ${hours} 小时`} className="h-72 w-full"
            option={load} />
        </ChartCard>
        <ChartCard icon="ti-router" title="带宽监控">
          <p className="text-xs text-secondary">{rangeLabel}下载与上传速率（Mbps）；当前速率见上方网络流量。</p>
          <Echart label={`带宽监控，最近 ${hours} 小时`} className="h-72 w-full"
            option={bandwidth} />
        </ChartCard>
      </div>

      {/* 流量统计 */}
      <ChartCard icon="ti-chart-bar" title="区间流量估算">
        <p className="mb-2 text-xs text-secondary">依据桶平均速率估算，缺失区间未计入</p>
        <Echart label={`区间流量估算，最近 ${hours} 小时，缺失区间未计入`} className="h-72 w-full" option={traffic} />
      </ChartCard>

      <ChartCard icon="ti-plug-connected" title="连接数与累计流量">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="inner-card p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-accent">
              <i className="ti ti-plug-connected" aria-hidden />连接数
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-secondary">TCP 连接</div>
                <div className="text-2xl font-bold tabular-nums">{m ? m.tcp : "--"}</div>
              </div>
              <div>
                <div className="text-xs text-secondary">UDP 连接</div>
                <div className="text-2xl font-bold tabular-nums">{m ? m.udp : "--"}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-xs text-secondary">
              <span>进程数</span>
              <span className="font-semibold text-main">{m ? m.procs : "--"}</span>
            </div>
          </div>
          <div className="inner-card p-4">
            <h3 className="text-sm font-semibold">全部网络接口汇总</h3>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded-md bg-accent-soft px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-2"><i className="ti ti-arrow-down text-success" aria-hidden />下载</span>
                <span className="font-bold tabular-nums text-success">{bytes(node.total_rx)}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-accent-soft px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-2"><i className="ti ti-arrow-up text-info" aria-hidden />上传</span>
                <span className="font-bold tabular-nums text-info">{bytes(node.total_tx)}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-hover px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-2"><i className="ti ti-arrows-exchange" aria-hidden />总流量</span>
                <span className="font-bold tabular-nums">{bytes(node.total_rx + node.total_tx)}</span>
              </div>
            </div>
          </div>
        </div>
      </ChartCard>

      <ChartCard icon="ti-database" title="硬盘使用详情">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">磁盘总体使用</span>
                <span className="font-bold text-success">{percent(diskPct, 0)}</span>
              </div>
              <div className="progress-track mt-1.5">
                <div className="progress-fill fill-disk" style={{ width: `${diskPct ?? 0}%` }} />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-secondary">
                <span>{m ? `${bytes(m.disk_used)} / ${bytes(node.disk_total)}` : "--"}</span>
                <span>可用 {m ? bytes(node.disk_total - m.disk_used) : "--"}</span>
              </div>
            </div>
            <div className="border-t border-line pt-2 text-xs text-secondary">
              磁盘 I/O：暂无采集数据
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-secondary">
              <span className="font-medium text-main">使用率历史</span>
              <span>{rangeLabel}</span>
            </div>
            <Echart label={`磁盘使用率历史，最近 ${hours} 小时`} className="h-52 w-full" option={disk} />
          </div>
        </div>
      </ChartCard>
    </div>
  )
}

function GaugeCard({ icon, title, head, children }: {
  icon: string
  title: string
  head?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="surface-card metric-card flex flex-col p-3">
      <header className="metric-heading mb-2 flex flex-wrap items-center justify-between gap-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <i className={`ti ${icon} text-sm`} aria-hidden />
          </span>
          {title}
        </h2>
        {head && <span className="text-xs text-secondary">{head}</span>}
      </header>
      {children}
    </section>
  )
}

function GaugeBody({ value, unit, color, sub, children }: {
  value: number | null
  unit: string
  color: string
  sub?: React.ReactNode
  children?: React.ReactNode
}) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  return (
    <div className="space-y-1">
      <div className="min-w-0">
        <div className="text-3xl font-bold tabular-nums">
          {value === null ? "--" : value.toFixed(0)}
          <span className="ml-1 text-xs font-medium text-secondary">{unit}</span>
        </div>
        {sub && <div className="mt-1 truncate text-xs text-secondary">{sub}</div>}
        {children}
      </div>
      <div className="progress-track mt-2" aria-hidden>
        <div className="progress-fill" style={{width: `${pct}%`, background: color}} />
      </div>
    </div>
  )
}

const WIDE_SCREEN = '(min-width: 768px)'
const isWideScreen = () => typeof matchMedia === 'undefined' || matchMedia(WIDE_SCREEN).matches
function subscribeWideScreen(notify: () => void) {
  if (typeof matchMedia === 'undefined') return () => {}
  const media = matchMedia(WIDE_SCREEN)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}

function SparkFooter({ points, pick, format, leftLabel, right, color = ACCENT, area = false }: {
  points: MetricsPoint[]
  pick: (p: MetricsPoint) => number | null
  format: (v: number) => string
  leftLabel: string
  right?: string
  color?: string
  area?: boolean
}) {
  const wideScreen = useSyncExternalStore(subscribeWideScreen, isWideScreen, () => true)
  const data = points
  const option = useMemo(() => ({
    grid: { left: 0, right: 0, top: 2, bottom: 0 },
    xAxis: { type: "category", show: false, data: data.map((_, i) => i) },
    yAxis: { type: "value", show: false },
    series: [{
      type: "line", data: data.map(pick), smooth: true, showSymbol: false,
      lineStyle: { color, width: 1.5 },
      areaStyle: area ? { color: `${color}22` } : { color: `${color}14` },
    }],
  }), [data, pick, color, area])
  if (!wideScreen) return null
  const latest = data.length ? pick(data[data.length - 1]) : null
  return (
    <div className="metric-spark mt-2 border-t border-line pt-2">
      <div className="flex items-center justify-between text-[11px] text-secondary">
        <span className="inline-flex items-center gap-1">
          {leftLabel} <i className="ti ti-refresh text-[10px]" aria-hidden />
        </span>
        {right && <span>{right}</span>}
      </div>
      <div className="mt-1 h-9 w-full">
        {data.length > 1 && (
          <Echart label={`${leftLabel}趋势，最新 ${latest === null ? "无数据" : format(latest)}`} className="h-9 w-full" option={option} />
        )}
      </div>
      <div className="text-right text-[11px] tabular-nums text-secondary">
        {latest === null ? "--" : format(latest)}
      </div>
    </div>
  )
}

function ChartCard({ icon, title, extra, children }: {
  icon: string
  title: string
  extra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="surface-card p-4">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <i className={`ti ${icon} text-accent`} aria-hidden />{title}
        </h2>
        {extra}
      </header>
      {children}
    </section>
  )
}

function tsLabel(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
}

function loadOption(points: MetricsPoint[], dark: boolean, memTotal: number) {
  const base = chartBase(dark)
  const data = points
  return {
    tooltip: tooltipBase(),
    legend: { top: 0, textStyle: { color: dark ? "#a0a0a0" : "#475569", fontSize: 12 } },
    grid: { left: 44, right: 12, top: 30, bottom: 26 },
    xAxis: { type: "category", data: data.map((p) => tsLabel(p.ts)), axisLabel: base.axisLabel, axisLine: base.axisLine },
    yAxis: { type: "value", max: 100, axisLabel: { ...base.axisLabel, formatter: "{value}%" }, splitLine: base.splitLine },
    series: [
      { name: "CPU", type: "line", smooth: true, showSymbol: false, data: data.map((p) => p.cpu),
        lineStyle: { color: ACCENT, width: 1.5 }, itemStyle: { color: ACCENT },
        areaStyle: { color: `${ACCENT}18` } },
      { name: "内存", type: "line", smooth: true, showSymbol: false,
        data: data.map((p) => memTotal > 0 ? (p.mem_used / memTotal) * 100 : null),
        lineStyle: { color: MEM_COLOR, width: 1.5 }, itemStyle: { color: MEM_COLOR },
        areaStyle: { color: `${MEM_COLOR}18` } },
    ],
  }
}

function bandOption(points: MetricsPoint[], dark: boolean) {
  const base = chartBase(dark)
  return {
    tooltip: tooltipBase(),
    legend: { top: 0, textStyle: { color: dark ? "#a0a0a0" : "#475569", fontSize: 12 } },
    grid: { left: 44, right: 12, top: 30, bottom: 26 },
    xAxis: { type: "category", data: points.map((p) => tsLabel(p.ts)), axisLabel: base.axisLabel, axisLine: base.axisLine },
    yAxis: { type: "value", axisLabel: { ...base.axisLabel, formatter: "{value} Mbps" }, splitLine: base.splitLine },
    series: [
      { name: "下行", type: "line", smooth: true, showSymbol: false, data: points.map((p) => p.net_rx / 125_000),
        lineStyle: { color: DOWN_COLOR, width: 1.5 }, itemStyle: { color: DOWN_COLOR },
        areaStyle: { color: `${DOWN_COLOR}20` } },
      { name: "上行", type: "line", smooth: true, showSymbol: false, data: points.map((p) => p.net_tx / 125_000),
        lineStyle: { color: UP_COLOR, width: 1.5 }, itemStyle: { color: UP_COLOR },
        areaStyle: { color: `${UP_COLOR}20` } },
    ],
  }
}

export function trafficOption(points: MetricsPoint[], dark: boolean, stepSeconds: number) {
  const intervals = estimateTraffic(points, stepSeconds)
  const down = intervals.map(p => [p.end * 1000, p.rx])
  const up = intervals.map(p => [p.end * 1000, p.tx])
  const base = chartBase(dark)
  return {
    tooltip: { ...tooltipBase(), formatter: (params: { dataIndex: number }[]) => {
      const interval = intervals[params[0]?.dataIndex]
      if (!interval) return ""
      const time = (ts: number) => new Date(ts * 1000).toLocaleString("zh-CN")
      const volume = (v: number | null) => v === null ? "缺失区间未计入" : `${bytes(v)}（${v.toLocaleString("zh-CN")} bytes）`
      return `${time(interval.start)} — ${time(interval.end)}<br/>估算 · 入站 ${volume(interval.rx)}<br/>估算 · 出站 ${volume(interval.tx)}`
    } },
    legend: { top: 0, textStyle: { color: dark ? "#a0a0a0" : "#475569", fontSize: 12 } },
    grid: { left: 56, right: 12, top: 30, bottom: 26 },
    xAxis: { type: "time", axisLabel: base.axisLabel, axisLine: base.axisLine },
    yAxis: { type: "value", axisLabel: { ...base.axisLabel, formatter: (v: number) => bytes(v) }, splitLine: base.splitLine },
    series: [
      { name: "入站", type: "bar", stack: "t", data: down, itemStyle: { color: DOWN_COLOR } },
      { name: "出站", type: "bar", stack: "t", data: up, itemStyle: { color: UP_COLOR } },
    ],
  }
}

function diskOption(points: MetricsPoint[], dark: boolean, diskTotal: number) {
  const base = chartBase(dark)
  return {
    tooltip: tooltipBase(),
    legend: { show: false },
    grid: { left: 44, right: 12, top: 12, bottom: 22 },
    xAxis: { type: "category", data: points.map((p) => tsLabel(p.ts)), axisLabel: base.axisLabel, axisLine: base.axisLine },
    yAxis: { type: "value", max: 100, axisLabel: { ...base.axisLabel, formatter: "{value}%" }, splitLine: base.splitLine },
    series: [{
      name: "磁盘总体使用", type: "line", smooth: true, showSymbol: false,
      data: points.map((p) => diskTotal > 0 ? (p.disk_used / diskTotal) * 100 : null),
      lineStyle: { color: DISK_COLOR, width: 1.5 }, itemStyle: { color: DISK_COLOR },
      areaStyle: { color: `${DISK_COLOR}22` },
    }],
  }
}
