import { MobileDisclosure } from "@/components/MobileDisclosure"
import type { ReactNode } from "react"
import { Dropdown } from "@/components/ui"
import type { Node } from "@/lib/api"
import { mbps, traffic } from "@/lib/format"
import type { Config } from "@/lib/appearance"

export type ExpiryFilter = "all" | "expired" | "d7" | "d30"

/** 左：节点情况（总数/在线/离线 + 到期筛选）；右：网络情况（全网速率 + 累计流量）。 */
export function SummaryCards({ nodes, config, onStatus, status, compactMobile=false, regionContent }: {
  compactMobile?: boolean
  regionContent?: ReactNode
  nodes: Node[]
  config: Config
  status: "all" | "online" | "offline"
  onStatus: (v: "all" | "online" | "offline") => void
}) {
  const total = nodes.length
  const online = nodes.filter((n) => n.online).length
  const offline = total - online

  const sumRx = nodes.reduce((acc, n) => acc + (n.online && n.metrics ? n.metrics.net_rx : 0), 0) / 125_000
  const sumTx = nodes.reduce((acc, n) => acc + (n.online && n.metrics ? n.metrics.net_tx : 0), 0) / 125_000
  const totalRx = nodes.reduce((acc, n) => acc + n.total_rx, 0)
  const totalTx = nodes.reduce((acc, n) => acc + n.total_tx, 0)
  const capacity = config.capacity_mbps > 0 ? config.capacity_mbps : 1000
  const capLabel = capacity >= 1000 ? `${capacity / 1000}G` : `${capacity}M`

  return (
    <div className={`summary-grid grid gap-4 md:grid-cols-2 ${compactMobile ? "compact-mobile" : ""}`}>
      <section className="surface-card node-summary p-4">
        <header className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft">
              <i className="ti ti-dashboard text-sm text-accent" aria-hidden />
            </span>
            节点情况
          </h2>
        </header>
        <div className="mt-3 grid grid-cols-3">
          <StatButton big={String(total)} label="总节点" icon="ti-dashboard" tone="primary"
            pressed={status === "all"} onClick={() => onStatus("all")} />
          <StatButton big={String(online)} label="在线节点" icon="ti-circle-check" tone="success"
            pressed={status === "online"} onClick={() => onStatus("online")} />
          <StatButton big={String(offline)} label="离线节点" icon="ti-circle-x" tone="error"
            pressed={status === "offline"} onClick={() => onStatus("offline")} />
        </div>
      </section>

      {config.show_network && (
        <MobileDisclosure label="网络汇总"><section className="surface-card p-4">
          <header className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft">
                <i className="ti ti-wifi text-sm text-accent" aria-hidden />
              </span>
              网络情况
            </h2>
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-success">
                <i className="ti ti-download text-xs" aria-hidden />{traffic(totalRx)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-info">
                <i className="ti ti-upload text-xs" aria-hidden />{traffic(totalTx)}
              </span>
            </div>
          </header>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <SpeedGauge icon="ti-download" value={sumRx} capacity={capacity} capLabel={capLabel} tone="success" />
            <SpeedGauge icon="ti-upload" value={sumTx} capacity={capacity} capLabel={capLabel} tone="info" />
          </div>
        </section></MobileDisclosure>
      )}
      {regionContent && <div className="region-disclosure"><MobileDisclosure label="地区与地图">{regionContent}</MobileDisclosure></div>}
    </div>
  )
}

export function ExpiryDropdown({ value, onChange, nodes }: {
  value: ExpiryFilter
  onChange: (v: ExpiryFilter) => void
  nodes: Node[]
}) {
  // 徽标跟随当前档位：全部时给出"即将到期"的注意力提示，其余档位显示命中数。
  const countIn = (lo: number, hi: number) =>
    nodes.filter((n) => n.expires_in !== null && n.expires_in !== undefined && n.expires_in >= lo && n.expires_in <= hi).length
  const count = { all: countIn(0, 30), expired: countIn(-9999, -1), d7: countIn(0, 7), d30: countIn(0, 30) }[value]
  const label = { all: "到期", expired: "已过期", d7: "7 天内", d30: "30 天内" }[value]
  return (
    <Dropdown label={`到期：${value === "all" ? "全部节点" : label}`} align="right" button={() => (
      <span className="pill min-h-11 min-w-11">
        <i className="ti ti-calendar-event text-xs text-secondary" aria-hidden />
        {label}
        {count > 0 && <span className="pill-badge" title={`该范围内 ${count} 个节点`}>{count}</span>}
        <i className="ti ti-chevron-down text-xs text-secondary" aria-hidden />
      </span>
    )}>
      {(close) => (
        <>
          {([["all", "全部节点"], ["expired", "已过期"], ["d7", "7 天内到期"], ["d30", "30 天内到期"]] as const).map(([v, l]) => (
            <button key={v} className={`dropdown-item ${value === v ? "active" : ""}`}
              onClick={() => { onChange(v); close() }}>{l}</button>
          ))}
        </>
      )}
    </Dropdown>
  )
}

function StatButton({ big, label, icon, tone, onClick, pressed }: {
  big: string
  label: string
  icon: string
  tone: "primary" | "success" | "error"
  onClick: () => void
  pressed: boolean
}) {
  const toneClass = { primary: "text-accent", success: "text-success", error: "text-error" }[tone]
  return (
    <button aria-pressed={pressed} onClick={onClick}
      className="group flex flex-col items-center gap-1 rounded-lg py-2 transition-colors hover:bg-hover">
      <span className={`text-2xl font-bold tabular-nums ${toneClass}`}>{big}</span>
      <span className="flex items-center gap-1 text-xs text-secondary">
        <i className={`ti ${icon} text-xs`} aria-hidden />{label}
      </span>
    </button>
  )
}

function SpeedGauge({ icon, value, capacity, capLabel, tone }: {
  icon: string
  value: number
  capacity: number
  capLabel: string
  tone: "success" | "info"
}) {
  const pct = Math.min(100, (value / capacity) * 100)
  const toneClass = tone === "success" ? "text-success" : "text-info"
  const fillClass = tone === "success" ? "fill-cpu" : "fill-mem"
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <i className={`ti ${icon} md-14 text-secondary`} aria-hidden />
        <span className={`text-xl font-bold tabular-nums ${toneClass}`}>
          {mbps(value)}<span className="ml-1 text-xs font-medium">Mbps</span>
        </span>
      </div>
      <div className="progress-track mt-2">
        <div className={`progress-fill ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-right text-[11px] text-secondary">{capLabel}</div>
    </div>
  )
}
