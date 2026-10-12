/** 数值与文案的统一换算，口径与 DStatus 卡片一致。 */

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"]

export function bytes(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return "--"
  let v = value
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  const d = i === 0 ? 0 : v >= 100 ? digits > 0 && v < 1000 ? 1 : 0 : digits
  return `${v.toFixed(v >= 100 ? 1 : d)}${UNITS[i]}`
}

/** 月度流量（GB 口径的展示），与卡片上 `50.3GB / ∞` 一致。 */
export function traffic(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return "--"
  const gb = value / 1024 ** 3
  if (gb >= 1024) return `${(gb / 1024).toFixed(2)}TB`
  if (gb >= 100) return `${Math.round(gb)}GB`
  return `${gb.toFixed(1)}GB`
}

export function mbps(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return "--"
  if (value >= 1000) return `${(value / 1000).toFixed(2)}G`
  return value.toFixed(2)
}

export function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--"
  return `${value.toFixed(value >= 100 ? 0 : digits)}%`
}

export function diskPercent(used: number | undefined, total: number | undefined): number {
  if (!used || !total || total <= 0) return 0
  return Math.min(100, (used / total) * 100)
}

/** 在线时长：38天 / 12小时 / 5分钟。 */
export function uptime(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "--"
  const days = Math.floor(seconds / 86400)
  if (days >= 1) return `${days}天`
  const hours = Math.floor(seconds / 3600)
  if (hours >= 1) return `${hours}小时`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}分钟`
}

/** 到期展示：已过期 / 剩余 X天 / 日期。 */
export function expiry(expiresIn: number | null | undefined, expiresAt: string | null | undefined): string {
  if (expiresIn === null || expiresIn === undefined || !expiresAt) return "--"
  if (expiresIn < 0) return "已过期"
  if (expiresIn <= 31) return `${expiresIn}天`
  return expiresAt
}

export type ExpiryLevel = "expired" | "soon" | "ok" | "none"

export function expiryLevel(expiresIn: number | null | undefined, has: boolean): ExpiryLevel {
  if (!has || expiresIn === null || expiresIn === undefined) return "none"
  if (expiresIn < 0) return "expired"
  if (expiresIn <= 7) return "soon"
  return "ok"
}

/** 延迟与丢包的分级配色，与迷你竖条图共用。 */
export type Severity = "excellent" | "good" | "fair" | "poor" | "bad" | "offline"

export function latencySeverity(ms: number | null | undefined): Severity {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "offline"
  if (ms <= 60) return "excellent"
  if (ms <= 120) return "good"
  if (ms <= 200) return "fair"
  if (ms <= 350) return "poor"
  return "bad"
}

export function lossSeverity(loss: number | null | undefined): Severity {
  if (loss === null || loss === undefined || !Number.isFinite(loss)) return "offline"
  if (loss <= 0.5) return "excellent"
  if (loss <= 2) return "good"
  if (loss <= 5) return "fair"
  if (loss <= 15) return "poor"
  return "bad"
}

export const SEVERITY_COLOR: Record<Severity, string> = {
  excellent: "#22c55e",
  good: "#4ade80",
  fair: "#facc15",
  poor: "#fb923c",
  bad: "#f87171",
  offline: "var(--hover-bg-color)",
}

/** 系统图标：按 agent 报告的 os 字符串粗分。 */
export type Platform = "windows" | "linux" | "bsd" | "darwin" | "unknown"

export function platformOf(os: string | undefined, virt: string | undefined): Platform {
  const text = `${os ?? ""} ${virt ?? ""}`.toLowerCase()
  if (text.includes("win")) return "windows"
  if (text.includes("darwin") || text.includes("macos") || text.includes("ios")) return "darwin"
  if (text.includes("bsd") || text.includes("freebsd") || text.includes("openbsd")) return "bsd"
  if (text.includes("linux") || text.includes("debian") || text.includes("ubuntu") || text.includes("centos")
    || text.includes("alpine") || text.includes("arch") || text.includes("fedora") || os) return "linux"
  return "unknown"
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  windows: "Windows",
  linux: "Linux",
  bsd: "BSD",
  darwin: "macOS",
  unknown: "未知系统",
}

/** 计费周期文案。 */
export function cycleLabel(cycle: string | undefined): string {
  switch ((cycle ?? "").toLowerCase()) {
    case "monthly": return "月付"
    case "quarterly": return "季付"
    case "semiannually": return "半年付"
    case "yearly": return "年付"
    case "daily": return "日付"
    case "hourly": return "时付"
    case "onetime": return "一次性"
    default: return cycle || ""
  }
}

/** 流量重置日描述。 */
export function resetLabel(day: number | undefined): string {
  if (!day) return ""
  if (day === 1) return "每月 1 号"
  return `每月 ${day} 号`
}

/** 详情页 URL：/stats/{id}/，与 DStatus 的路径形状一致。 */
export function statsUrl(id: number): string {
  return `/stats/${id}/`
}
